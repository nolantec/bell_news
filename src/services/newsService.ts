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

// 时间窗：只取窗口内的新闻。窗口深度需与跨天判重联动：
// 判重会把已发送条目从候选中剔除，窗口太浅时次日新鲜候选不足，
// 会触发「新闻条数不足」整天不发送。国内 72h 实测次日新鲜仅 3 条，
// 放宽到与国际源一致的 7 天，保留足够的未发送存量供滚动选用。
const DOMESTIC_TIME_WINDOW_HOURS = 168;
const INTL_TIME_WINDOW_HOURS = 168;

// 合并后新鲜新闻低于此数时启用旧闻补位（与 qaService 的 8 条门槛一致）
const BACKFILL_MIN_COUNT = 8;

/** 已发送记录：标题词元 + 最近发送日期，用于跨天判重与补位冷却计算 */
export interface SentRecord {
  tokens: string[];
  lastSent: Date;
}

/** 频道处理结果：新鲜新闻 + 已发送过但可作补位的旧闻 */
interface ChannelResult {
  fresh: NewsItem[];
  repeats: { item: NewsItem; lastSent: Date }[];
}

/**
 * 两个日期间隔的自然日天数（按 UTC 日历日计算，避免时刻与时区干扰）
 */
function calendarDaysBetween(earlier: Date, later: Date): number {
  const a = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  const b = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  return Math.round((b - a) / 86400000);
}

/**
 * 把标题切成用于判重的词元（去标点、丢弃单字）。
 * 中文没有空格分词，整句会变成一个词元，导致不同来源报道同一事件时
 * 因标题措辞不同而漏判，所以对中文串取相邻二字组（bigram）作为词元，
 * 同事件的不同标题共享大部分二字组，相似度阈值才能命中。
 */
export function titleTokens(title: string): string[] {
  const words = title
    .replace(/[【】\[\]（）()\d+.\s,-:：、，。！？\-\/&|]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const tokens = new Set<string>();
  for (const word of words) {
    if (/[一-鿿]/.test(word) && word.length > 2) {
      for (let i = 0; i < word.length - 1; i++) {
        tokens.add(word.slice(i, i + 2));
      }
    } else {
      tokens.add(word);
    }
  }
  return [...tokens];
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
 * 共享处理管道：抓取 → 去重 → 排序 → 时间过滤 → 跨天判重分流 → 切片 → 补图 → 解析真实链接
 * 已发送过的条目不直接丢弃，进入补位池，供合并阶段新鲜不足时按冷却天数回填
 */
async function fetchAndProcessChannel(
  keywords: readonly string[],
  locale: NewsLocale,
  maxCount: number,
  channelLabel: string,
  timeWindowHours = 48,
  lang: 'zh' | 'en' = 'zh',
  sentRecords: SentRecord[] = []
): Promise<ChannelResult> {
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

  // 跨天判重：命中已发送记录的进入补位池（冷却按最近一次发送算），其余为新鲜新闻
  const fresh: NewsItem[] = [];
  const repeats: { item: NewsItem; lastSent: Date }[] = [];
  for (const item of recentNews) {
    const words = titleTokens(item.title);
    let lastSent: Date | null = null;
    for (const record of sentRecords) {
      if (isSameStory(words, record.tokens) && (!lastSent || record.lastSent > lastSent)) {
        lastSent = record.lastSent;
      }
    }
    if (lastSent) {
      repeats.push({ item, lastSent });
    } else {
      fresh.push(item);
    }
  }
  if (repeats.length > 0) {
    console.log(`[${channelLabel}] 已发送过 ${repeats.length} 条，转入补位池`);
  }

  // 各取前 N 条（频道内部已按时间倒序）
  const topFresh = fresh.slice(0, maxCount);
  const topRepeats = repeats.slice(0, maxCount);
  console.log(`[${channelLabel}] 新鲜 ${topFresh.length} 条，可补位旧闻 ${topRepeats.length} 条`);

  // 链接策略：中文百度、英文 Bing
  for (const item of [...topFresh, ...topRepeats.map((r) => r.item)]) {
    item.lang = lang;
    if (lang === 'zh') {
      item.link = `https://www.baidu.com/s?wd=${encodeURIComponent(item.title)}`;
    } else {
      item.link = `https://cn.bing.com/search?q=${encodeURIComponent(item.title)}`;
    }
  }

  return { fresh: topFresh, repeats: topRepeats };
}

/**
 * 获取合并后的统一新闻列表（国内 + 国际去重归并，新鲜不足时旧闻补位）
 * @param sentRecords 最近已发送新闻记录，用于跨天判重与补位冷却；首次运行传空数组
 */
export async function getUnifiedNews(
  domesticKeywords: readonly string[],
  intlKeywords: readonly string[],
  domesticLocale: NewsLocale,
  intlLocale: NewsLocale,
  domesticMax: number,
  intlMax: number,
  totalMax = 10,
  sentRecords: SentRecord[] = []
): Promise<NewsItem[]> {
  const [domChannel, intlChannel] = await Promise.all([
    fetchAndProcessChannel(
      domesticKeywords, domesticLocale, domesticMax, '国内', DOMESTIC_TIME_WINDOW_HOURS, 'zh', sentRecords
    ),
    fetchAndProcessChannel(
      intlKeywords, intlLocale, intlMax, '国际', INTL_TIME_WINDOW_HOURS, 'en', sentRecords
    ),
  ]);
  const domestic = domChannel.fresh;
  const international = intlChannel.fresh;

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

  // 第三轮：新鲜条目低于质检门槛时，用补位池旧闻回填，宁补旧闻不开天窗。
  // 冷却优先 3 天起逐档放宽到 1 天（当天发送过的绝不回来）；档内「最久没发」的优先
  if (merged.length < BACKFILL_MIN_COUNT) {
    const pool = [...domChannel.repeats, ...intlChannel.repeats]
      .map((r) => ({ ...r, ageDays: calendarDaysBetween(r.lastSent, new Date()) }))
      .filter((r) => r.ageDays >= 1)
      .sort((a, b) => b.ageDays - a.ageDays || b.item.pubDate.getTime() - a.item.pubDate.getTime());

    for (const minAge of [3, 2, 1]) {
      const eligible = pool.filter((p) => p.ageDays >= minAge);
      // 该档足以补满，或已是最后一档（尽力而为）时使用
      if (merged.length + eligible.length >= BACKFILL_MIN_COUNT || minAge === 1) {
        let used = 0;
        for (const p of eligible) {
          if (merged.length >= BACKFILL_MIN_COUNT) break;
          take(p.item);
          used++;
        }
        if (used > 0) {
          console.log(`补位：新鲜新闻不足，回填 ${used} 条冷却 ≥${minAge} 天的旧闻`);
        }
        break;
      }
    }
  }

  merged.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const zhCount = merged.filter((n) => n.lang === 'zh').length;
  console.log(
    `合并后共 ${merged.length} 条新闻 (国内源 ${domestic.length} + 国际源 ${international.length}，中文 ${zhCount} / 英文 ${merged.length - zhCount})`
  );
  return merged;
}
