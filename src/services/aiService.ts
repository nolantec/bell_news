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

/**
 * 构建综合趋势分析 prompt
 * 核心思路：不逐条翻译新闻，而是综合所有信息源归纳出 10 条行业动态与趋势
 */
function buildPrompt(newsList: NewsItem[]): string {
  // 整理所有新闻数据供 AI 参考
  const newsData = newsList
    .map(
      (n, i) =>
        `[来源${i + 1}] 标题：${n.title}\n来源：${n.source || '未知'}\n内容：${n.description || '无'}`
    )
    .join('\n\n');

  return `你是一位资深汽车膜行业分析师，为专业投资者和从业者撰写每日行业趋势简报。

以下是今天抓取到的 ${newsList.length} 条汽车膜行业相关新闻数据，涵盖国内外多家专业市场研究机构、行业协会、膜企官方发布以及汽车后市场权威媒体的信息。

## 原始新闻数据
${newsData}

## 任务要求

请基于以上信息，综合归纳整理出 **10 条行业动态与趋势**。每条要求：

1. **headline**（精炼标题，不超过 30 字）：
   - 提炼核心趋势或关键事件
   - 如涉及具体数据（市场规模、增长率、份额等）务必在标题中体现

2. **summary**（深度分析摘要，4-6 句话）：
   - 综合多条相关信息源，形成完整的行业洞察
   - 标注信息来源（如"据 Grand View Research 报告显示...""膜企 XPEL 官方宣布...""行业协会数据显示..."）
   - 补充行业背景：市场规模、竞争格局、技术路线、政策法规
   - 说明该动态对汽车膜行业（PPF/窗膜/改色膜）的影响
   - 如涉及具体企业名、品牌名、数据，务必保留
   - 不要简单翻译或复述标题，要有分析和洞察

## 覆盖范围要求
- 涵盖 PPF 隐形车衣、隔热窗膜、改色膜三大品类
- 兼顾市场规模/预测、企业战略/合作、技术研发/新品、政策法规、渠道/服务等维度
- 国内和国际信息自然融合，不刻意区分

## 参考风格
"据 Grand View Research 发布的最新市场报告，2026 年全球汽车贴膜市场规模预计达 139 亿美元，并将在 2033 年增长至 263 亿美元。随着全球电动汽车销量剧增，大面积全景天幕的普及促使车主对高效能隔热与防紫外线保护膜的需求显著上升。亚太地区以 42% 的市场份额占据领先地位，中国作为全球最大汽车市场继续成为增长核心驱动力。"

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "analyses": [
    { "index": 0, "headline": "趋势标题...", "summary": "深度分析..." },
    { "index": 1, "headline": "趋势标题...", "summary": "深度分析..." }
  ]
}

共输出 10 条，index 从 0 到 9。`;
}

export async function generateBriefing(
  newsList: NewsItem[]
): Promise<AiBriefing | null> {
  if (!CONFIG.ai.enabled || !CONFIG.ai.apiKey) {
    console.log('DeepSeek API Key 未配置，跳过 AI 深度分析');
    return null;
  }

  if (newsList.length === 0) return null;

  const prompt = buildPrompt(newsList);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

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
              '你是一位资深汽车膜行业分析师。你的分析专业、有数据支撑、有行业洞察，综合多家机构信息形成完整观点。只输出 JSON。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 6000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`DeepSeek API 返回错误: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('DeepSeek API 返回空内容');
      return null;
    }

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const briefing = JSON.parse(jsonStr) as AiBriefing;

    if (!Array.isArray(briefing.analyses) || briefing.analyses.length === 0) {
      console.error('AI 返回数据格式不正确');
      return null;
    }

    console.log(`AI 行业趋势分析完成: ${briefing.analyses.length} 条`);
    return briefing;
  } catch (err) {
    console.error('AI 分析生成失败:', err);
    return null;
  }
}
