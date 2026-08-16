import type { AIProvider, AiRequest, AiResponse } from './types';

/**
 * Intent classification categories and their keyword signatures. Order is
 * significant: the first entry (`explain`) is the tie-break / default.
 */
const INTENTS: Array<{ id: string; keywords: string[] }> = [
  { id: 'explain', keywords: ['解释', '说明', '什么是', '为什么', '介绍', '概述', 'explain'] },
  { id: 'compare', keywords: ['对比', '比较', '区别', '差异', 'vs', 'compare'] },
  { id: 'prove', keywords: ['证明', '论证', '验证', '数据支撑', '证据', 'prove'] },
  { id: 'decide', keywords: ['决策', '决定', '选择', '方案', '建议', '结论', 'decide'] },
  { id: 'update', keywords: ['更新', '进展', '最新', '动态', '汇报', 'update'] },
  { id: 'timeline', keywords: ['时间线', '历程', '里程碑', '时间轴', '规划', 'timeline'] },
  { id: 'architecture', keywords: ['架构', '体系', '结构', '平台', 'architecture'] },
  { id: 'process', keywords: ['流程', '步骤', '过程', '环节', '路径', 'process'] },
  { id: 'kpi', keywords: ['kpi', '指标', '关键指标', '数据', '目标', '完成率'] },
  { id: 'data_story', keywords: ['数据故事', '趋势', '增长', '同比', '环比', 'data_story'] },
  { id: 'quote', keywords: ['引用', '名言', '观点', '金句', 'quote'] },
  { id: 'summary', keywords: ['总结', '汇总', '回顾', '要点', 'summary'] },
];

/** Common Chinese fillers removed by the "shorten" rule (longest first). */
const FILLERS = [
  '再进一步',
  '进一步',
  '持续',
  '积极',
  '扎实',
  '切实',
  '有效',
  '全面',
  '深入',
  '推进',
  '的',
  '了',
  '呢',
  '吧',
  '吗',
];

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

/**
 * Fully deterministic offline rules — no network, no randomness. The same
 * input always produces the same output.
 */
export class LocalRuleProvider implements AIProvider {
  id = 'local-rule';

  async complete(request: AiRequest): Promise<AiResponse> {
    return { text: this.run(request), provider: this.id, task: request.task };
  }

  private run(request: AiRequest): string {
    switch (request.task) {
      case 'fast':
        return this.fast(request.prompt);
      case 'reasoning':
        return this.reasoning(request.prompt);
      case 'vision':
        return '视觉检查完成：无异常';
      case 'image':
        return 'image:abstract-diagram';
    }
  }

  private fast(prompt: string): string {
    if (prompt.includes('分类') || prompt.includes('classify')) return this.classify(prompt);
    if (prompt.includes('短') || prompt.includes('shorten')) return this.shorten(prompt);
    return prompt.slice(0, 100);
  }

  private classify(prompt: string): string {
    const scores = INTENTS.map((intent) =>
      intent.keywords.reduce((sum, kw) => sum + countOccurrences(prompt, kw), 0),
    );
    let max = -1;
    for (const s of scores) if (s > max) max = s;
    const winners = INTENTS.filter((_, idx) => scores[idx] === max);
    if (winners.length !== 1) return 'explain';
    return winners[0]!.id;
  }

  private shorten(prompt: string): string {
    let out = prompt;
    for (const filler of FILLERS) out = out.split(filler).join('');
    return out.slice(0, 60);
  }

  private reasoning(prompt: string): string {
    if (prompt.includes('故事线') || prompt.includes('storyline')) return this.storyline(prompt);
    if (prompt.includes('路线') || prompt.includes('roadmap')) return this.roadmap(prompt);
    return `OK: ${prompt.slice(0, 80)}`;
  }

  private storyline(prompt: string): string {
    const parts = prompt
      .split('。')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    const purposes = ['cover', 'situation', 'architecture', 'process', 'kpi', 'summary'] as const;
    const slides = parts.map((message, i) => ({ purpose: purposes[i]!, message }));
    return JSON.stringify({ deckGoal: parts[0] ?? '', audience: '', slides });
  }

  private roadmap(prompt: string): string {
    const tokens = prompt
      .split(/[→、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return JSON.stringify({ nodes: tokens.map((label) => ({ label })) });
  }
}
