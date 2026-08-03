import { CONFIG } from '../config';
import type { NewsItem } from './newsService';

export interface AiNewsAnalysis {
  index: number;
  headline: string;
  summary: string;
}

export interface AiBriefing {
  analyses: AiNewsAnalysis[];
}

function buildPrompt(newsList: NewsItem[]): string {
  const newsData = newsList
    .map(
      (n, i) =>
        `[来源${i + 1}] 标题：${n.title}\n出处：${n.source || '未知'}\n摘要：${n.description || '无'}`
    )
    .join('\n\n');

  return `你是汽车膜行业首席分析师，为专业投资机构和产业从业者撰写每日深度早报。

以下是今天抓取到的 ${newsList.length} 条汽车膜行业信息，涵盖 TPU 隐形车衣、汽车窗膜、车身改色膜、汽车打印膜等全品类。

## 原始信息
${newsData}

## 核心要求

基于以上信息，综合归纳出 **10 条行业核心动态与趋势**。每条必须包含：

1. **headline**（≤25字）：提炼核心结论，含关键数据
2. **summary**（用以下格式输出，四段式，总 460-550 字）：
   • 核心观点：（至少 100 字）点明趋势本质和关键数据
   • 数据支撑：（至少 120 字）引用具体数据和信息源
   • 行业影响：（至少 120 字）分析对产业链的具体影响
   • 趋势展望：（至少 120 字）预判走向、机会和风险
   每段以"• 子标题："开头，总字数控制在 460-550 字，段间无空行

## 覆盖维度
- 市场规模/增长预测/区域分析
- 企业战略/融资并购/产能扩张
- 技术创新/新品发布/材料突破
- 政策法规/行业标准/质保认证
- 渠道变革/消费趋势/服务升级

## 写作参考
"• 核心观点：全球汽车贴膜市场正经历结构性增长，中国以 42% 区域份额持续领跑，TPU 隐形车衣向中端车型加速渗透成为核心驱动力。
• 数据支撑：据 Grand View Research 最新报告，2026 年全球汽车贴膜市场规模预计达 139 亿美元，2033 年将增至 263 亿美元，年复合增长率 9.6%。装贴率从 2023 年不足 5% 提升至 2026 年 15% 以上。
• 行业影响：电动汽车全景天幕普及催生高效隔热膜结构性需求，TPU 粒子供应波动和低价劣质膜扰乱市场秩序成为行业主要挑战。头部膜企加速自建生产线和正品溯源体系应对。
• 趋势展望：技术领先的头部膜企和具备规模化成本优势的国产品牌将在下一轮竞争中占据有利位置。欧美多地对车窗透光率法规趋严将倒逼高透光高隔热纳米膜研发加速。"

严格输出 JSON，无其他内容。共 10 条，index 0-9：
{
  "analyses": [
    { "index": 0, "headline": "…", "summary": "约400字的深度分析…" }
  ]
}`;
}

export async function generateBriefing(newsList: NewsItem[]): Promise<AiBriefing | null> {
  if (!CONFIG.ai.enabled || !CONFIG.ai.apiKey) {
    console.log('DeepSeek API Key 未配置，跳过 AI 深度分析');
    return null;
  }
  if (newsList.length === 0) return null;

  const prompt = buildPrompt(newsList);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              '你是汽车膜行业首席分析师。每条 summary 四段式每段至少100字，总460-550字。信息密度高，读完掌握全局。只输出 JSON。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 25000,
        frequency_penalty: 0.2,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`DeepSeek API 错误: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) { console.error('DeepSeek 返回空'); return null; }

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const briefing = JSON.parse(jsonStr) as AiBriefing;
    if (!Array.isArray(briefing.analyses) || briefing.analyses.length === 0) {
      console.error('AI 返回格式不正确');
      return null;
    }

    const avgLen = Math.round(
      briefing.analyses.reduce((s, a) => s + a.summary.length, 0) / briefing.analyses.length
    );
    console.log(`AI 分析完成: ${briefing.analyses.length} 条, 平均 ${avgLen} 字/条`);
    return briefing;
  } catch (err) {
    console.error('AI 分析失败:', err);
    return null;
  }
}
