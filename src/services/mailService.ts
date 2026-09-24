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

  // 每个单元格都显式写 align="left" + text-align:left：
  // Outlook 的 Word 引擎会把外层 align="center" 向下传播，不显式声明就会被居中
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" align="left"
           style="margin: 0 0 20px 0; border-bottom: 1px solid #e8ecf1; padding-bottom: 20px;">
      <tr>
        <td width="32" valign="top" align="left" style="padding-top: 3px; text-align: left;">
          <table cellpadding="0" cellspacing="0" border="0" width="26" align="left">
            <tr>
              <td width="26" height="26" align="center" valign="middle" bgcolor="#0ea5e9"
                style="width: 26px; height: 26px; background-color: #0ea5e9; color: #ffffff;
                  font-size: 12px; font-weight: bold; line-height: 26px; text-align: center;">
                ${index + 1}</td>
            </tr>
          </table>
        </td>
        <td valign="top" align="left" style="padding: 0 0 0 12px; text-align: left;">
          <span style="color: #0f172a; font-size: 15px; font-weight: 600; line-height: 1.4;
            display: block; margin-bottom: 6px; text-align: left;">
            ${escapeHtml(headline)}
          </span>
          ${
            summary
              ? `<p style="margin: 0 0 6px; color: #475569; font-size: 12.5px; line-height: 1.7;
                    text-align: left;">
                  ${formatSummary(summary)}
                </p>`
              : ''
          }
          <span style="color: #94a3b8; font-size: 10.5px; text-align: left;">
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
  // 刊头日期用数字格式（2026.09.23），比中文长日期更像报刊刊头
  const dateNumeric = new Date()
    .toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\//g, '.');

  const analysisMap = new Map((aiBriefing?.analyses || []).map((a) => [a.index, a]));

  const items = newsList
    .map((item, i) =>
      `<tr><td align="left" style="padding: 0 24px; text-align: left;">${buildNewsItem(item, i, analysisMap.get(i))}</td></tr>`
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

  <!-- 头部
       刻意不使用 VML：Outlook 的 Word 引擎把 v:rect 当作浮动形状，
       形状高度与文档流占位稍有出入就会溢出压住下方内容（已复现过两次）。
       这里只保留 bgcolor 纯色底 + CSS 背景图：
       - 浏览器 / Apple Mail：显示车照 + 渐变蒙版
       - Outlook：退化为纯深藏青底 + 白字，稳定且不会被裁切 -->
  <tr>
    <td align="left" bgcolor="#0f172a" style="padding:0;width:620px;
      background-color:#0f172a;background-size:cover;background-position:center;
      background-image:url('${HEAD_BG_IMAGE}');" background="${HEAD_BG_IMAGE}">
      <table width="100%" height="220" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- 这里刻意不写 background-color:transparent——Word 引擎对 transparent 处理不可靠，
               写成白色就会重现白底白字。不声明则自动透出父级 bgcolor="#0f172a" -->
          <td align="left" valign="bottom" style="height:220px;padding:0 40px 26px;
            color:#ffffff;
            background-image:linear-gradient(180deg,rgba(15,23,42,0.28) 0%,rgba(15,23,42,0.82) 100%);">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" valign="bottom">
                  <h1 style="margin:0;font-size:30px;font-weight:800;letter-spacing:-0.5px;
                    line-height:1.15;color:#ffffff;"><font color="#ffffff">汽车膜行业早报</font></h1>
                </td>
                <td align="right" valign="bottom" style="white-space:nowrap;
                  font-size:13px;color:#cbd5e1;color:rgba(255,255,255,0.75);">
                  <font color="#cbd5e1">${dateNumeric}</font></td>
              </tr>
              <tr>
                <td colspan="2" style="padding:16px 0 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td height="1" bgcolor="#475569"
                      style="height:1px;background-color:#475569;font-size:0;line-height:0;">&nbsp;</td>
                  </tr></table>
                </td>
              </tr>
              <tr>
                <td colspan="2" align="left" style="padding:10px 0 0;font-size:11px;
                  letter-spacing:0.5px;color:#94a3b8;color:rgba(255,255,255,0.62);">
                  <font color="#94a3b8">${newsList.length} 条趋势 · MORNING PAPER</font></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- 刊头与列表之间留白 -->
  <tr><td style="height:40px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- 新闻列表 -->
  ${items}

  <!-- 底部 -->
  <tr>
    <td align="center" style="padding:20px;border-top:1px solid #e8ecf1;
      color:#94a3b8;font-size:11px;line-height:1.8;">
      <p style="margin:0;">Morning Paper · 每日汽车膜行业早报</p>
      <p style="margin:0;">本邮件由 AI 综合全球市场研究机构、行业协会、膜企及权威媒体信息自动生成，</p>
      <p style="margin:0;">仅供行业交流参考，不构成投资建议。</p>
      <p style="margin:0;">如需调整、建议或退订，请联系 Roy Li ·
        <a href="mailto:rli2@mmm.com"
           style="color:#0ea5e9;text-decoration:none;font-weight:500;">rli2@mmm.com</a></p>
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
