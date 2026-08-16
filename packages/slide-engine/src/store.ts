import type { DataSet, Deck, NamedVersion, RichText, SlideElement, Theme } from '@jkinco/scene-schema';
import {
  createDeck,
  createSlide,
  deepClone,
  getTheme,
  normalizeZIndexes,
  uid,
  validateDeck,
} from '@jkinco/scene-schema';
import {
  CommandExecutor,
  alignCommand,
  bindDataCommand,
  createElementsCommand,
  deleteElementsCommand,
  deleteSlideCommand,
  duplicateSlideCommand,
  groupCommand,
  insertSlideCommand,
  moveElementsCommand,
  moveSlideCommand,
  removeSlide,
  rotateElementCommand,
  resizeElementCommand,
  ungroupCommand,
  updateChartDataCommand,
  updateElementPropsCommand,
  updateSlidePropsCommand,
  updateStyleCommand,
  updateTextCommand,
  zOrderCommand,
  type AlignMode,
  type Command,
  type CompositeCommand,
  type ZOrderOp,
} from '@jkinco/command-engine';

export interface AuditEntry {
  at: number;
  kind: string;
  label: string;
  actor: 'user' | 'ai' | 'system';
  objectCount?: number;
}

export interface PersistenceAdapter {
  save(key: string, value: string): Promise<void>;
  load(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class MemoryPersistence implements PersistenceAdapter {
  private map = new Map<string, string>();
  async save(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async load(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

export interface SelectionState {
  slideId: string | null;
  elementIds: string[];
  slideIds: string[];
  editingTextId: string | null;
}

export interface DeckEngineOptions {
  persistence?: PersistenceAdapter;
  autosaveDelay?: number;
  maxHistory?: number;
}

export interface VersionInfo extends NamedVersion {
  snapshot: string;
}

export type EngineEventType =
  | 'deck'
  | 'selection'
  | 'viewport'
  | 'datasets'
  | 'audit'
  | 'presence';

export interface EngineEvent {
  type: EngineEventType;
}

/**
 * The deck engine: one place for document state, selection, viewport,
 * datasets, audit log and persistence. The React editor binds to this store;
 * AI edits flow through the same command executor as user edits (§7.2).
 */
export class DeckEngine {
  readonly executor: CommandExecutor;
  private selectionState: SelectionState = { slideId: null, elementIds: [], slideIds: [], editingTextId: null };
  private viewportState = { zoom: 1, panX: 0, panY: 0 };
  private datasets = new Map<string, DataSet>();
  private audit: AuditEntry[] = [];
  private listeners = new Set<(event: EngineEvent) => void>();
  private persistence: PersistenceAdapter | null;
  private autosaveDelay: number;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeExecutor: () => void;
  private saveKey: string;

  constructor(deck: Deck, opts: DeckEngineOptions = {}) {
    this.executor = new CommandExecutor(deck, { maxHistory: opts.maxHistory ?? 500 });
    this.persistence = opts.persistence ?? null;
    this.autosaveDelay = opts.autosaveDelay ?? 800;
    this.saveKey = `deck:${deck.id}`;
    this.unsubscribeExecutor = this.executor.subscribe((event) => {
      if (event.type === 'apply' || event.type === 'undo' || event.type === 'redo') {
        this.recordAudit(event.entry!.command, event.type);
        this.scheduleAutosave();
        this.emit({ type: 'deck' });
      }
    });
    if (deck.slides.length > 0) {
      this.selectionState.slideId = deck.slides[0]!.id;
    }
  }

  dispose(): void {
    this.unsubscribeExecutor();
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
  }

  // ------------------------------------------------------------------ state

  get deck(): Deck {
    return this.executor.deck;
  }

  get currentSlideId(): string | null {
    return this.selectionState.slideId;
  }

  get currentSlide() {
    const id = this.selectionState.slideId;
    return id ? this.deck.slides.find((s) => s.id === id) ?? null : null;
  }

  get selection(): SelectionState {
    return this.selectionState;
  }

  get selectedElements(): SlideElement[] {
    const slide = this.currentSlide;
    if (!slide) return [];
    return slide.elements.filter((e) => this.selectionState.elementIds.includes(e.id));
  }

  get viewport() {
    return this.viewportState;
  }

  get auditLog(): readonly AuditEntry[] {
    return this.audit;
  }

  get canUndo(): boolean {
    return this.executor.canUndo;
  }

  get canRedo(): boolean {
    return this.executor.canRedo;
  }

  theme(): Theme {
    return getTheme(this.deck.themeId);
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // never break the store on listener errors
      }
    }
  }

  private recordAudit(command: Command, type: 'apply' | 'undo' | 'redo'): void {
    let objectCount: number | undefined;
    if (command.kind === 'composite') {
      objectCount = (command as CompositeCommand).payload.children.length;
    }
    this.audit = [...this.audit, {
      at: Date.now(),
      kind: command.kind,
      label: type === 'undo' ? `撤销: ${command.label}` : type === 'redo' ? `重做: ${command.label}` : command.label,
      actor: command.actor,
      objectCount,
    }];
    if (this.audit.length > 500) this.audit = this.audit.slice(this.audit.length - 500);
    this.emit({ type: 'audit' });
  }

  // -------------------------------------------------------------- selection

  selectSlide(slideId: string | null): void {
    this.selectionState = { ...this.selectionState, slideId, elementIds: [], editingTextId: null };
    this.emit({ type: 'selection' });
  }

  selectElements(ids: string[], opts: { slideId?: string; add?: boolean } = {}): void {
    const slideId = opts.slideId ?? this.selectionState.slideId;
    const next = opts.add ? [...new Set([...this.selectionState.elementIds, ...ids])] : [...ids];
    this.selectionState = { ...this.selectionState, slideId, elementIds: next, editingTextId: null };
    this.emit({ type: 'selection' });
  }

  toggleElementSelection(id: string): void {
    const ids = this.selectionState.elementIds.includes(id)
      ? this.selectionState.elementIds.filter((x) => x !== id)
      : [...this.selectionState.elementIds, id];
    this.selectionState = { ...this.selectionState, elementIds: ids };
    this.emit({ type: 'selection' });
  }

  clearElementSelection(): void {
    if (this.selectionState.elementIds.length === 0) return;
    this.selectionState = { ...this.selectionState, elementIds: [], editingTextId: null };
    this.emit({ type: 'selection' });
  }

  selectAllOnSlide(): void {
    const slide = this.currentSlide;
    if (!slide) return;
    this.selectionState = {
      ...this.selectionState,
      elementIds: slide.elements.filter((e) => e.type !== 'group' && e.type !== 'diagram').map((e) => e.id),
      editingTextId: null,
    };
    this.emit({ type: 'selection' });
  }

  setEditingText(id: string | null): void {
    this.selectionState = { ...this.selectionState, editingTextId: id };
    this.emit({ type: 'selection' });
  }

  setSlideMultiSelection(ids: string[]): void {
    this.selectionState = { ...this.selectionState, slideIds: ids };
    this.emit({ type: 'selection' });
  }

  // --------------------------------------------------------------- viewport

  setViewport(vp: Partial<{ zoom: number; panX: number; panY: number }>): void {
    this.viewportState = { ...this.viewportState, ...vp };
    this.emit({ type: 'viewport' });
  }

  zoomBy(factor: number, centerX?: number, centerY?: number): void {
    const nextZoom = Math.min(4, Math.max(0.1, this.viewportState.zoom * factor));
    if (centerX !== undefined && centerY !== undefined) {
      const k = nextZoom / this.viewportState.zoom;
      this.viewportState = {
        zoom: nextZoom,
        panX: centerX - (centerX - this.viewportState.panX) * k,
        panY: centerY - (centerY - this.viewportState.panY) * k,
      };
    } else {
      this.viewportState = { ...this.viewportState, zoom: nextZoom };
    }
    this.emit({ type: 'viewport' });
  }

  panBy(dx: number, dy: number): void {
    this.viewportState = {
      ...this.viewportState,
      panX: this.viewportState.panX + dx,
      panY: this.viewportState.panY + dy,
    };
    this.emit({ type: 'viewport' });
  }

  resetViewport(): void {
    this.viewportState = { zoom: 1, panX: 0, panY: 0 };
    this.emit({ type: 'viewport' });
  }

  // ----------------------------------------------------------------- actions

  apply(command: Command): boolean {
    const result = this.executor.apply(command);
    return result.ok;
  }

  applyMany(commands: Command[], opts: { label?: string; actor?: Command['actor']; aiNote?: string } = {}): boolean {
    const result = this.executor.applyMany(commands, opts);
    return result.ok;
  }

  undo(): boolean {
    return this.executor.undo().ok;
  }

  redo(): boolean {
    return this.executor.redo().ok;
  }

  addElement(el: SlideElement, slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid) return false;
    return this.apply(createElementsCommand({ slideId: sid, elements: [el] }));
  }

  deleteSelected(): boolean {
    const sid = this.currentSlideId;
    if (!sid || this.selectionState.elementIds.length === 0) return false;
    return this.apply(deleteElementsCommand({ slideId: sid, elementIds: this.selectionState.elementIds }));
  }

  moveElements(moves: Array<{ id: string; x: number; y: number }>, slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid || moves.length === 0) return false;
    return this.apply(moveElementsCommand({ slideId: sid, moves }));
  }

  resizeElement(id: string, x: number, y: number, w: number, h: number, slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid) return false;
    return this.apply(resizeElementCommand({ slideId: sid, id, x, y, w, h }));
  }

