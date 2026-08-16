import type { ChartSeries } from '@jkinco/scene-schema';

export interface ContentBlocks {
  title?: string;
  subtitle?: string;
  /** Long-form body text (§5.1 budget targets `bodyTarget` / `bodyHard`). */
  body?: string;
  keyMessage?: string;
  bullets?: string[];
  metrics?: Array<{ value: string; label: string }>;
  chart?: { categories: string[]; series: ChartSeries[] };
  table?: string[][];
  diagram?: { nodes: string[]; edges: Array<[number, number]>; levels?: number[] };
  image?: { src: string; alt?: string };
  footer?: string;
  sectionLabel?: string;
  pageNumber?: number;
  totalPages?: number;
}
