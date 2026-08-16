export type QaCategory = 'geometry' | 'typography' | 'content' | 'visual' | 'deck';

export interface QaIssue {
  id: string;
  category: QaCategory;
  severity: 'error' | 'warning' | 'info';
  message: string;
  slideId?: string;
  elementIds?: string[];
  fix?: 'auto' | 'manual';
}

export interface QaReport {
  ready: boolean;
  issues: QaIssue[];
  perSlide: Record<string, QaIssue[]>;
  stats: { errors: number; warnings: number; infos: number };
}
