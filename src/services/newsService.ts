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
 * Google RSS 结构:
 *   <title>新闻标题 - 来源名</title>
 *   <link>https://news.google.com/rss/articles/...</link>
 *   <pubDate>Thu, 30 Jul 2026 03:22:00 GMT</pubDate>
 *   <description>&lt;a href="..."&gt;标题&lt;/a&gt;...&lt;font&gt;来源&lt;/font&gt;</description>
 *   <source url="...">来源名</source>
 */
function parseGoogleRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];

    // 标题（CDATA 或纯文本，格式: "新闻标题 - 来源名"）
    const titleMatch =
      content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      content.match(/<title>(.*?)<\/title>/);
    const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

    // Google 的链接是跳转链接，在邮件中可正常跳转
    const linkMatch = content.match(/<link>(.*?)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : '';

    // 发布时间
    const pubDateMatch = content.match(/<pubDate>(.*?)<\/pubDate>/);
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();

    // 来源（从 <source> 标签获取）
    const sourceMatch = content.match(/<source[^>]*>(.*?)<\/source>/);
    const source = sourceMatch ? decodeHtmlEntities(sourceMatch[1].trim()) : undefined;

    // 标题中通常包含来源后缀 " - 来源名"，去掉它
    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }

    // 描述（先解码 HTML 实体，再清除标签，提取纯文本）
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
 * 将 Google News 跳转链接替换为百度搜索链接
 * Google RSS 链接 (news.google.com/rss/articles/...) 国内无法访问，
 * 替换为 https://www.baidu.com/s?wd=文章标题，用户点击后可直接搜索到原文
 */
function toBaiduSearchUrl(title: string): string {
  const query = encodeURIComponent(title);
  return `https://www.baidu.com/s?wd=${query}`;
}

/**
 * 从文章页面提取 OG 图片（为前三条新闻补全图片）
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

    // og:image
    const ogMatch = html.match(
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
    );
    if (ogMatch) return ogMatch[1];

    // twitter:image
    const twMatch = html.match(
      /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i
    );
    if (twMatch) return twMatch[1];

    // itemProp image
    const itemMatch = html.match(
      /<meta[^>]+itemprop="image"[^>]+content="([^"]+)"/i
    );
    if (itemMatch) return itemMatch[1];

    // 第一个有效 img
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
 * 从 Google News RSS 抓取新闻
 */
async function fetchGoogleNews(keyword: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(keyword);
  // hl=zh-CN 中文, gl=CN 中国区, ceid=CN:zh-Hans 简体中文
  const url = `https://news.google.com/rss/search?q=${query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;

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
 * 获取过去48小时内的汽车膜行业 Top N 新闻
 * 从 Google News RSS 抓取，去重后按时间排序
 */
export async function getTopNews(
  keywords: readonly string[],
  _lang: string,
  maxCount: number
): Promise<NewsItem[]> {
  const allNews: NewsItem[] = [];
  const now = new Date();
  const timeWindowHours = 48;
  const timeWindowAgo = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);

  // 并行抓取所有关键词
  const fetchTasks = keywords.map((keyword) =>
    fetchGoogleNews(keyword).catch((err) => {
      console.error(`关键词 [${keyword}] 抓取失败:`, err.message);
      return [] as NewsItem[];
    })
  );

  const results = await Promise.all(fetchTasks);

  for (const items of results) {
    allNews.push(...items);
  }

  // 去重：根据链接去重
  const seenLinks = new Set<string>();
  const uniqueNews = allNews.filter((item) => {
    if (seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    return true;
  });

  // 按发布时间倒序排列
  uniqueNews.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  // 优先取时间窗口内的新闻
  let recentNews = uniqueNews.filter((item) => item.pubDate >= timeWindowAgo);

  // 兜底：如果时间窗口内没新闻，取最新 N 条
  if (recentNews.length === 0 && uniqueNews.length > 0) {
    console.log(
      `过去${timeWindowHours}小时内无新闻，使用最新 ${Math.min(maxCount, uniqueNews.length)} 条`
    );
    recentNews = uniqueNews;
  }

  // 取前 N 条
  const topNews = recentNews.slice(0, maxCount);

  // 为前三条补全图片（用 Google 链接抓取缓存图，lh3 域名国内可访问）
  const topThree = topNews.slice(0, 3);
  const imageFetchers = topThree.map(async (item) => {
    if (!item.imageUrl) {
      console.log(`  补全图片: ${item.title.slice(0, 30)}...`);
      item.imageUrl = await fetchOgImage(item.link);
      if (item.imageUrl) {
        console.log(`    ✓ 获取成功`);
      }
    }
    return item;
  });
  await Promise.all(imageFetchers);

  // 将链接替换为百度搜索（Google News 链接国内无法打开）
  for (const item of topNews) {
    item.link = toBaiduSearchUrl(item.title);
  }

  return topNews;
}