  rotateElement(id: string, rotation: number, slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid) return false;
    return this.apply(rotateElementCommand({ slideId: sid, id, rotation }));
  }

  groupSelected(): boolean {
    const sid = this.currentSlideId;
    if (!sid || this.selectionState.elementIds.length < 2) return false;
    const ok = this.apply(groupCommand({ slideId: sid, elementIds: this.selectionState.elementIds }));
    if (ok) {
      // Select the new group container.
      const group = this.deck.slides
        .find((s) => s.id === sid)!
        .elements.find((e) => e.type === 'group' && e.childIds.length === this.selectionState.elementIds.length && e.childIds.every((c) => this.selectionState.elementIds.includes(c)));
      if (group) this.selectElements([group.id]);
    }
    return ok;
  }

  ungroupSelected(): boolean {
    const sid = this.currentSlideId;
    if (!sid) return false;
    const groups = this.selectedElements.filter((e) => e.type === 'group');
    if (groups.length === 0) return false;
    const group = groups[0]!;
    const childIds = group.type === 'group' ? group.childIds : [];
    const ok = this.apply(ungroupCommand({ slideId: sid, groupId: group.id }));
    if (ok) this.selectElements(childIds);
    return ok;
  }

  changeZOrder(ids: string[], op: ZOrderOp, slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid || ids.length === 0) return false;
    return this.apply(zOrderCommand({ slideId: sid, elementIds: ids, op }));
  }

  alignSelected(mode: AlignMode, target: 'selection' | 'canvas' = 'selection'): boolean {
    const sid = this.currentSlideId;
    if (!sid || this.selectionState.elementIds.length < 2) return false;
    return this.apply(alignCommand({ slideId: sid, elementIds: this.selectionState.elementIds, mode, target }));
  }

  setLocked(ids: string[], locked: boolean): boolean {
    const sid = this.currentSlideId;
    if (!sid) return false;
    const cmds = ids.map((id) => updateElementPropsCommand({ slideId: sid, id, patch: { locked } }));
    return this.applyMany(cmds, { label: locked ? '锁定' : '解锁', actor: 'user' });
  }

  setHidden(ids: string[], hidden: boolean): boolean {
    const sid = this.currentSlideId;
    if (!sid) return false;
    const cmds = ids.map((id) => updateElementPropsCommand({ slideId: sid, id, patch: { hidden } }));
    return this.applyMany(cmds, { label: hidden ? '隐藏' : '显示', actor: 'user' });
  }

  setOpacity(id: string, opacity: number): boolean {
    const sid = this.currentSlideId;
    if (!sid) return false;
    return this.apply(updateElementPropsCommand({ slideId: sid, id, patch: { opacity } }));
  }

  updateText(id: string, text: RichText, slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid) return false;
    return this.apply(updateTextCommand({ slideId: sid, id, text }));
  }

  insertSlide(index: number, slide?: Partial<Parameters<typeof createSlide>[0]>): string | null {
    const s = createSlide(slide);
    if (!this.apply(insertSlideCommand({ index, slide: s }))) return null;
    this.selectSlide(s.id);
    return s.id;
  }

  duplicateSlide(slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid) return false;
    return this.apply(duplicateSlideCommand({ slideId: sid }));
  }

  deleteSlide(slideId?: string): boolean {
    const sid = slideId ?? this.currentSlideId;
    if (!sid || this.deck.slides.length <= 1) return false;
    const index = this.deck.slides.findIndex((s) => s.id === sid);
    if (!this.apply(deleteSlideCommand({ slideId: sid }))) return false;
    const next = this.deck.slides[Math.min(index, this.deck.slides.length - 1)];
    if (next) this.selectSlide(next.id);
    return true;
  }

  moveSlideTo(slideId: string, toIndex: number): boolean {
    return this.apply(moveSlideCommand({ slideId, toIndex }));
  }

  updateSlideNotes(slideId: string, notes: string): boolean {
    return this.apply(updateSlidePropsCommand({ slideId, patch: { notes } }));
  }

  updateSlideSection(slideId: string, section: string): boolean {
    return this.apply(updateSlidePropsCommand({ slideId, patch: { section } }));
  }

  updateStyle(id: string, patch: Parameters<typeof updateStyleCommand>[0]['patch']): boolean {
    const sid = this.currentSlideId;
    if (!sid) return false;
    return this.apply(updateStyleCommand({ slideId: sid, id, patch }));
  }

  // ----------------------------------------------------------------- datasets

  setDataset(dataset: DataSet): void {
    this.datasets.set(dataset.id, dataset);
    this.emit({ type: 'datasets' });
  }

  getDataset(id: string): DataSet | undefined {
    return this.datasets.get(id);
  }

  listDatasets(): DataSet[] {
    return [...this.datasets.values()];
  }

  removeDataset(id: string): void {
    this.datasets.delete(id);
    this.emit({ type: 'datasets' });
  }

  /** §12 "Update deck": refresh every chart bound to this dataset. */
  refreshChartsFromDataset(datasetId: string): number {
    const ds = this.datasets.get(datasetId);
    if (!ds) return 0;
    const commands: Command[] = [];
    for (const slide of this.deck.slides) {
      for (const el of slide.elements) {
        if (el.type === 'chart' && el.dataSource === datasetId) {
          const bound = chartFromDataset(ds, el.chartType);
          commands.push(
            updateChartDataCommand({
              slideId: slide.id,
              id: el.id,
              categories: bound.categories,
              series: bound.series,
            }),
          );
        }
      }
    }
    if (commands.length > 0) {
      this.applyMany(commands, { label: 'Update deck', actor: 'system' });
    }
    return commands.length;
  }

  // ------------------------------------------------------------ persistence

  private scheduleAutosave(): void {
    if (!this.persistence) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      void this.saveNow();
    }, this.autosaveDelay);
  }

  async saveNow(): Promise<void> {
    if (!this.persistence) return;
    const updated = { ...this.deck, meta: { ...this.deck.meta, updatedAt: new Date().toISOString() } };
    await this.persistence.save(this.saveKey, JSON.stringify(updated));
    await this.persistence.save('lastDeckId', this.saveKey);
  }

  static async restore(adapter: PersistenceAdapter, opts: { fallbackDeck?: Deck } = {}): Promise<Deck> {
    const lastId = await adapter.load('lastDeckId');
    // lastDeckId already stores the full storage key (deck:<id>).
    const raw = lastId ? await adapter.load(lastId) : null;
    if (raw) {
      try {
        const deck = JSON.parse(raw) as Deck;
        const result = validateDeck(deck);
        if (result.ok) return deck;
        console.warn('[slide-engine] stored deck failed validation, using fallback', result.issues.slice(0, 3));
      } catch {
        // corrupted → fallback
      }
    }
    return opts.fallbackDeck ?? createDeck();
  }

  async saveNamedVersion(name: string): Promise<void> {
    if (!this.persistence) return;
    const version: VersionInfo = {
      id: uid('v'),
      name,
      at: new Date().toISOString(),
      snapshot: JSON.stringify(this.deck),
    };
    await this.persistence.save(`version:${this.deck.id}:${version.id}`, JSON.stringify(version));
  }

  async listVersions(): Promise<NamedVersion[]> {
    if (!this.persistence) return [];
    const keys = await this.persistence.keys();
    const prefix = `version:${this.deck.id}:`;
    const out: NamedVersion[] = [];
    for (const key of keys.filter((k) => k.startsWith(prefix))) {
      const raw = await this.persistence.load(key);
      if (!raw) continue;
      try {
        const v = JSON.parse(raw) as VersionInfo;
        out.push({ id: v.id, name: v.name, at: v.at });
      } catch {
        // skip corrupted
      }
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  async restoreNamedVersion(versionId: string): Promise<boolean> {
    if (!this.persistence) return false;
    const raw = await this.persistence.load(`version:${this.deck.id}:${versionId}`);
    if (!raw) return false;
    try {
      const v = JSON.parse(raw) as VersionInfo;
      const deck = JSON.parse(v.snapshot) as Deck;
      this.executor.setDeck(deck);
      this.emit({ type: 'deck' });
      this.scheduleAutosave();
      return true;
    } catch {
      return false;
    }
  }
}

/** Derive chart data from a dataset: first text column = categories, numeric columns = series. */
export function chartFromDataset(ds: DataSet, chartType: string): { categories: string[]; series: Array<{ name: string; data: Array<number | null> }> } {
  const numericIdx = ds.columns.map((c, i) => i).filter((i) => ds.rows.some((r) => typeof r[i] === 'number'));
  const labelIdx = ds.columns.map((c, i) => i).find((i) => ds.rows.every((r) => typeof r[i] === 'string' || r[i] === null));
  const categories = ds.rows.map((r) => String(r[labelIdx ?? 0] ?? ''));
  const series = (numericIdx.length > 0 ? numericIdx : [labelIdx ?? 0]).map((i) => ({
    name: ds.columns[i] ?? '系列',
    data: ds.rows.map((r) => (typeof r[i] === 'number' ? (r[i] as number) : null)),
  }));
  void chartType;
  return { categories, series };
}

export { removeSlide };
export type { Command };
export { deepClone, normalizeZIndexes, createSlide, createDeck, uid };
