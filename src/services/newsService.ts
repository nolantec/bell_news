/**
 * 新闻数据类型定义
 */
export interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source?: string;
  description?: string;
  imageUrl?: string;
  lang: 'zh' | 'en';
}

/**
 * 分类新闻结果（兼容旧接口，内部使用）
 */
export interface CategorizedNews {
  domestic: NewsItem[];
  international: NewsItem[];
}

/**
 * 新闻区域参数
 */
interface NewsLocale {
  hl: string;
  gl: string;
  ceid: string;
}

/**
 * 清理 HTML 标签和实体，提取纯文本
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HTML 实体解码
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * 解析 Google News RSS XML
 */
function parseGoogleRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];

    const titleMatch =
      content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      content.match(/<title>(.*?)<\/title>/);
    const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

    const linkMatch = content.match(/<link>(.*?)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : '';

    const pubDateMatch = content.match(/<pubDate>(.*?)<\/pubDate>/);
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();

    const sourceMatch = content.match(/<source[^>]*>(.*?)<\/source>/);
    const source = sourceMatch ? decodeHtmlEntities(sourceMatch[1].trim()) : undefined;

    // 标题中去掉来源后缀 " - 来源名"
    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }

    // 描述纯文本（先解码实体，再清除标签）
    const descMatch =
      content.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
      content.match(/<description>(.*?)<\/description>/);
    const description = descMatch
      ? stripHtml(decodeHtmlEntities(descMatch[1])).slice(0, 200)
      : undefined;

    if (title && link) {
      items.push({ title, link, pubDate, source, description, lang: 'zh' });
    }
  }

  return items;
}

/**
 * 从 Google News RSS 抓取新闻（区域参数化）
 */
async function fetchGoogleNews(
  keyword: string,
  locale: NewsLocale
): Promise<NewsItem[]> {
  const query = encodeURIComponent(keyword);
  const url = `https://news.google.com/rss/search?q=${query}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google News 抓取失败: ${response.status}`);
    }

    const xml = await response.text();

    if (!xml.includes('<item>')) {
      throw new Error('Google News 返回数据为空');
    }

    return parseGoogleRss(xml);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 共享处理管道：抓取 → 去重 → 排序 → 时间过滤 → 切片 → 补图 → 解析真实链接
 */
async function fetchAndProcessChannel(
  keywords: readonly string[],
  locale: NewsLocale,
  maxCount: number,
  channelLabel: string,
  timeWindowHours = 48,
  lang: 'zh' | 'en' = 'zh'
): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  const now = new Date();
  const timeWindowAgo = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);

  console.log(`[${channelLabel}] 关键词: ${keywords.join(', ')}`);

  // 并行抓取所有关键词
  const fetchTasks = keywords.map((keyword) =>
    fetchGoogleNews(keyword, locale).catch((err) => {
      console.error(`[${channelLabel}] 关键词 [${keyword}] 抓取失败:`, err.message);
      return [] as NewsItem[];
    })
  );

  const results = await Promise.all(fetchTasks);

  for (const items of results) {
    allNews.push(...items);
  }

  // 去重（关键词重叠 > 60% 视为重复）
  const seenWords: string[][] = [];
  const uniqueNews = allNews.filter((item) => {
    const words = item.title
      .replace(/[【】\[\]（）()\d+.\s,-:：、，。！？\-\/&|]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const isDup = seenWords.some((existing) => {
      const overlap = words.filter((w) => existing.includes(w)).length;
      const minLen = Math.min(words.length, existing.length);
      return minLen > 0 && overlap / minLen > 0.6;
    });
    if (!isDup) {
      seenWords.push(words);
      return true;
    }
    return false;
  });

  // 按时间倒序
  uniqueNews.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  // 时间窗口过滤 + 兜底
  let recentNews = uniqueNews.filter((item) => item.pubDate >= timeWindowAgo);
  if (recentNews.length === 0 && uniqueNews.length > 0) {
    console.log(
      `[${channelLabel}] 过去${timeWindowHours}小时内无新闻，使用最新 ${Math.min(maxCount, uniqueNews.length)} 条`
    );
    recentNews = uniqueNews;
  }

  // 取前 N 条
  const topNews = recentNews.slice(0, maxCount);
  console.log(`[${channelLabel}] 抓取到 ${topNews.length} 条新闻`);

  // 链接策略：中文百度、英文 Bing
  for (const item of topNews) {
    item.lang = lang;
    if (lang === 'zh') {
      item.link = `https://www.baidu.com/s?wd=${encodeURIComponent(item.title)}`;
    } else {
      item.link = `https://cn.bing.com/search?q=${encodeURIComponent(item.title)}`;
    }
  }

  return topNews;
}

/**
 * 获取合并后的统一新闻列表（国内 + 国际去重归并）
 */
export async function getUnifiedNews(
  domesticKeywords: readonly string[],
  intlKeywords: readonly string[],
  domesticLocale: NewsLocale,
  intlLocale: NewsLocale,
  domesticMax: number,
  intlMax: number,
  totalMax = 10
): Promise<NewsItem[]> {
  const [domestic, international] = await Promise.all([
    fetchAndProcessChannel(domesticKeywords, domesticLocale, domesticMax, '国内', 48, 'zh'),
    fetchAndProcessChannel(intlKeywords, intlLocale, intlMax, '国际', 720, 'en'),
  ]);

  // 合并去重（关键词重叠 > 60% 视为重复）
  const all = [...domestic, ...international];
  const merged: NewsItem[] = [];
  const seenTitles: string[][] = [];

  for (const item of all) {
    const words = item.title
      .replace(/[【】\[\]（）()\d+.\s,-:：、，。！？\-\/&|]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    // 检查与已有标题的重叠度
    const isDup = seenTitles.some((existingWords) => {
      const overlap = words.filter((w) => existingWords.includes(w)).length;
      const minLen = Math.min(words.length, existingWords.length);
      return minLen > 0 && overlap / minLen > 0.6;
    });

    if (!isDup) {
      seenTitles.push(words);
      merged.push(item);
    } else {
      console.log(`  [去重] 跳过重复: ${item.title.slice(0, 40)}...`);
    }
  }

  // 按时间排序，取前 N
  merged.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  const top = merged.slice(0, totalMax);

  console.log(`合并后共 ${top.length} 条新闻 (国内源 ${domestic.length} + 国际源 ${international.length})`);
  return top;
}
