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
 * 清理 HTML 标签，提取纯文本（用于描述摘要）
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
 * 通用 RSS XML 解析器
 * 兼容 Google News、Bing、百度、搜狗等多种 RSS 格式
 */
function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];

    // 标题（兼容 CDATA）
    const titleMatch =
      content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      content.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? stripHtml(titleMatch[1].trim()) : '';

    // 链接（去掉 Bing 的跳转前缀）
    const linkMatch = content.match(/<link>(.*?)<\/link>/);
    let link = linkMatch ? linkMatch[1].trim() : '';
    if (link.startsWith('https://www.bing.com/news/apiclick.aspx?')) {
      const urlParam = new URL(link).searchParams.get('url');
      if (urlParam) link = decodeURIComponent(urlParam);
    }

    // 发布时间
    const pubDateMatch = content.match(/<pubDate>(.*?)<\/pubDate>/);
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();

    // 来源
    const sourceMatch =
      content.match(/<source url=".*?">(.*?)<\/source>/) ||
      content.match(/<news:source>(.*?)<\/news:source>/);
    const source = sourceMatch ? sourceMatch[1].trim() : undefined;

    // 描述（清理 HTML 标签）
    const descMatch =
      content.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
      content.match(/<description>(.*?)<\/description>/);
    const description = descMatch ? stripHtml(descMatch[1]).slice(0, 200) : undefined;

    // 图片（兼容多种 RSS 扩展）
    let imageUrl: string | undefined;
    const enclosureMatch = content.match(/<enclosure[^>]+url="([^"]+)"/);
    const mediaMatch = content.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const newsImageMatch = content.match(/<News:Image>(.*?)<\/News:Image>/);
    // 也尝试从 description 的 img 标签中提取
    const descImgMatch = descMatch?.[1]?.match(/<img[^>]+src="([^"]+)"/);
    if (enclosureMatch) imageUrl = enclosureMatch[1];
    else if (mediaMatch) imageUrl = mediaMatch[1];
    else if (newsImageMatch) imageUrl = newsImageMatch[1].trim();
    else if (descImgMatch) imageUrl = descImgMatch[1];

    if (title && link) {
      items.push({ title, link, pubDate, source, description, imageUrl });
    }
  }

  return items;
}

/**
 * 从网页中提取 Open Graph 图片（用于前三条新闻补全图片）
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
    });
    clearTimeout(timeout);

    if (!response.ok) return undefined;

    const html = await response.text();

    // 匹配 og:image
    const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (ogMatch) return ogMatch[1];

    // 匹配 twitter:image
    const twMatch = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i);
    if (twMatch) return twMatch[1];

    // 匹配 article:image（百度新闻常用）
    const articleMatch = html.match(
      /<meta[^>]+itemprop="image"[^>]+content="([^"]+)"/i
    );
    if (articleMatch) return articleMatch[1];

    // 匹配第一个较大的 img 标签
    const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    if (imgMatch) {
      const src = imgMatch[1];
      if (
        !src.includes('logo') &&
        !src.includes('icon') &&
        !src.includes('avatar') &&
        !src.includes('qr_code') &&
        src.startsWith('http')
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
 * 抓取 Bing 新闻 RSS（国内可访问）
 */
async function fetchBingNews(keyword: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(keyword);
  const url = `https://cn.bing.com/news/search?q=${query}&format=rss`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Bing 新闻抓取失败: ${response.status}`);
    }

    const xml = await response.text();
    return parseRssItems(xml);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 抓取百度新闻 RSS（国内可访问）
 */
async function fetchBaiduNews(keyword: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(keyword);
  const url = `https://news.baidu.com/ns?word=${query}&tn=newsrss&sr=0&cl=2&rn=20&ct=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`百度新闻抓取失败: ${response.status}`);
    }

    // 百度 RSS 可能是 GBK 编码，需要兼容处理
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    let xml = decoder.decode(buffer);

    // 检测是否为有效 RSS（防止 GBK 乱码被当作有效数据）
    if (!xml.includes('<item>') || (xml.includes('�') && xml.includes('<item>'))) {
      try {
        const gbkDecoder = new TextDecoder('gbk');
        const gbkXml = gbkDecoder.decode(buffer);
        if (gbkXml.includes('<item>')) {
          xml = gbkXml;
        }
      } catch {
        // 保持 UTF-8 结果
      }
    }

    return parseRssItems(xml);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 获取汽车膜行业 Top N 新闻（优先48小时内，兜底不限时间）
 * 从 Bing + 百度双源并行抓取，去重后按时间排序
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

  // 并行抓取 Bing + 百度，每个关键词各发两个源
  const fetchTasks = keywords.flatMap((keyword) => [
    fetchBingNews(keyword).catch((err) => {
      console.error(`Bing 关键词 [${keyword}] 抓取失败:`, err.message);
      return [] as NewsItem[];
    }),
    fetchBaiduNews(keyword).catch((err) => {
      console.error(`百度关键词 [${keyword}] 抓取失败:`, err.message);
      return [] as NewsItem[];
    }),
  ]);

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

  // 兜底：如果时间窗口内没新闻，取最新 N 条（不限时间）
  if (recentNews.length === 0 && uniqueNews.length > 0) {
    console.log(`过去${timeWindowHours}小时内无新闻，使用最新 ${Math.min(maxCount, uniqueNews.length)} 条（不限时间）`);
    recentNews = uniqueNews;
  }

  // 取前 N 条
  const topNews = recentNews.slice(0, maxCount);

  // 为前三条补全图片（如果 RSS 里没有图片，则从原文页面抓取 og:image）
  const topThree = topNews.slice(0, 3);
  const imageFetchers = topThree.map(async (item) => {
    if (!item.imageUrl) {
      console.log(`  补全图片: ${item.title.slice(0, 30)}...`);
      item.imageUrl = await fetchOgImage(item.link);
    }
    return item;
  });
  await Promise.all(imageFetchers);

  return topNews;
}
