/**
 * Small local helper types shared across the chart-engine modules.
 */

/** A single data series: a name plus numeric (or null) values. */
export interface SeriesData {
  name: string;
  data: Array<number | null>;
}

/** Extracted tabular chart data: categories plus one or more series. */
export interface ChartTable {
  categories: string[];
  series: SeriesData[];
}
