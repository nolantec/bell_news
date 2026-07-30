import nodemailer from 'nodemailer';
import { CONFIG } from '../config';
import type { NewsItem } from './newsService';

/**
 * 内联 SVG 占位图（国内可访问，无需外部依赖）
 * 深色渐变背景 + 新闻图标
 */
const FALLBACK_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#e8e8e8"/><stop offset="100%" style="stop-color:#d0d0d0"/>
      </linearGradient></defs>
      <rect width="240" height="160" fill="url(#g)"/>
      <text x="120" y="85" text-anchor="middle" fill="#999" font-size="32" font-family="sans-serif">📰</text>
      <text x="120" y="115" text-anchor="middle" fill="#aaa" font-size="12" font-family="sans-serif">暂无图片</text>
    </svg>`
  );

/**
 * 截断文本（中文友好，按字符数）
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/**
 * 构建图文卡片（前三条，带缩略图 + 描述摘要）
 */
function buildFeaturedCard(item: NewsItem, index: number): string {
  const imageUrl = item.imageUrl || FALLBACK_IMAGE;
  const sourceText = item.source ? `${item.source} · ` : '';
  const timeText = item.pubDate.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  // 描述摘要（最多 80 字）
  const descSnippet = item.description ? truncateText(item.description, 80) : '';

  // 根据排名切换徽章颜色
  const badgeColors = ['#ff4d4f', '#fa8c16', '#faad14'];
  const badgeColor = badgeColors[index] || '#ff4d4f';

  return `
    <div style="margin: 16px 0; background: #fafafa; border-radius: 10px; border: 1px solid #f0f0f0; overflow: hidden;">
      <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width: 130px; vertical-align: top; padding: 0;">
            <a href="${item.link}" target="_blank" style="display: block;">
              <img src="${imageUrl}"
                   alt="${item.title}"
                   width="130" height="90"
                   style="width: 130px; height: 90px; object-fit: cover; display: block; border-right: 1px solid #f0f0f0;"
                   onerror="this.src='${FALLBACK_IMAGE}';">
            </a>
          </td>
          <td style="padding: 12px 14px; vertical-align: top;">
            <div style="margin-bottom: 6px;">
              <span style="display: inline-block; background: ${badgeColor}; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 3px; font-weight: 600; letter-spacing: 0.5px;">
                TOP ${index + 1}
              </span>
            </div>
            <a href="${item.link}" target="_blank"
               style="color: #1a1a1a; text-decoration: none; font-size: 15px; font-weight: 600; line-height: 1.6; display: block; margin-bottom: 4px;">
              ${item.title}
            </a>
            ${
              descSnippet
                ? `<p style="margin: 4px 0 6px; color: #666; font-size: 12px; line-height: 1.5;">${descSnippet}</p>`
                : ''
            }
            <div style="color: #bbb; font-size: 11px;">
              ${sourceText}${timeText}
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * 构建列表项（第4条及以后，简洁列表）
 */
function buildListItem(item: NewsItem, index: number): string {
  const descSnippet = item.description ? truncateText(item.description, 60) : '';

  return `
    <tr>
      <td style="padding: 14px 10px; border-bottom: 1px solid #f5f5f5; vertical-align: top; width: 36px;">
        <span style="display: inline-block; min-width: 24px; height: 24px; line-height: 24px; text-align: center;
          background: #f0f5ff; color: #2f54eb; border-radius: 50%; font-size: 12px; font-weight: 600;">
          ${index + 1}
        </span>
      </td>
      <td style="padding: 14px 10px 14px 0; border-bottom: 1px solid #f5f5f5;">
        <a href="${item.link}" style="color: #262626; text-decoration: none; font-size: 14px; line-height: 1.6;"
           target="_blank">${item.title}</a>
        ${
          descSnippet
            ? `<p style="margin: 4px 0 0; color: #999; font-size: 12px; line-height: 1.4;">${descSnippet}</p>`
            : ''
        }
        <div style="margin-top: 4px; color: #bfbfbf; font-size: 11px;">
          ${item.source ? `${item.source} · ` : ''}${item.pubDate.toLocaleString('zh-CN')}
        </div>
      </td>
    </tr>
  `;
}

/**
 * 构建邮件 HTML 内容
 */
function buildEmailHtml(newsList: NewsItem[]): string {
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // 统计信息
  const sourceCount = new Set(newsList.map((n) => n.source).filter(Boolean)).size;

  const featuredSection =
    newsList.length > 0
      ? `
        <div style="padding: 0 20px;">
          <div style="font-size: 13px; color: #999; margin: 20px 0 10px; font-weight: 600; letter-spacing: 0.5px;">
            🔥 热点头条
          </div>
          ${newsList.slice(0, 3).map((item, i) => buildFeaturedCard(item, i)).join('')}
        </div>
      `
      : '';

  const listSection =
    newsList.length > 3
      ? `
        <div style="padding: 0 20px;">
          <div style="font-size: 13px; color: #999; margin: 24px 0 10px; font-weight: 600; letter-spacing: 0.5px;">
            📰 更多资讯
          </div>
          <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
            <tbody>${newsList.slice(3).map((item, i) => buildListItem(item, i + 3)).join('')}</tbody>
          </table>
        </div>
      `
      : '';

  const emptyState =
    newsList.length === 0
      ? `
        <div style="text-align: center; padding: 48px 20px; color: #999;">
          <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
          <p style="margin: 0; font-size: 14px;">过去24小时内暂无相关新闻</p>
        </div>
      `
      : '';

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>汽车膜行业早报</title>
    </head>
    <body style="margin: 0; padding: 24px 12px; background: #f0f2f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;">
      <div style="max-width: 620px; margin: 0 auto; background: #fff; border-radius: 14px;
        overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">

        <!-- 头部 -->
        <div style="background: linear-gradient(135deg, #141e30 0%, #243b55 100%); color: #fff;
          padding: 32px 24px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px; line-height: 1;">🚗</div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 2px;">汽车膜行业早报</h1>
          <p style="margin: 10px 0 0; opacity: 0.65; font-size: 13px;">${today}</p>
          ${
            newsList.length > 0
              ? `<p style="margin: 6px 0 0; opacity: 0.45; font-size: 11px;">
                  共 ${newsList.length} 条 · 来自 ${sourceCount} 个来源
                </p>`
              : ''
          }
        </div>

        <!-- 内容区 -->
        ${emptyState}
        ${featuredSection}
        ${listSection}

        <!-- 底部 -->
        <div style="padding: 20px; text-align: center; color: #bfbfbf; font-size: 12px;
          border-top: 1px solid #f0f0f0; margin-top: 16px; line-height: 1.8;">
          <p style="margin: 0;">由 Morning Paper 自动生成 · 如需调整请联系管理员</p>
          <p style="margin: 2px 0 0;">
            📧 <a href="mailto:nolanpark246@gmail.com"
               style="color: #2f54eb; text-decoration: none; font-weight: 500;">@nolantec</a>
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
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
    subject: `【汽车膜早报】${today} · 过去24小时 Top ${count} 新闻`,
    html,
  });

  console.log('邮件发送成功:', info.messageId);
}
