import type { StyleKind, Theme } from './types';

const NEUTRALS = ['#FFFFFF', '#F5F7FA', '#E8EDF3', '#CBD5E1', '#94A3B8', '#475569', '#1E293B'];

function baseTheme(id: string, name: string, kind: StyleKind, colors: Theme['colors']): Theme {
  return {
    id,
    name,
    kind,
    colors,
    fonts: {
      heading: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
      body: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
      mono: '"SF Mono", "JetBrains Mono", "Consolas", monospace',
    },
    radius: 8,
    borderWidth: 1,
    spacing: 24,
    shadow: { color: '#0F172A', blur: 16, offsetX: 0, offsetY: 4, opacity: 0.08 },
    title: { fontSize: 32, color: '#1E293B', bold: true, align: 'left' },
    subtitle: { fontSize: 18, color: '#475569' },
    body: { fontSize: 22, color: '#1E293B', lineSpacing: 1.5 },
    keyNumber: { fontSize: 48, color: colors.primary, bold: true },
    footer: { fontSize: 11, color: '#94A3B8', showPageNumber: true },
    diagram: {
      nodeFill: colors.primaryLight ?? '#E8F0FA',
      nodeStroke: colors.primary,
      edgeColor: '#94A3B8',
      radius: 8,
      edgeWidth: 1.5,
      arrow: 'arrow',
    },
    chart: { palette: colors.chartPalette, textColor: '#475569' },
    cover: { titleFontSize: 44, accentBar: true, accentBarColor: colors.primary },
  };
}

export const THEMES: Theme[] = [
  baseTheme('jkinco-blue', '建科蓝 · Corporate Modern', 'corporate-modern', {
    primary: '#1E56A0',
    primaryDark: '#163E75',
    primaryLight: '#E8F0FA',
    secondary: '#3B82C4',
    accent: '#E8A33D',
    background: '#F1F5F9',
    slideBackground: '#FFFFFF',
    text: '#1E293B',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    border: '#CBD5E1',
    neutrals: NEUTRALS,
    chartPalette: ['#1E56A0', '#E8A33D', '#3B82C4', '#5FB39A', '#8B7EC8', '#D96C6C'],
  }),
  baseTheme('corporate-classic', 'Corporate Classic', 'corporate-classic', {
    primary: '#163A5F',
    primaryDark: '#0E2742',
    primaryLight: '#EAF1F8',
    secondary: '#7A9BB8',
    accent: '#C0392B',
    background: '#EEF1F4',
    slideBackground: '#FFFFFF',
    text: '#20303C',
    textSecondary: '#455A66',
    textMuted: '#8395A0',
    border: '#B7C4CC',
    neutrals: NEUTRALS,
    chartPalette: ['#163A5F', '#C0392B', '#7A9BB8', '#A3B18A', '#D9A066', '#6D6875'],
  }),
  baseTheme('research', 'Research', 'research', {
    primary: '#3D5A98',
    primaryDark: '#2A3F6F',
    primaryLight: '#ECF0F8',
    secondary: '#7B6FC0',
    accent: '#E07A5F',
    background: '#F4F5F9',
    slideBackground: '#FFFFFF',
    text: '#22283A',
    textSecondary: '#4A5168',
    textMuted: '#8A90A6',
    border: '#C9CEDD',
    neutrals: NEUTRALS,
    chartPalette: ['#3D5A98', '#7B6FC0', '#E07A5F', '#81B29A', '#F2CC8F', '#9E9E9E'],
  }),
  baseTheme('executive', 'Executive', 'executive', {
    primary: '#101828',
    primaryDark: '#05080F',
    primaryLight: '#E9EDF2',
    secondary: '#344054',
    accent: '#B98A2F',
    background: '#F4F5F6',
    slideBackground: '#FFFFFF',
    text: '#101828',
    textSecondary: '#475467',
    textMuted: '#98A2B3',
    border: '#D0D5DD',
    neutrals: NEUTRALS,
    chartPalette: ['#101828', '#B98A2F', '#344054', '#667085', '#7F5E1D', '#98A2B3'],
  }),
  baseTheme('technical', 'Technical', 'technical', {
    primary: '#0E7490',
    primaryDark: '#155E75',
    primaryLight: '#E4F4F7',
    secondary: '#334155',
    accent: '#F59E0B',
    background: '#F0F4F6',
    slideBackground: '#FFFFFF',
    text: '#1E293B',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    border: '#C7D2DA',
    neutrals: NEUTRALS,
    chartPalette: ['#0E7490', '#F59E0B', '#334155', '#10B981', '#8B5CF6', '#EF4444'],
  }),
  baseTheme('minimal', 'Minimal', 'minimal', {
    primary: '#18181B',
    primaryDark: '#09090B',
    primaryLight: '#F2F2F2',
    secondary: '#52525B',
    accent: '#71717A',
    background: '#FAFAFA',
    slideBackground: '#FFFFFF',
    text: '#18181B',
    textSecondary: '#52525B',
    textMuted: '#A1A1AA',
    border: '#E4E4E7',
    neutrals: NEUTRALS,
    chartPalette: ['#18181B', '#71717A', '#A1A1AA', '#D4D4D8', '#52525B', '#E4E4E7'],
  }),
];

export const DEFAULT_THEME_ID = 'jkinco-blue';

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export const THEME_IDS = THEMES.map((t) => t.id);
export const STYLE_KINDS: StyleKind[] = THEMES.map((t) => t.kind);
