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

// 时间窗：只取窗口内的新闻。
// 国内原为 48h，实测 6 个关键词合计仅约 6 条候选，低于质检阈值 8 条，
// 会导致「新闻条数不足」而整天不发送。放宽到 72h 后候选约 19 条，余量充足。
const DOMESTIC_TIME_WINDOW_HOURS = 72;
// 国际源供给充足，保持 30 天窗口
const INTL_TIME_WINDOW_HOURS = 720;

/**
 * 把标题切成用于判重的词元（去标点、丢弃单字）
 */
function titleTokens(title: string): string[] {
  return title
    .replace(/[【】\[\]（）()\d+.\s,-:：、，。！？\-\/&|]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * 两组词元重叠 > 60% 视为同一事件
 */
function isSameStory(a: string[], b: string[]): boolean {
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return false;
  return a.filter((w) => b.includes(w)).length / minLen > 0.6;
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
    const words = titleTokens(item.title);
    if (seenWords.some((existing) => isSameStory(words, existing))) return false;
    seenWords.push(words);
    return true;
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
    fetchAndProcessChannel(
      domesticKeywords, domesticLocale, domesticMax, '国内', DOMESTIC_TIME_WINDOW_HOURS, 'zh'
    ),
    fetchAndProcessChannel(
      intlKeywords, intlLocale, intlMax, '国际', INTL_TIME_WINDOW_HOURS, 'en'
    ),
  ]);

  // 配额：保证中英版面均衡。
  // 若合并后直接按时间取前 N，国际源可挑的新条目更多，会把中文挤光（实测 7 英 : 3 中）。
  const domesticQuota = Math.ceil(totalMax / 2);
  const intlQuota = totalMax - domesticQuota;

  const merged: NewsItem[] = [];
  const seenTitles: string[][] = [];

  const take = (item: NewsItem): void => {
    const words = titleTokens(item.title);
    if (seenTitles.some((existing) => isSameStory(words, existing))) {
      console.log(`  [去重] 跳过重复: ${item.title.slice(0, 40)}...`);
      return;
    }
    seenTitles.push(words);
    merged.push(item);
  };

  // 第一轮：两侧各取配额内的条数（各频道内部已按时间倒序）
  domestic.slice(0, domesticQuota).forEach(take);
  international.slice(0, intlQuota).forEach(take);

  // 第二轮：某侧候选不足、或去重后掉条时，用两侧剩余新闻按时间补足
  if (merged.length < totalMax) {
    [...domestic.slice(domesticQuota), ...international.slice(intlQuota)]
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
      .forEach((item) => {
        if (merged.length < totalMax) take(item);
      });
  }

  merged.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const zhCount = merged.filter((n) => n.lang === 'zh').length;
  console.log(
    `合并后共 ${merged.length} 条新闻 (国内源 ${domestic.length} + 国际源 ${international.length}，中文 ${zhCount} / 英文 ${merged.length - zhCount})`
  );
  return merged;
}
