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
    keywords: (process.env.NEWS_KEYWORDS || '汽车膜,隐形车衣,漆面保护膜').split(',').map((k) => k.trim()),
    lang: process.env.NEWS_LANG || 'zh-CN',
    maxCount: Number(process.env.NEWS_MAX_COUNT) || 10,
  },
} as const;
