import nodemailer from 'nodemailer';
import { CONFIG } from '../config';
import type { NewsItem } from './newsService';

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

  const rows = newsList
    .map(
      (item, index) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee; vertical-align: top; width: 32px;">
          <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center;
            background: #1890ff; color: #fff; border-radius: 50%; font-size: 12px;">
            ${index + 1}
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <a href="${item.link}" style="color: #1890ff; text-decoration: none; font-size: 15px;"
             target="_blank">${item.title}</a>
          <div style="margin-top: 6px; color: #999; font-size: 12px;">
            ${item.source ? `${item.source} · ` : ''}${item.pubDate.toLocaleString('zh-CN')}
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>汽车膜行业早报</title>
    </head>
    <body style="margin: 0; padding: 20px; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <div style="max-width: 640px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%); color: #fff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 500;">🚗 汽车膜行业早报</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${today}</p>
        </div>
        <div style="padding: 8px 16px;">
          ${
            newsList.length === 0
              ? '<p style="text-align: center; color: #999; padding: 40px;">过去24小时内暂无相关新闻</p>'
              : `<table style="width: 100%; border-collapse: collapse;">
                  <tbody>${rows}</tbody>
                 </table>
                `
          }
        </div>
        <div style="padding: 16px; text-align: center; color: #bbb; font-size: 12px; border-top: 1px solid #f0f0f0;">
          由 Morning Paper 自动生成 · 如需调整请联系管理员
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

  const info = await transporter.sendMail({
    from: `"汽车膜早报" <${mail.from}>`,
    to: mail.to.join(', '),
    subject: `【汽车膜早报】${today} · 过去24小时 Top ${Math.min(newsList.length, 10)} 新闻`,
    html,
  });

  console.log('邮件发送成功:', info.messageId);
}
