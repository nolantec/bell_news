import cron from 'node-cron';
import { CONFIG } from './config';
import { getTopNews } from './services/newsService';
import { sendMail } from './services/mailService';

/**
 * 执行一次完整的抓取+发送流程
 */
async function runJob(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 开始执行早报任务...`);

  try {
    // 1. 抓取新闻
    console.log(`正在抓取关键词: ${CONFIG.news.keywords.join(', ')}`);
    const newsList = await getTopNews(CONFIG.news.keywords, CONFIG.news.lang, CONFIG.news.maxCount);
    console.log(`抓取到 ${newsList.length} 条新闻`);

    // 2. 发送邮件
    await sendMail(newsList);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toISOString()}] 任务完成，耗时 ${duration}s`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 任务失败:`, error);
  }
}

/**
 * 主函数：启动定时调度
 */
function main(): void {
  // 验证 cron 表达式
  if (!cron.validate(CONFIG.schedule)) {
    console.error('无效的定时表达式:', CONFIG.schedule);
    process.exit(1);
  }

  console.log('Morning Paper 已启动');
  console.log(`定时规则: ${CONFIG.schedule}`);
  console.log(`目标邮箱: ${CONFIG.mail.to.join(', ')}`);
  console.log(`新闻关键词: ${CONFIG.news.keywords.join(', ')}`);

  // 立即执行一次（调试用），后续可按需注释掉
  // runJob();

  // 启动定时任务
  cron.schedule(CONFIG.schedule, runJob, {
    timezone: 'Asia/Shanghai',
  });

  console.log('等待定时触发...');
}

main();
