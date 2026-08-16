/**
 * Canonical keyboard shortcut map (§7.1 — professional editor feel).
 * The editor binds these; this module is the single source of truth used
 * by the Command Palette, the Help overlay and the E2E tests.
 */

export interface ShortcutDef {
  id: string;
  keys: string[];
  description: string;
  category: 'edit' | 'view' | 'file' | 'ai';
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'undo', keys: ['mod+z'], description: '撤销', category: 'edit' },
  { id: 'redo', keys: ['mod+shift+z', 'mod+y'], description: '重做', category: 'edit' },
  { id: 'selectAll', keys: ['mod+a'], description: '全选当前页对象', category: 'edit' },
  { id: 'delete', keys: ['delete', 'backspace'], description: '删除选中对象', category: 'edit' },
  { id: 'duplicate', keys: ['mod+d'], description: '复制选中对象', category: 'edit' },
  { id: 'copy', keys: ['mod+c'], description: '复制', category: 'edit' },
  { id: 'paste', keys: ['mod+v'], description: '粘贴', category: 'edit' },
  { id: 'cut', keys: ['mod+x'], description: '剪切', category: 'edit' },
  { id: 'group', keys: ['mod+g'], description: '组合', category: 'edit' },
  { id: 'ungroup', keys: ['mod+shift+g'], description: '取消组合', category: 'edit' },
  { id: 'move1', keys: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'], description: '方向键移动 1pt', category: 'edit' },
  { id: 'move10', keys: ['shift+arrowup', 'shift+arrowdown', 'shift+arrowleft', 'shift+arrowright'], description: 'Shift+方向键移动 10pt', category: 'edit' },
  { id: 'altDragCopy', keys: ['alt+drag'], description: 'Alt/Option 拖拽复制', category: 'edit' },
  { id: 'shiftConstrain', keys: ['shift+drag'], description: 'Shift 锁定比例 / 方向', category: 'edit' },
  { id: 'shiftResize', keys: ['shift+resize'], description: 'Shift 等比缩放', category: 'edit' },
  { id: 'spacePan', keys: ['space+drag'], description: 'Space 拖动画布', category: 'view' },
  { id: 'zoomIn', keys: ['mod+='], description: '放大', category: 'view' },
  { id: 'zoomOut', keys: ['mod+-'], description: '缩小', category: 'view' },
  { id: 'zoomReset', keys: ['mod+0'], description: '重置缩放', category: 'view' },
  { id: 'zoomFit', keys: ['shift+1'], description: '适合窗口', category: 'view' },
  { id: 'commandPalette', keys: ['mod+k'], description: '打开命令面板 / AI 命令', category: 'ai' },
  { id: 'present', keys: ['mod+shift+p'], description: '开始演示', category: 'file' },
  { id: 'save', keys: ['mod+s'], description: '保存', category: 'file' },
  { id: 'aiBar', keys: ['/'], description: '聚焦底部 AI 命令栏', category: 'ai' },
  { id: 'escape', keys: ['escape'], description: '取消选择 / 退出编辑', category: 'edit' },
  { id: 'lock', keys: ['mod+shift+l'], description: '锁定 / 解锁', category: 'edit' },
  { id: 'hide', keys: ['mod+shift+h'], description: '隐藏 / 显示', category: 'edit' },
  { id: 'bringForward', keys: ['mod+]'], description: '上移一层', category: 'edit' },
  { id: 'sendBackward', keys: ['mod+['], description: '下移一层', category: 'edit' },
  { id: 'bringFront', keys: ['mod+shift+]'], description: '置于顶层', category: 'edit' },
  { id: 'sendBack', keys: ['mod+shift+['], description: '置于底层', category: 'edit' },
];

export function findShortcut(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

/** Normalize a KeyboardEvent into our shortcut key format (mod = cmd/ctrl). */
export function eventToShortcut(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): string {
  const mod = e.metaKey || e.ctrlKey ? 'mod+' : '';
  const shift = e.shiftKey ? 'shift+' : '';
  const alt = e.altKey ? 'alt+' : '';
  const key = e.key.toLowerCase();
  return `${mod}${shift}${alt}${key}`;
}

/** Resolve a keyboard event against the shortcut table. */
export function matchShortcut(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): string | null {
  const combo = eventToShortcut(e);
  for (const def of SHORTCUTS) {
    if (def.keys.some((k) => normalizeCombo(k) === normalizeCombo(combo))) return def.id;
  }
  return null;
}

function normalizeCombo(combo: string): string {
  const parts = combo.split('+');
  const mod = parts.includes('mod') ? 'mod' : null;
  const shift = parts.includes('shift') ? 'shift' : null;
  const alt = parts.includes('alt') ? 'alt' : null;
  const key = parts.find((p) => !['mod', 'shift', 'alt'].includes(p)) ?? '';
  return [mod, shift, alt].filter(Boolean).join('+') + (mod || shift || alt ? '+' : '') + key;
}

export const EDITOR_SHORTCUT_IDS = SHORTCUTS.map((s) => s.id);
