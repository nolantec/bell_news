import fs from 'fs';
import path from 'path';
import { titleTokens } from './newsService';
import type { NewsItem } from './newsService';

/**
 * 已发送新闻的持久化记录。
 * GitHub Actions 每次运行环境都是全新的，无法记住昨天发过什么，
 * 导致同一条新闻连续几天重复推送。做法：把已发送条目的标题词元
 * 写入 data/sent-news.json，由 workflow 在发送成功后提交回仓库，
 * 下次运行先读出来做跨天判重。
 */
interface SentEntry {
  /** 发送日期 YYYY-MM-DD，用于过期清理 */
  d: string;
  /** 标题词元，用于相似度判重 */
  w: string[];
}

const STATE_FILE = path.join(process.cwd(), 'data', 'sent-news.json');
// 记录保留天数：需覆盖最长的时间窗（国际源 7 天），再留一倍余量
const RETAIN_DAYS = 14;

/**
 * 读取已发送记录。文件不存在（首次运行）或损坏时返回空列表，不阻断流程
 */
export function loadSentState(): SentEntry[] {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { entries?: SentEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/**
 * 发送成功后调用：清理过期记录，追加本次条目并写回状态文件。
 * 由 workflow 的后续步骤负责提交到仓库。
 */
export function saveSentState(existing: SentEntry[], items: NewsItem[]): void {
  const now = new Date();
  const cutoff = new Date(now.getTime() - RETAIN_DAYS * 24 * 60 * 60 * 1000);
  const kept = existing.filter((e) => new Date(e.d) >= cutoff);
  const added: SentEntry[] = items.map((item) => ({
    d: now.toISOString().slice(0, 10),
    w: titleTokens(item.title),
  }));

  const state = { updatedAt: now.toISOString(), entries: [...kept, ...added] };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  console.log(`已记录本次发送 ${added.length} 条，状态文件累计保留 ${state.entries.length} 条`);
}
