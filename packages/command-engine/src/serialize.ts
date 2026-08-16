import type { Command, SerializedCommand } from './types';
import {
  alignCommand,
  createElementsCommand,
  deleteElementsCommand,
  distributeCommand,
  groupCommand,
  moveElementsCommand,
  resizeElementCommand,
  restoreSnapshotCommand,
  rotateElementCommand,
  ungroupCommand,
  updateElementPropsCommand,
  updateStyleCommand,
  updateTextCommand,
  zOrderCommand,
} from './element-commands';
import {
  compositeCommand,
  deleteSlideCommand,
  duplicateSlideCommand,
  insertSlideCommand,
  mergeSlidesCommand,
  moveSlideCommand,
  restoreElementsCommand,
  splitSlideCommand,
} from './slide-commands';
import {
  applyLayoutCommand,
  applyThemeCommand,
  bindDataCommand,
  replaceAssetCommand,
  updateChartDataCommand,
  updateSlidePropsCommand,
} from './deck-commands';
import type { SlideElement } from '@jkinco/scene-schema';
import type { Deck } from '@jkinco/scene-schema';

export function serializeCommand(command: Command): SerializedCommand {
  return command.serialize();
}

/**
 * Reconstruct a command from its serialized form (collaboration, replay,
 * audit log). Returns null for unknown kinds so callers can decide.
 */
export function deserializeCommand(json: string | object): Command {
  const raw: SerializedCommand = typeof json === 'string' ? (JSON.parse(json) as SerializedCommand) : (json as SerializedCommand);
  const p = raw.payload as Record<string, unknown>;
  const opts = { id: raw.id, label: raw.label, actor: raw.actor, aiNote: raw.aiNote };
  switch (raw.kind) {
    case 'createElements':
      return createElementsCommand(
        { slideId: String(p.slideId), elements: p.elements as SlideElement[], index: p.index as number | undefined },
        opts,
      );
    case 'deleteElements':
      return deleteElementsCommand({ slideId: String(p.slideId), elementIds: p.elementIds as string[] }, opts);
    case 'moveElements':
      return moveElementsCommand(
        { slideId: String(p.slideId), moves: p.moves as Array<{ id: string; x: number; y: number }> },
        opts,
      );
    case 'resizeElement':
      return resizeElementCommand(p as never, opts);
    case 'rotateElement':
      return rotateElementCommand(p as never, opts);
    case 'updateText':
      return updateTextCommand(p as never, opts);
    case 'updateStyle':
      return updateStyleCommand(p as never, opts);
    case 'updateElementProps':
      return updateElementPropsCommand(p as never, opts);
    case 'group':
      return groupCommand({ slideId: String(p.slideId), elementIds: p.elementIds as string[], groupId: p.groupId as string | undefined }, opts);
    case 'ungroup':
      return ungroupCommand({ slideId: String(p.slideId), groupId: String(p.groupId) }, opts);
    case 'align':
      return alignCommand(p as never, opts);
    case 'distribute':
      return distributeCommand(p as never, opts);
    case 'changeZOrder':
      return zOrderCommand(p as never, opts);
    case 'applyLayout':
      return applyLayoutCommand(p as never, opts);
    case 'applyTheme':
      return applyThemeCommand(p as never, opts);
    case 'insertSlide':
      return insertSlideCommand(p as never, opts);
    case 'deleteSlide':
      return deleteSlideCommand({ slideId: String(p.slideId) }, opts);
    case 'moveSlide':
      return moveSlideCommand({ slideId: String(p.slideId), toIndex: Number(p.toIndex) }, opts);
    case 'duplicateSlide':
      return duplicateSlideCommand({ slideId: String(p.slideId), newIndex: p.newIndex as number | undefined }, opts);
    case 'splitSlide':
      return splitSlideCommand(p as never, opts);
    case 'mergeSlides':
      return mergeSlidesCommand({ sourceSlideId: String(p.sourceSlideId), targetSlideId: String(p.targetSlideId) }, opts);
    case 'replaceAsset':
      return replaceAssetCommand(p as never, opts);
    case 'bindData':
      return bindDataCommand(p as never, opts);
    case 'updateChartData':
      return updateChartDataCommand(p as never, opts);
    case 'updateSlideProps':
      return updateSlidePropsCommand(p as never, opts);
    case 'restoreElements':
      return restoreElementsCommand(p as never, opts);
    case 'restoreSnapshot':
      return restoreSnapshotCommand(p.deck as Deck, raw.label, raw.id);
    case 'composite':
      return compositeCommand(
        (p as unknown as Array<Record<string, unknown>>).map((c) => deserializeCommand(c)),
        opts,
      );
    default:
      throw new Error(`未知命令类型: ${String(raw.kind)}`);
  }
}

/** Deterministic-format helper for audit logs. */
export function commandAuditEntry(command: Command): { kind: string; label: string; actor: string; at: number } {
  return { kind: command.kind, label: command.label, actor: command.actor, at: Date.now() };
}
