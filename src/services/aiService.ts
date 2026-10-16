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

基于以上信息，综合归纳出 **${newsList.length} 条行业核心动态与趋势**，每条对应一条原始信息，不得虚构或拆分。每条必须包含：

1. **headline**（≤25字）：提炼核心结论，含关键数据
2. **summary**（用以下格式输出，四段式，总 350-450 字）：
   • 核心观点：（至少 80 字）点明趋势本质和关键数据
   • 数据支撑：（至少 90 字）引用具体数据和信息源
   • 行业影响：（至少 90 字）分析对产业链的具体影响
   • 趋势展望：（至少 90 字）预判走向、机会和风险
   每段以"• 子标题："开头，总字数控制在 350-450 字，段间无空行

## 覆盖维度
- 市场规模/增长预测/区域分析
- 企业战略/融资并购/产能扩张
- 技术创新/新品发布/材料突破
- 政策法规/行业标准/质保认证
- 渠道变革/消费趋势/服务升级

## 写作参考
"• 核心观点：全球汽车贴膜市场正经历结构性增长，中国以 42% 区域份额持续领跑，TPU 隐形车衣向中端车型加速渗透成为核心驱动力。
• 数据支撑：据 Grand View Research 最新报告，2026 年全球汽车贴膜市场规模预计达 139 亿美元，2033 年将增至 263 亿美元，年复合增长率 9.6%。装贴率从 2[...]
• 行业影响：电动汽车全景天幕普及催生高效隔热膜结构性需求，TPU 粒子供应波动和低价劣质膜扰乱市场秩序成为行业主要挑战。头部膜企加速自��[...]
• 趋势展望：技术领先的头部膜企和具备规模化成本优势的国产品牌将在下一轮竞争中占据有利位置。欧美多地对车窗透光率法规趋严将倒逼高透光[...]

严格输出 JSON，无其他内容。共 ${newsList.length} 条，index 0-${newsList.length - 1}：
{
  "analyses": [
    { "index": 0, "headline": "…", "summary": "约400字的深度分析…" }
  ]
}`;
}

function previewText(text: string | undefined, n = 1000) {
  if (!text) return '<empty>';
  return text.length > n ? text.slice(0, n) + '...<truncated>' : text;
}

async function fetchWithRetries(url: string, options: any, attempts = 3): Promise<string> {
  const baseDelay = 1000;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let controller: AbortController | null = null;
    try {
      controller = new AbortController();
      const timeout = setTimeout(() => controller!.abort(), 120000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout as any);

      const status = res.status;
      const text = await res.text();
      console.log(`[AI] attempt=${attempt} status=${status} bodyPreview=${previewText(text, 1000)}`);

      if (!res.ok) {
        // For transient server errors or rate limit, retry
        if ((status === 429 || status >= 500) && attempt < attempts) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.warn(`[AI] transient http ${status}, retrying after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`HTTP ${status} ${previewText(text, 500)}`);
      }

      if (!text || text.trim().length === 0) {
        throw new Error(`empty body (status ${status})`);
      }

      return text;
    } catch (err: any) {
      const isAbort = err && err.name === 'AbortError';
      console.error(`[AI] request error attempt=${attempt} abort=${isAbort} message=${err?.message}`);
      if (attempt < attempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  // 兜底：满足编译器的穷尽性检查（正常情况下每次尝试要么返回要么抛错）
  throw new Error(`[AI] 连续 ${attempts} 次请求均未成功`);
}

export async function generateBriefing(newsList: NewsItem[], isRetry = false): Promise<AiBriefing | null> {
  if (!CONFIG.ai.enabled || !CONFIG.ai.apiKey) {
    console.log('DeepSeek API Key 未配置，跳过 AI 深度分析');
    return null;
  }
  if (newsList.length === 0) return null;

  const prompt = buildPrompt(newsList);

  try {
    const payload = {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: isRetry
            ? '你是汽车膜行业首席分析师。⚠️ 严格要求：每条 summary 四段式每段至少80字，总350-450字。上次输出字数不足，这次务必写够字数，且只输出 JSON。'
            : '你是汽车膜行业首席分析师。每条 summary 四段式每段至少80字，总350-450字。信息密度高，读完掌握全局。只输出 JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: isRetry ? 0.5 : 0.7,
      max_tokens: 30000,
      frequency_penalty: 0.2,
    };

    const responseText = await fetchWithRetries('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.ai.apiKey}`,
      },
      body: JSON.stringify(payload),
    }, 3);

    if (!responseText) {
      throw new Error('DeepSeek 返回空响应');
    }

    // Try parse response as JSON similar to previous behavior
    let parsed: any;
    try {
      // The provider is expected to return a JSON object like { choices: [{ message: { content } }] }
      parsed = JSON.parse(responseText);
    } catch (e) {
      // If provider wrapped JSON in markdown code fences, try to extract
      let t = responseText.trim();
      if (t.startsWith('```')) {
        t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      try {
        parsed = JSON.parse(t);
      } catch (e2) {
        throw new Error(`无法解析 AI 返回内容为 JSON，responsePreview=${previewText(responseText, 1000)}`);
      }
    }

    const content = parsed?.choices?.[0]?.message?.content;
    if (!content) {
      // If structure differs, try to stringify whole parsed for debugging
      console.error('[AI] response parsed but missing choices[0].message.content, parsedPreview=', previewText(JSON.stringify(parsed), 2000));
      throw new Error('空响应或返回结构不符合预期');
    }

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const briefing = JSON.parse(jsonStr) as AiBriefing;
    if (!Array.isArray(briefing.analyses) || briefing.analyses.length === 0) {
      throw new Error(`格式不正确，analyses 为空或不是数组，preview=${previewText(jsonStr, 1000)}`);
    }

    const avgLen = Math.round(
      briefing.analyses.reduce((s, a) => s + (a.summary?.length || 0), 0) / briefing.analyses.length
    );
    console.log(`AI 分析完成: ${briefing.analyses.length} 条, 平均 ${avgLen} 字/条`);
    return briefing;
  } catch (err: any) {
    console.error('AI 分析失败(已重试3次):', err?.message || err);
    // Return null to keep existing behavior (上层会进行质检判断)
    return null;
  }
}
