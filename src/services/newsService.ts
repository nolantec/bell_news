/**
 * 新闻数据类型定义
 */
export interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source?: string;
  description?: string;
}

/**
 * 解析 Google News RSS XML 为结构化数据
 */
function parseRssXml(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];

    const titleMatch = content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const title = titleMatch ? titleMatch[1] : (content.match(/<title>(.*?)<\/title>/)?.[1] || '');

    const linkMatch = content.match(/<link>(.*?)<\/link>/);
    const link = linkMatch ? linkMatch[1] : '';

    const pubDateMatch = content.match(/<pubDate>(.*?)<\/pubDate>/);
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();

    const sourceMatch = content.match(/<source url=".*?">(.*?)<\/source>/);
    const source = sourceMatch ? sourceMatch[1] : undefined;

    items.push({ title, link, pubDate, source });
  }

  return items;
}

/**
 * 使用 Google News RSS 抓取新闻
 */
async function fetchGoogleNews(keyword: string, lang: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(keyword);
  const url = `https://news.google.com/rss/search?q=${query}&hl=${lang}&gl=CN&ceid=CN:${lang}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`抓取新闻失败: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return parseRssXml(xml);
}

/**
 * 获取过去24小时内的汽车膜行业 Top N 新闻
 */
export async function getTopNews(
  keywords: readonly string[],
  lang: string,
  maxCount: number
): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 并行抓取所有关键词的新闻
  const results = await Promise.allSettled(
    keywords.map((keyword) => fetchGoogleNews(keyword, lang))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allNews.push(...result.value);
    } else {
      console.error('抓取关键词失败:', result.reason);
    }
  }

  // 去重：根据链接去重
  const seenLinks = new Set<string>();
  const uniqueNews = allNews.filter((item) => {
    if (seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    return true;
  });

  // 过滤过去24小时内的新闻
  const recentNews = uniqueNews.filter((item) => item.pubDate >= twentyFourHoursAgo);

  // 按发布时间倒序排列，取前 N 条
  recentNews.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return recentNews.slice(0, maxCount);
}
