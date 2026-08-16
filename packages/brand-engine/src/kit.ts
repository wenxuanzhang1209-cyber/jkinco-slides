import { uid } from '@jkinco/scene-schema';

export interface BrandKit {
  id: string;
  name: string;
  logo?: string; // dataURL or URL
  fonts?: { heading?: string; body?: string };
  colors?: { primary?: string; secondary?: string; accent?: string };
  footer?: { text?: string; showPageNumber?: boolean };
  confidentiality?: string; // e.g. '内部资料 注意保密'
  watermark?: { text: string; opacity: number };
  chartDefaults?: { palette?: string[] };
  diagramDefaults?: { fill?: string; stroke?: string; radius?: number };
  lockedRules?: string[];
}

export const BRAND_RULES = [
  'colors',
  'fonts',
  'logo',
  'footer',
  'confidentiality',
  'watermark',
  'chartDefaults',
  'diagramDefaults',
] as const;

export type BrandRule = (typeof BRAND_RULES)[number];

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function createBrandKit(partial: Partial<BrandKit> & { name: string }): BrandKit {
  return {
    id: partial.id ?? uid('kit'),
    name: partial.name,
    logo: partial.logo,
    fonts: partial.fonts,
    colors: partial.colors,
    footer: partial.footer,
    confidentiality: partial.confidentiality,
    watermark: partial.watermark,
    chartDefaults: partial.chartDefaults,
    diagramDefaults: partial.diagramDefaults,
    lockedRules: partial.lockedRules ?? [],
  };
}

export function isRuleLocked(kit: BrandKit, rule: BrandRule): boolean {
  return (kit.lockedRules ?? []).includes(rule);
}

export function lockRule(kit: BrandKit, rule: BrandRule): BrandKit {
  const current = kit.lockedRules ?? [];
  if (current.includes(rule)) return kit;
  return { ...kit, lockedRules: [...current, rule] };
}

export function unlockRule(kit: BrandKit, rule: BrandRule): BrandKit {
  const current = kit.lockedRules ?? [];
  if (!current.includes(rule)) return kit;
  return { ...kit, lockedRules: current.filter((r) => r !== rule) };
}

/**
 * Validate a brand kit. Returns a list of human-readable errors (empty = valid).
 */
export function validateBrandKit(kit: BrandKit): string[] {
  const errors: string[] = [];

  if (typeof kit.name !== 'string' || kit.name.trim() === '') {
    errors.push('缺少 kit name');
  }

  if (kit.colors) {
    for (const [key, value] of Object.entries(kit.colors)) {
      if (value !== undefined && !HEX_RE.test(value)) {
        errors.push(`颜色 ${key} 不是合法 hex: ${String(value)}`);
      }
    }
  }

  if (kit.watermark) {
    const op = kit.watermark.opacity;
    if (typeof op !== 'number' || Number.isNaN(op) || op < 0 || op > 1) {
      errors.push('watermark.opacity 必须在 0..1 之间');
    }
  }

  for (const rule of kit.lockedRules ?? []) {
    if (!(BRAND_RULES as readonly string[]).includes(rule)) {
      errors.push(`未知锁定规则: ${rule}`);
    }
  }

  return errors;
}
