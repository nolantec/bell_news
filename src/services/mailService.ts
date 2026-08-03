import nodemailer from 'nodemailer';
import { CONFIG } from '../config';
import type { NewsItem } from './newsService';
import type { AiBriefing, AiNewsAnalysis } from './aiService';
import { HEAD_BG_IMAGE } from '../assets/headBg';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 将 AI 摘要中的 • 子标题转换为 HTML
 */
function formatSummary(text: string): string {
  return escapeHtml(text)
    .replace(/•\s*核心观点[：:]/g, '<br><b style="color:#0ea5e9;">• 核心观点</b>：')
    .replace(/•\s*数据支撑[：:]/g, '<br><b style="color:#0ea5e9;">• 数据支撑</b>：')
    .replace(/•\s*行业影响[：:]/g, '<br><b style="color:#0ea5e9;">• 行业影响</b>：')
    .replace(/•\s*趋势展望[：:]/g, '<br><b style="color:#0ea5e9;">• 趋势展望</b>：')
    .replace(/^<br>/, ''); // 去掉开头多余的 br
}

function buildNewsItem(
  item: NewsItem,
  index: number,
  analysis?: AiNewsAnalysis
): string {
  const headline = analysis?.headline || item.title;
  const summary = analysis?.summary || item.description || '';
  const source = item.source ? escapeHtml(item.source) : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin: 0 0 20px 0; border-bottom: 1px solid #e8ecf1; padding-bottom: 20px;">
      <tr>
        <td width="32" valign="top" style="padding-top: 3px;">
          <span style="display: inline-block; width: 26px; height: 26px; line-height: 26px;
            text-align: center; background: linear-gradient(135deg, #0ea5e9, #06b6d4);
            color: #ffffff; font-size: 12px; font-weight: bold; border-radius: 6px;">
            ${index + 1}</span>
        </td>
        <td valign="top" style="padding: 0 0 0 12px;">
          <span style="color: #0f172a; font-size: 15px; font-weight: 600; line-height: 1.4;
            display: block; margin-bottom: 6px;">
            ${escapeHtml(headline)}
          </span>
          ${
            summary
              ? `<p style="margin: 0 0 6px; color: #475569; font-size: 12.5px; line-height: 1.7;">
                  ${formatSummary(summary)}
                </p>`
              : ''
          }
          <span style="color: #94a3b8; font-size: 10.5px;">
            ${source} &nbsp;<a href="${escapeHtml(item.link)}" target="_blank"
               style="color: #0ea5e9; text-decoration: none;">阅读原文 →</a>
          </span>
        </td>
      </tr>
    </table>`;
}

function buildEmailHtml(
  newsList: NewsItem[],
  aiBriefing: AiBriefing | null
): string {
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const analysisMap = new Map((aiBriefing?.analyses || []).map((a) => [a.index, a]));

  const items = newsList
    .map((item, i) =>
      `<tr><td style="padding: 0 24px;">${buildNewsItem(item, i, analysisMap.get(i))}</td></tr>`
    )
    .join('\n');

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>汽车膜行业早报</title></head>
<body style="margin:0;padding:20px 12px;background:linear-gradient(180deg,#f0f9ff 0%,#f8fafc 100%);
  font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" border="0"
  style="background-color:#ffffff;border-radius:16px;overflow:hidden;
  box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.03);">

  <!-- 头部 -->
  <tr>
    <td align="center" style="padding:0;position:relative;width:620px;height:220px;
      background-color:#e0f2fe;background-size:cover;background-position:center;
      background-image:url('${HEAD_BG_IMAGE}');" background="${HEAD_BG_IMAGE}">
      <!--[if gte mso 9]>
      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false"
        style="width:620px;height:220px;position:absolute;top:0;left:0;">
        <v:fill type="frame" src="${HEAD_BG_IMAGE}"/>
        <v:textbox inset="0,0,0,0">
      <![endif]-->
      <table width="100%" height="220" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" valign="middle">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:18px 28px;
              background:rgba(255,255,255,0.88);color:#0f172a;border-radius:12px;">
              <p style="font-size:11px;margin:0 0 6px;letter-spacing:3px;color:#0ea5e9;">MORNING PAPER</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:2px;color:#0f172a;">
              汽车膜行业早报</h1>
              <p style="margin:8px 0 0;font-size:12px;color:#64748b;">${today} · ${newsList.length} 条趋势</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
    </td>
  </tr>

  <!-- 说明 -->
  <tr>
    <td style="padding:14px 24px 0;color:#94a3b8;font-size:11px;line-height:1.6;">
      AI 综合全球市场研究机构、行业协会、膜企及权威媒体信息，归纳整理为四段式深度分析
    </td>
  </tr>

  <!-- 新闻列表 -->
  ${items}

  <!-- 底部 -->
  <tr>
    <td align="center" style="padding:20px;border-top:1px solid #e8ecf1;
      color:#94a3b8;font-size:11px;line-height:1.8;">
      <p style="margin:0;">Morning Paper 自动生成 · 如需调整请联系</p>
      <p style="margin:0;">📧 <a href="mailto:nolanpark246@gmail.com"
         style="color:#0ea5e9;text-decoration:none;font-weight:500;">@nolantec</a></p>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`;
}

export async function sendMail(
  newsList: NewsItem[],
  aiBriefing: AiBriefing | null
): Promise<void> {
  const { smtp, mail } = CONFIG;
  if (!smtp.user || !smtp.pass) throw new Error('SMTP 配置不完整');
  if (mail.to.length === 0) throw new Error('收件人列表为空');

  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const html = buildEmailHtml(newsList, aiBriefing);
  const today = new Date().toLocaleDateString('zh-CN');

  const info = await transporter.sendMail({
    from: `"汽车膜早报" <${mail.from}>`,
    to: mail.to.join(', '),
    subject: `【汽车膜早报】${today} · ${newsList.length} 条行业趋势`,
    html,
  });
  console.log('邮件发送成功:', info.messageId);
}
