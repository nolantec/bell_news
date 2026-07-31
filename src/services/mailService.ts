import nodemailer from 'nodemailer';
import { CONFIG } from '../config';
import type { NewsItem } from './newsService';
import type { AiBriefing, AiNewsAnalysis } from './aiService';
import { HEAD_BG_IMAGE } from '../assets/headBg';

const EMPTY_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 构建单条新闻项（带图片 + 深度摘要）
 */
function buildNewsItem(
  item: NewsItem,
  index: number,
  analysis?: AiNewsAnalysis
): string {
  const imageUrl = item.imageUrl || EMPTY_PIXEL;
  const hasImage = !!item.imageUrl;
  const headline = analysis?.headline || item.title;
  const summary = analysis?.summary || item.description || '';
  const source = item.source ? escapeHtml(item.source) : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin: 24px 0; border-bottom: 1px solid #f0f0f0; padding-bottom: 24px;">
      <tr>
        <!-- 序号 -->
        <td width="34" valign="top" style="padding-top: 4px;">
          <span style="display: inline-block; width: 28px; height: 28px; line-height: 28px;
            text-align: center; background-color: #141e30; color: #ffffff; font-size: 13px;
            font-weight: bold;">${index + 1}</span>
        </td>
        <!-- 内容区 -->
        <td valign="top" style="padding: 0 14px;">
          <!-- 标题 -->
          <span style="color: #141e30; font-size: 16px; font-weight: bold; line-height: 1.6;
            display: block; margin-bottom: 8px;">
            ${escapeHtml(headline)}
          </span>
          <!-- 深度摘要 -->
          ${
            summary
              ? `<p style="margin: 0 0 8px; color: #555555; font-size: 13px; line-height: 1.9;">
                  ${escapeHtml(summary)}
                </p>`
              : ''
          }
          <!-- 来源 + 链接 -->
          <p style="margin: 0; color: #aaaaaa; font-size: 11px;">
            ${source ? `来源：${source} ` : ''}
            <a href="${escapeHtml(item.link)}" target="_blank"
               style="color: #2f54eb; text-decoration: none;">阅读原文 →</a>
          </p>
        </td>
        <!-- 配图 -->
        <td width="130" valign="top" style="padding-left: 8px;">
          ${
            hasImage
              ? `<a href="${escapeHtml(item.link)}" target="_blank">
                   <img src="${escapeHtml(imageUrl)}" width="130" height="85"
                        alt="" border="0"
                        style="display: block; width: 130px; height: 85px; border: 1px solid #eeeeee;">
                 </a>`
              : `<table width="130" height="85" cellpadding="0" cellspacing="0" border="0"
                         style="border: 1px solid #eeeeee;">
                   <tr><td align="center" valign="middle"
                       style="background-color: #f5f5f5; font-size: 24px; color: #cccccc;">📰</td></tr>
                 </table>`
          }
        </td>
      </tr>
    </table>`;
}

/**
 * 构建邮件 HTML
 */
function buildEmailHtml(
  newsList: NewsItem[],
  aiBriefing: AiBriefing | null
): string {
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // AI 分析速查表
  const analysisMap = new Map(
    (aiBriefing?.analyses || []).map((a) => [a.index, a])
  );

  // 构建所有新闻项
  const items = newsList
    .map((item, i) =>
      `<tr><td style="padding: 0 24px;">${buildNewsItem(item, i, analysisMap.get(i))}</td></tr>`
    )
    .join('\n');

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

  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" border="0"
               style="background-color: #ffffff;">

          <!-- ====== 头部（乐道L90 背景图，兼容所有邮箱） ====== -->
          <tr>
            <td align="center" style="padding: 0; position: relative; width: 640px; height: 260px;
              background-color: #1a2332; background-size: cover; background-position: center;
              background-image: url('${HEAD_BG_IMAGE}');" background="${HEAD_BG_IMAGE}">
              <!-- Outlook 兼容: VML -->
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false"
                style="width:640px;height:260px;position:absolute;top:0;left:0;">
                <v:fill type="frame" src="${HEAD_BG_IMAGE}" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <table width="100%" height="260" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" valign="middle">
                    <!-- 半透明遮罩文字块 -->
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding: 20px 32px;
                          background-color: rgba(0,0,0,0.45); color: #ffffff;">
                          <p style="font-size: 13px; margin: 0 0 8px; letter-spacing: 4px;
                            color: #dddddd; font-weight: 400;">
                            MORNING PAPER
                          </p>
                          <h1 style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 4px;
                            color: #ffffff;">
                            汽车膜行业早报
                          </h1>
                          <p style="margin: 10px 0 0; font-size: 13px; color: #cccccc;">
                            ${today}
                          </p>
                          <p style="margin: 4px 0 0; font-size: 11px; color: #aaaaaa;">
                            综合国内外市场研究机构、行业协会、膜企及权威媒体 · 共 ${newsList.length} 条
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!--[if gte mso 9]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- ====== 说明行 ====== -->
          <tr>
            <td style="padding: 16px 24px 0; color: #999999; font-size: 12px; line-height: 1.8;">
              以下内容由 DeepSeek AI 综合归纳整理，信息来源包括 Grand View Research、Fortune Business Insights、Coherent Market Insights、Research Nester 等国际市场研究机构，中国汽车工业协会、全国乘联会等行业组织，XPEL、3M、伊士曼、路博润等全球膜企官方发布，以及新浪汽车、汽车之家、证券时报等权威媒体。
            </td>
          </tr>

          <!-- ====== 新闻列表 ====== -->
          ${items}

          <!-- ====== 底部 ====== -->
          <tr>
            <td align="center"
                style="padding: 24px 20px; border-top: 1px solid #f0f0f0; color: #bbbbbb; font-size: 12px; line-height: 1.8;">
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
export async function sendMail(
  newsList: NewsItem[],
  aiBriefing: AiBriefing | null
): Promise<void> {
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
