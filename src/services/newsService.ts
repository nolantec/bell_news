import { CONFIG } from '../config';

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
      items.push({ title, link, pubDate, source, description });
    }
  }

  return items;
}

/**
 * 从文章页面提取 OG 图片
 */
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return undefined;

    const html = await response.text();

    const ogMatch = html.match(
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
    );
    if (ogMatch) return ogMatch[1];

    const twMatch = html.match(
      /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i
    );
    if (twMatch) return twMatch[1];

    const itemMatch = html.match(
      /<meta[^>]+itemprop="image"[^>]+content="([^"]+)"/i
    );
    if (itemMatch) return itemMatch[1];

    const imgMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);
    if (imgMatch) {
      const src = imgMatch[1];
      if (
        !src.includes('logo') &&
        !src.includes('icon') &&
        !src.includes('avatar') &&
        !src.includes('qr_code')
      ) {
        return src;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
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
 * Tavily 搜索结果
 */
interface TavilyResult {
  url: string;
  title: string;
  content: string;
}

interface TavilyResponse {
  results: TavilyResult[];
  images?: { url: string; description?: string }[];
}

/**
 * 通过 Tavily Search API 搜索标题，获取真实 URL、摘要和相关图片
 */
async function searchViaTavily(
  title: string,
  apiKey: string
): Promise<{ result: TavilyResult; images: string[] } | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: title,
        search_depth: 'basic',
        max_results: 3,
        include_images: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return undefined;

    const data = (await response.json()) as TavilyResponse;
    if (!data.results?.[0]) return undefined;

    // 提取图片 URL（Tavily 根据 query 语义匹配的相关图片）
    const images = (data.images || []).map((img) => img.url);

    return { result: data.results[0], images };
  } catch {
    return undefined;
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
  timeWindowHours = 48
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

  // 去重
  const seenLinks = new Set<string>();
  const uniqueNews = allNews.filter((item) => {
    if (seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
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

  // 链接解析 + 图片抓取
  if (CONFIG.tavily.enabled) {
    const enhancers = topNews.map(async (item) => {
      // 搜索：标题 + 来源 + 行业限定词
      const q = `${item.title.slice(0, 60)} ${item.source || ''} 汽车膜 隐形车衣 PPF`;
      const data = await searchViaTavily(q, CONFIG.tavily.apiKey);
      if (data) {
        const { url, content } = data.result;
        // 权威域名
        const AUTH = [
          'grandviewresearch', 'fortunebusinessinsights', 'coherentmarketinsights',
          'researchnester', 'marketsandmarkets',
          'xpel.com', '3m.com', 'eastman', 'lubrizol', 'saint-gobain',
          'autohome.com.cn', 'chejiahao.autohome', 'stcn.com',
          '163.com', 'sohu.com', 'sina.com.cn', 'thepaper.cn', 'cls.cn',
          'qq.com', 'ifeng.com', 'eastmoney.com',
          'reuters.com', 'bloomberg.com', 'prnewswire.com', 'businesswire',
          'usatoday.com', 'finance.yahoo.com', 'barchart.com',
          'snsinsider.com', 'narppf.com.cn', 'windowfilmmag.com',
        ];
        const BLOCK = [
          'bilibili.com', 'xiaohongshu', 'zhihu.com', 'tieba.baidu.com',
          'club.autohome', 'chejiahao.m.autohome', 'k.sina.com.cn',
          'info.b2b168', '24-7pressrelease', 'maigoo.com', 'mg21.com',
          'twiistedmedia.com', 'ranking', 'top10', 'brandlist', '163.com/dy/media',
        ];
        const ok = AUTH.some(d => url.includes(d)) && !BLOCK.some(d => url.includes(d));
        if (ok) {
          console.log(`  [链接] ✓ ${item.title.slice(0, 20)}... → ${url.slice(0, 50)}...`);
          item.link = url;
          if (content.length > (item.description?.length || 0)) item.description = content.slice(0, 400);
          if (!item.imageUrl && data.images.length > 0) item.imageUrl = data.images[0];
        } else {
          item.link = `https://www.baidu.com/s?wd=${encodeURIComponent(item.title + ' ' + (item.source || ''))}`;
        }
      } else {
        item.link = `https://www.baidu.com/s?wd=${encodeURIComponent(item.title + ' ' + (item.source || ''))}`;
      }
      if (!item.imageUrl) item.imageUrl = await fetchOgImage(item.link);
      return item;
    });
    await Promise.all(enhancers);
  } else {
    const imgs = topNews.slice(0, 3).map(async (item) => {
      if (!item.imageUrl) item.imageUrl = await fetchOgImage(item.link);
      return item;
    });
    await Promise.all(imgs);
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
    fetchAndProcessChannel(domesticKeywords, domesticLocale, domesticMax, '国内', 48),
    fetchAndProcessChannel(intlKeywords, intlLocale, intlMax, '国际', 720),
  ]);

  // 合并去重
  const all = [...domestic, ...international];
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of all) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    merged.push(item);
  }

  // 按时间排序，取前 N
  merged.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  const top = merged.slice(0, totalMax);

  console.log(`合并后共 ${top.length} 条新闻 (国内源 ${domestic.length} + 国际源 ${international.length})`);
  return top;
}
