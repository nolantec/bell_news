import { CONFIG } from './config';
import { getTopNews } from './services/newsService';
import { sendMail } from './services/mailService';

/**
 * 一次性执行：抓取新闻并发送邮件（适用于 GitHub Actions / 手动触发）
 */
async function runOnce(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 开始执行早报任务...`);

  try {
    console.log(`正在抓取关键词: ${CONFIG.news.keywords.join(', ')}`);
    const newsList = await getTopNews(CONFIG.news.keywords, CONFIG.news.lang, CONFIG.news.maxCount);
    console.log(`抓取到 ${newsList.length} 条新闻`);

    await sendMail(newsList);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toISOString()}] 任务完成，耗时 ${duration}s`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 任务失败:`, error);
    process.exit(1);
  }
}

runOnce();
