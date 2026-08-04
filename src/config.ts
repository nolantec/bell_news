import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mail: {
    from: process.env.SMTP_USER || '',
    to: (process.env.MAIL_TO || '').split(',').map((e) => e.trim()).filter(Boolean),
  },
  schedule: process.env.SCHEDULE || '0 0 7 * * *',
  news: {
    // 国内新闻
    domestic: {
      keywords:
        (process.env.NEWS_DOMESTIC_KEYWORDS || process.env.NEWS_KEYWORDS || '汽车膜,隐形车衣,漆面保护膜,车窗膜,隔热膜,改色膜,TPU车衣,汽车窗膜,车身改色膜,汽车打印膜')
          .split(',')
          .map((k) => k.trim()),
      hl: 'zh-CN',
      gl: 'CN',
      ceid: 'CN:zh-Hans',
      maxCount: Number(process.env.NEWS_DOMESTIC_MAX_COUNT) || 5,
    },
    // 国际新闻（英文关键词）
    international: {
      keywords:
        (process.env.NEWS_INTL_KEYWORDS || 'paint protection film,automotive window film,car wrap,PPF automotive')
          .split(',')
          .map((k) => k.trim()),
      hl: 'en',
      gl: 'US',
      ceid: 'US:en',
      maxCount: Number(process.env.NEWS_INTL_MAX_COUNT) || 5,
    },
  },
  // DeepSeek AI 摘要（可选，不配置则无 AI 摘要）
  ai: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    enabled: !!process.env.DEEPSEEK_API_KEY,
  },
} as const;
