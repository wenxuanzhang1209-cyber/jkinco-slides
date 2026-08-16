import type { RichText } from '@jkinco/scene-schema';
import { textFromLines, textFromPlain, textToPlain } from '@jkinco/scene-schema';

/** Remove common Chinese filler words to compress text without changing meaning. */
const FILLER_PATTERNS: Array<[RegExp, string]> = [
  [/^我们/g, ''],
  [/我们进行了/g, ''],
  [/我们开展了/g, ''],
  [/进一步/g, ''],
  [/不断加强/g, '加强'],
  [/持续提升/g, '提升'],
  [/全面推动/g, '推动'],
  [/深入推进/g, '推进'],
  [/有效/g, ''],
  [/积极/g, ''],
  [/扎实/g, ''],
  [/切实/g, ''],
  [/大力/g, ''],
  [/加快推进/g, '加快'],
  [/的方面/g, ''],
  [/方面的工作/g, ''],
  [/等相关工作/g, ''],
  [/相关工作/g, ''],
  [/工作。/g, '。'],
  [/，为/g, '，'],
  [/、以及/g, '、'],
];

/**
 * Rule-based Chinese text compression (used by AI "Shorten" and by the
 * Content Compression Gate §4.1/§5.3 step 1). Deterministic and safe:
 * never changes numbers, proper nouns or sentence count.
 */
export function compressText(text: RichText | string): RichText {
  const plain = typeof text === 'string' ? text : textToPlain(text);
  let out = plain;
  for (const [re, rep] of FILLER_PATTERNS) {
    out = out.replace(re, rep);
  }
  // Collapse redundant punctuation artifacts.
  out = out.replace(/，。/g, '。').replace(/，、/g, '、').replace(/。，/g, '。').replace(/\s+/g, ' ');
  return textFromPlain(out);
}

/** Character budget enforcement: shorten plain text to at most `budget` units. */
export function truncateToBudget(text: RichText | string, budget: number): RichText {
  const plain = typeof text === 'string' ? text : textToPlain(text);
  if (plain.length <= budget) return typeof text === 'string' ? textFromPlain(plain) : text;
  // Prefer cutting at sentence boundaries.
  const sentences = plain.split(/(?<=[。；;！？!?])/);
  const kept: string[] = [];
  let used = 0;
  for (const s of sentences) {
    if (used + s.length <= budget) {
      kept.push(s);
      used += s.length;
    } else if (kept.length === 0) {
      kept.push(s.slice(0, budget));
      break;
    } else {
      break;
    }
  }
  let result = kept.join('');
  if (result.length === 0) result = plain.slice(0, budget);
  // Don't leave dangling punctuation.
  result = result.replace(/[，、；;:：]$/, '');
  return textFromPlain(result);
}

/** Make a title more executive: shorter, assertive. */
export function executiveTitle(title: string, budget: number): string {
  const t = textToPlain(truncateToBudget(compressText(title), budget));
  const cleaned = t
    .replace(/^关于/, '')
    .replace(/的研究$/, '研究')
    .replace(/的分析$/, '分析')
    .replace(/的汇报$/, '');
  return cleaned || t;
}

/** Split a long paragraph into bullets at natural boundaries. */
export function toBullets(text: RichText | string, maxPerBullet = 22): RichText {
  const plain = typeof text === 'string' ? text : textToPlain(text);
  const parts = plain
    .split(/[。；;]|(?<=[\u4e00-\u9fff]{6,})、/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const bullets = parts.map((p) => (p.length > maxPerBullet ? p.slice(0, maxPerBullet - 1) + '…' : p));
  const lines = bullets.map((b) => `- ${b}`);
  return textFromLines(lines.length > 0 ? lines : [plain]);
}

export interface BudgetCheck {
  ok: boolean;
  violations: Array<{ rule: string; message: string; actual: number; limit: number }>;
}

export interface ContentBudgetSpec {
  titleMax: number;
  subtitleMax: number;
  bodyTarget: number;
  bodyHard: number;
  bulletsDefault: number;
  bulletsMax: number;
  bulletChars: number;
}

/** §5.1 hard content budget enforcement for a content block. */
export function checkContentBudget(
  content: { title?: string; subtitle?: string; body?: string; bulletCount?: number; bulletCharsMax?: number },
  budget: ContentBudgetSpec,
): BudgetCheck {
  const violations: BudgetCheck['violations'] = [];
  const t = content.title ?? '';
  const s = content.subtitle ?? '';
  const b = content.body ?? '';
  if (t.length > budget.titleMax) violations.push({ rule: 'title', message: '标题过长', actual: t.length, limit: budget.titleMax });
  if (s.length > budget.subtitleMax) violations.push({ rule: 'subtitle', message: '副标题过长', actual: s.length, limit: budget.subtitleMax });
  if (b.length > budget.bodyHard) violations.push({ rule: 'body', message: '正文超过硬上限', actual: b.length, limit: budget.bodyHard });
  else if (b.length > budget.bodyTarget) violations.push({ rule: 'body', message: '正文超过目标字数', actual: b.length, limit: budget.bodyTarget });
  if ((content.bulletCount ?? 0) > budget.bulletsMax) violations.push({ rule: 'bullets', message: '项目符号过多', actual: content.bulletCount!, limit: budget.bulletsMax });
  if ((content.bulletCharsMax ?? 0) > budget.bulletChars) violations.push({ rule: 'bulletChars', message: '单条项目符号过长', actual: content.bulletCharsMax!, limit: budget.bulletChars });
  return { ok: violations.length === 0, violations };
}

/** Basic English translation for the Translate intent (deterministic glossary-free). */
export function translateToEnglishBasic(text: RichText | string): string {
  const plain = typeof text === 'string' ? text : textToPlain(text);
  const terms: Array<[RegExp, string]> = [
    [/多模态/g, 'Multimodal '],
    [/数据标注/g, 'Data Annotation '],
    [/数据/g, 'Data '],
    [/平台/g, 'Platform'],
    [/技术路线/g, 'Technical Roadmap'],
    [/研究/g, 'Research'],
    [/课题/g, 'Project'],
    [/汇报/g, 'Report'],
    [/系统/g, 'System'],
    [/架构/g, 'Architecture'],
    [/阶段/g, 'Phase'],
    [/目标/g, 'Objective'],
    [/启动/g, 'Launch'],
    [/项目/g, 'Project'],
    [/应用/g, 'Application'],
    [/年度/g, 'Annual '],
    [/计划/g, 'Plan'],
    [/分析/g, 'Analysis'],
    [/建设/g, 'Construction'],
    [/平台研发与应用/g, 'Platform R&D and Application'],
  ];
  let out = plain;
  for (const [re, rep] of terms) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').trim();
}
