import nodemailer from 'nodemailer';
import { CONFIG } from '../config';
import type { NewsItem } from './newsService';

/**
 * 内联占位图 base64（1x1 透明像素，邮件客户端兼容性最好）
 * 用纯 CSS 背景色替代，不依赖外部资源
 */
const EMPTY_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 截断文本（中文友好，按字符数）
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/**
 * HTML 转义（防止新闻标题中的特殊字符破坏邮件结构）
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 构建图文卡片（前三条，table 布局，兼容所有邮件客户端）
 */
function buildFeaturedCard(item: NewsItem, index: number): string {
  const imageUrl = item.imageUrl || EMPTY_PIXEL;
  const hasRealImage = !!item.imageUrl;
  const sourceText = item.source ? `${escapeHtml(item.source)} · ` : '';
  const timeText = item.pubDate.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const descSnippet = item.description ? truncateText(escapeHtml(item.description), 80) : '';

  // TOP 徽章颜色
  const badgeColors = ['#e74c3c', '#e67e22', '#f39c12'];
  const badgeBg = badgeColors[index] || '#e74c3c';

  return `
    <!-- 热点头条 #${index + 1} -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin: 12px 0; background-color: #fafafa; border: 1px solid #eeeeee;">
      <tr>
        <td width="130" valign="top" style="padding: 0;">
          <a href="${escapeHtml(item.link)}" target="_blank">
            ${
              hasRealImage
                ? `<img src="${escapeHtml(imageUrl)}" width="130" height="90"
                     alt="" border="0"
                     style="display: block; width: 130px; height: 90px; border: none;">`
                : `<table width="130" height="90" cellpadding="0" cellspacing="0" border="0">
                     <tr>
                       <td width="130" height="90" align="center" valign="middle"
                           style="background-color: #e8e8e8; font-size: 28px;">📰</td>
                     </tr>
                   </table>`
            }
          </a>
        </td>
        <td valign="top" style="padding: 10px 14px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-bottom: 6px;">
                <span style="display: inline-block; background-color: ${badgeBg}; color: #ffffff;
                  font-size: 11px; padding: 2px 8px; font-weight: bold;">
                  TOP ${index + 1}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 4px;">
                <a href="${escapeHtml(item.link)}" target="_blank"
                   style="color: #1a1a1a; text-decoration: none; font-size: 15px; font-weight: bold; line-height: 1.5;">
                  ${escapeHtml(item.title)}
                </a>
              </td>
            </tr>
            ${
              descSnippet
                ? `<tr>
                     <td style="padding-bottom: 6px; color: #777777; font-size: 12px; line-height: 1.5;">
                       ${descSnippet}
                     </td>
                   </tr>`
                : ''
            }
            <tr>
              <td style="color: #bbbbbb; font-size: 11px;">
                ${sourceText}${timeText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * 构建列表项（第4条及以后）
 */
function buildListItem(item: NewsItem, index: number): string {
  const descSnippet = item.description ? truncateText(escapeHtml(item.description), 60) : '';

  return `
    <tr>
      <td width="36" valign="top" style="padding: 14px 10px; border-bottom: 1px solid #f0f0f0;">
        <span style="display: inline-block; min-width: 24px; height: 24px; line-height: 24px;
          text-align: center; background-color: #f0f5ff; color: #2f54eb; font-size: 12px; font-weight: bold;">
          ${index + 1}
        </span>
      </td>
      <td valign="top" style="padding: 14px 10px 14px 0; border-bottom: 1px solid #f0f0f0;">
        <a href="${escapeHtml(item.link)}" target="_blank"
           style="color: #262626; text-decoration: none; font-size: 14px; line-height: 1.6; font-weight: 500;">
          ${escapeHtml(item.title)}
        </a>
        ${
          descSnippet
            ? `<p style="margin: 4px 0 0; color: #999999; font-size: 12px; line-height: 1.4;">${descSnippet}</p>`
            : ''
        }
        <p style="margin: 4px 0 0; color: #bfbfbf; font-size: 11px;">
          ${item.source ? `${escapeHtml(item.source)} · ` : ''}${item.pubDate.toLocaleString('zh-CN')}
        </p>
      </td>
    </tr>
  `;
}

/**
 * 构建邮件 HTML 内容（全面兼容 QQ邮箱 / 163 / Gmail / Outlook）
 */
function buildEmailHtml(newsList: NewsItem[]): string {
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const sourceCount = new Set(newsList.map((n) => n.source).filter(Boolean)).size;

  // 热点头条区
  const featuredSection =
    newsList.length > 0
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 16px 20px 4px;">
              <span style="color: #999999; font-size: 13px; font-weight: bold;">🔥 热点头条</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 20px;">
              ${newsList.slice(0, 3).map((item, i) => buildFeaturedCard(item, i)).join('')}
            </td>
          </tr>
        </table>
      `
      : '';

  // 更多资讯区
  const listSection =
    newsList.length > 3
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 20px 20px 4px;">
              <span style="color: #999999; font-size: 13px; font-weight: bold;">📰 更多资讯</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${newsList.slice(3).map((item, i) => buildListItem(item, i + 3)).join('')}
              </table>
            </td>
          </tr>
        </table>
      `
      : '';

  // 空状态
  const emptySection =
    newsList.length === 0
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding: 48px 20px; color: #999999;">
              <p style="font-size: 48px; margin: 0 0 12px;">📭</p>
              <p style="margin: 0; font-size: 14px;">过去48小时内暂无相关新闻</p>
            </td>
          </tr>
        </table>
      `
      : '';

  // 统计信息行
  const statsRow =
    newsList.length > 0
      ? `<tr>
           <td align="center" style="padding: 4px 24px 16px; color: #aaaaaa; font-size: 11px;">
             共 ${newsList.length} 条 · 来自 ${sourceCount} 个来源
           </td>
         </tr>`
      : '';

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>汽车膜行业早报</title>
</head>
<body style="margin: 0; padding: 20px 12px; background-color: #f0f2f5;
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;">

  <!-- 外层容器 -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" border="0"
               style="background-color: #ffffff;">

          <!-- ====== 头部 ====== -->
          <tr>
            <td align="center"
                style="padding: 32px 24px; background-color: #1a2332; color: #ffffff;">
              <p style="font-size: 32px; margin: 0 0 8px;">🚗</p>
              <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 2px;">
                汽车膜行业早报
              </h1>
              <p style="margin: 10px 0 0; font-size: 13px; color: #8899aa;">${today}</p>
            </td>
          </tr>

          ${statsRow}

          <!-- ====== 内容区 ====== -->
          <tr>
            <td>
              ${emptySection}
              ${featuredSection}
              ${listSection}
            </td>
          </tr>

          <!-- ====== 底部 ====== -->
          <tr>
            <td align="center"
                style="padding: 20px 24px; border-top: 1px solid #f0f0f0; color: #bbbbbb; font-size: 12px; line-height: 1.8;">
              <p style="margin: 0;">由 Morning Paper 自动生成 · 如需调整请联系管理员</p>
              <p style="margin: 2px 0 0;">
                📧 <a href="mailto:nolanpark246@gmail.com"
                   style="color: #2f54eb; text-decoration: none; font-weight: 500;">@nolantec</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/**
 * 发送邮件
 */
export async function sendMail(newsList: NewsItem[]): Promise<void> {
  const { smtp, mail } = CONFIG;

  if (!smtp.user || !smtp.pass) {
    throw new Error('SMTP 配置不完整，请检查 .env 文件');
  }

  if (mail.to.length === 0) {
    throw new Error('收件人列表为空，请检查 MAIL_TO 配置');
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const html = buildEmailHtml(newsList);
  const today = new Date().toLocaleDateString('zh-CN');
  const count = Math.min(newsList.length, 10);

  const info = await transporter.sendMail({
    from: `"汽车膜早报" <${mail.from}>`,
    to: mail.to.join(', '),
    subject: `【汽车膜早报】${today} · 过去48小时 Top ${count} 新闻`,
    html,
  });

  console.log('邮件发送成功:', info.messageId);
}
