import { CONFIG } from './config';
import { getUnifiedNews } from './services/newsService';
import { generateBriefing } from './services/aiService';
import { sendMail, resendLastMail } from './services/mailService';
import { loadSentState, saveSentState, isAlreadySentToday } from './services/stateService';

async function runOnce(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 开始执行早报任务...`);

  try {
    // 手动重发模式：直接重发上一封快照，不抓取、不耗 AI、不受当日防重护栏限制
    if (process.env.RESEND) {
      await resendLastMail();
      process.exit(0);
    }

    const { domestic: dom, international: intl } = CONFIG.news;
    console.log(`国内关键词: ${dom.keywords.join(', ')}`);
    console.log(`国际关键词: ${intl.keywords.join(', ')}`);

    // 读取最近已发送记录，用于跨天判重（首次运行状态文件不存在，返回空）
    const sentEntries = loadSentState();
    console.log(`已发送记录: ${sentEntries.length} 条`);

    // 当日防重护栏：双时段定时或手动触发时，当天已成功发送过就不再发
    // （FORCE_RUN=1 可强制重跑，用于本地调试）
    if (!process.env.FORCE_RUN && isAlreadySentToday(sentEntries)) {
      console.log('今日已发送过早报，跳过');
      process.exit(0);
    }

    const sentRecords = sentEntries.map((e) => ({ tokens: e.w, lastSent: new Date(e.d) }));

    const newsList = await getUnifiedNews(
      dom.keywords,
      intl.keywords,
      { hl: dom.hl, gl: dom.gl, ceid: dom.ceid },
      { hl: intl.hl, gl: intl.gl, ceid: intl.ceid },
      dom.maxCount,
      intl.maxCount,
      10,
      sentRecords
    );

    console.log(`抓取完成: ${newsList.length} 条新闻`);

    let aiBriefing = newsList.length > 0 ? await generateBriefing(newsList) : null;

    // 质检把关
    const { qualityCheck } = await import('./services/qaService');
    let qa = qualityCheck(newsList, aiBriefing);

    if (qa.warnings.length > 0) {
      console.log(`⚠️ 质检警告:\n  ${qa.warnings.join('\n  ')}`);
    }

    // 质检不通过时，用更严格的 prompt 重试一次
    if (!qa.passed && aiBriefing) {
      console.log('🔄 质检不通过，用更严格的字数要求重试 AI 分析...');
      aiBriefing = await generateBriefing(newsList, true);
      if (aiBriefing) {
        qa = qualityCheck(newsList, aiBriefing);
        if (qa.warnings.length > 0) {
          console.log(`⚠️ 重试后质检警告:\n  ${qa.warnings.join('\n  ')}`);
        }
      }
    }

    if (!qa.passed) {
      console.error(`❌ 重试后质检仍不通过，取消发送:\n  ${qa.errors.join('\n  ')}`);
      process.exit(1);
    }

    console.log('✅ 质检通过');
    await sendMail(newsList, aiBriefing!);

    // 发送成功才记录，供下次运行跨天判重；
    // 状态文件由 workflow 的后续步骤提交回仓库
    saveSentState(sentEntries, newsList);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toISOString()}] 任务完成，耗时 ${duration}s`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 任务失败:`, error);
    process.exit(1);
  }
}

runOnce();
