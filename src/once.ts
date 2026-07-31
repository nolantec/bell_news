import { CONFIG } from './config';
import { getUnifiedNews } from './services/newsService';
import { generateBriefing } from './services/aiService';
import { sendMail } from './services/mailService';

async function runOnce(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 开始执行早报任务...`);

  try {
    const { domestic: dom, international: intl } = CONFIG.news;
    console.log(`国内关键词: ${dom.keywords.join(', ')}`);
    console.log(`国际关键词: ${intl.keywords.join(', ')}`);

    const newsList = await getUnifiedNews(
      dom.keywords,
      intl.keywords,
      { hl: dom.hl, gl: dom.gl, ceid: dom.ceid },
      { hl: intl.hl, gl: intl.gl, ceid: intl.ceid },
      dom.maxCount,
      intl.maxCount
    );

    console.log(`抓取完成: ${newsList.length} 条新闻`);

    const aiBriefing = newsList.length > 0 ? await generateBriefing(newsList) : null;

    await sendMail(newsList, aiBriefing);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toISOString()}] 任务完成，耗时 ${duration}s`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 任务失败:`, error);
    process.exit(1);
  }
}

runOnce();
