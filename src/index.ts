import cron from 'node-cron';
import { CONFIG } from './config';
import { getUnifiedNews } from './services/newsService';
import { generateBriefing } from './services/aiService';
import { sendMail } from './services/mailService';
import { qualityCheck } from './services/qaService';

/**
 * 执行一次完整的抓取+摘要+发送流程
 */
async function runJob(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 开始执行早报任务...`);

  try {
    // 1. 抓取新闻（国内外统一）
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

    // 2. AI 综合归纳行业趋势
    const aiBriefing = newsList.length > 0 ? await generateBriefing(newsList) : null;

    // 3. 质检把关
    const qa = qualityCheck(newsList, aiBriefing);
    if (qa.warnings.length > 0) console.log(`⚠️ 质检警告:\n  ${qa.warnings.join('\n  ')}`);
    if (!qa.passed) {
      console.error(`❌ 质检不通过:\n  ${qa.errors.join('\n  ')}`);
      return;
    }
    console.log('✅ 质检通过');

    // 4. 发送邮件
    await sendMail(newsList, aiBriefing);

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
  if (!cron.validate(CONFIG.schedule)) {
    console.error('无效的定时表达式:', CONFIG.schedule);
    process.exit(1);
  }

  console.log('Morning Paper 已启动');
  console.log(`定时规则: ${CONFIG.schedule}（北京时间 7:00）`);
  console.log(`目标邮箱: ${CONFIG.mail.to.join(', ')}`);
  console.log(`国内关键词: ${CONFIG.news.domestic.keywords.join(', ')}`);
  console.log(`国际关键词: ${CONFIG.news.international.keywords.join(', ')}`);
  console.log(`AI 摘要: ${CONFIG.ai.enabled ? '已启用' : '未启用（配置 DEEPSEEK_API_KEY 开启）'}`);

  cron.schedule(CONFIG.schedule, runJob, {
    timezone: 'Asia/Shanghai',
  });

  console.log('等待定时触发...');
}

main();
