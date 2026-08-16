/**
 * §27 scoped-AI-edit intent detection. Pure keyword matching (Chinese +
 * English). Deterministic: first intent group (in declaration order) wins ties.
 */
export interface DetectedIntent {
  intent: string;
  confidence: number;
}

interface IntentGroup {
  intent: string;
  keywords: string[];
}

const INTENT_GROUPS: IntentGroup[] = [
  { intent: 'shorten', keywords: ['精简', '缩短', '压缩', '缩短文字', 'short'] },
  { intent: 'executive', keywords: ['领导', '高管', '正式', '汇报', 'executive'] },
  { intent: 'academic', keywords: ['学术', 'academic'] },
  { intent: 'clearer', keywords: ['清楚', '清晰', 'clear'] },
  { intent: 'translate', keywords: ['翻译', '英文', 'translate'] },
  { intent: 'visual', keywords: ['可视化', '更视觉', '更直观', 'visual'] },
  { intent: 'reduceText', keywords: ['减少文字', '字太多', '删减文字'] },
  { intent: 'relayout', keywords: ['布局', '换布局', '另一种', '重新排版', 'layout'] },
  { intent: 'alternatives', keywords: ['三版', '备选', '变体', '多版本', 'alternatives'] },
  { intent: 'toTimeline', keywords: ['时间线', '时间轴', 'timeline'] },
  { intent: 'toArchitecture', keywords: ['架构', '架构图', 'architecture'] },
  { intent: 'splitSlide', keywords: ['拆页', '拆分', 'split'] },
  { intent: 'simplify', keywords: ['简化', 'simplify'] },
  { intent: 'addStep', keywords: ['加一步', '加一个步骤', '新增步骤', 'add step'] },
  { intent: 'mergeSteps', keywords: ['合并', '合并步骤', 'merge'] },
  { intent: 'betterTitle', keywords: ['标题', '优化标题', 'title'] },
  { intent: 'addEvidence', keywords: ['证据', '数据来源', 'evidence', '数据支撑'] },
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function detectIntent(instruction: string): DetectedIntent {
  const text = instruction.toLowerCase();
  let best: IntentGroup | null = null;
  let bestCount = -1;

  for (const group of INTENT_GROUPS) {
    let count = 0;
    for (const kw of group.keywords) {
      if (text.includes(kw.toLowerCase())) count += 1;
    }
    if (count > bestCount) {
      best = group;
      bestCount = count;
    }
  }

  if (!best || bestCount === 0) {
    return { intent: 'relayout', confidence: 0.4 };
  }

  const confidence = clamp(bestCount / best.keywords.length, 0.4, 1);
  return { intent: best.intent, confidence };
}
