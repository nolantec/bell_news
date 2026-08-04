import type { NewsItem } from './newsService';
import type { AiBriefing } from './aiService';

interface QaResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * 质检：发送前自动把关内容质量
 */
export function qualityCheck(
  newsList: NewsItem[],
  aiBriefing: AiBriefing | null
): QaResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. 数量检查
  if (newsList.length < 8) {
    errors.push(`新闻条数不足：${newsList.length}/10，少于8条不发送`);
  } else if (newsList.length < 10) {
    warnings.push(`新闻条数偏少：${newsList.length}/10`);
  }

  // 2. AI 分析检查
  if (!aiBriefing) {
    errors.push('AI 深度分析缺失，不发送');
  } else if (aiBriefing.analyses.length < 8) {
    errors.push(`AI 分析条数不足：${aiBriefing.analyses.length}/10`);
  }

  // 3. 每条摘要质量检查
  if (aiBriefing) {
    for (let i = 0; i < aiBriefing.analyses.length; i++) {
      const a = aiBriefing.analyses[i];
      const len = a.summary.length;

      if (len < 300) {
        errors.push(`第${i + 1}条摘要过短(${len}字)，需≥300字`);
      } else if (len < 400) {
        warnings.push(`第${i + 1}条摘要偏短(${len}字，建议≥400字)`);
      }

      // 四段式检查
      const hasCoreView = a.summary.includes('核心观点');
      const hasData = a.summary.includes('数据支撑');
      const hasImpact = a.summary.includes('行业影响');
      const hasOutlook = a.summary.includes('趋势展望');

      if (!hasCoreView || !hasData || !hasImpact || !hasOutlook) {
        const missing = [
          !hasCoreView && '核心观点',
          !hasData && '数据支撑',
          !hasImpact && '行业影响',
          !hasOutlook && '趋势展望',
        ]
          .filter(Boolean)
          .join('、');
        errors.push(`第${i + 1}条缺少四段式结构：${missing}`);
      }
    }
  }

  // 4. 去重检查
  const headlines = newsList.map((n) => n.title.slice(0, 30));
  const seen = new Set<string>();
  const dups: number[] = [];
  for (let i = 0; i < headlines.length; i++) {
    if (seen.has(headlines[i])) dups.push(i + 1);
    seen.add(headlines[i]);
  }
  if (dups.length > 0) {
    errors.push(`发现重复新闻：第 ${dups.join('、')} 条`);
  }

  // 5. 链接检查
  for (let i = 0; i < newsList.length; i++) {
    const link = newsList[i].link;
    if (!link.includes('baidu.com') && !link.includes('bing.com')) {
      warnings.push(`第${i + 1}条链接非搜索引擎链接`);
    }
  }

  const passed = errors.length === 0;

  return { passed, warnings, errors };
}
