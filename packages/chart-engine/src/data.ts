import type { DataSet } from '@jkinco/scene-schema';
import type { ChartTable, SeriesData } from './types';

type Cell = string | number | null | undefined;

/** Convert a dataset cell to a finite number or null. */
function toNumber(value: Cell): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Convert a dataset cell to its string form. */
function toCellString(value: Cell): string {
  return value === null || value === undefined ? '' : String(value);
}

type ColumnKind = 'string' | 'numeric' | 'mixed' | 'empty';

function columnKind(rows: DataSet['rows'], column: number): ColumnKind {
  let hasString = false;
  let hasNumber = false;
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') hasString = true;
    else if (typeof value === 'number') hasNumber = true;
  }
  if (hasString && !hasNumber) return 'string';
  if (hasNumber && !hasString) return 'numeric';
  if (hasString && hasNumber) return 'mixed';
  return 'empty';
}

function resolveColumnIndex(columns: string[], selection: number | string): number {
  if (typeof selection === 'number') return selection;
  const index = columns.indexOf(selection);
  return index >= 0 ? index : -1;
}

/** Transposed ("long") data: first row is the header, first column names the series. */
function transpose(dataset: DataSet): ChartTable {
  const rows = dataset.rows;
  const firstRow = rows[0] ?? [];
  const categories = firstRow.slice(1).map(toCellString);
  const series: SeriesData[] = rows.slice(1).map((row) => ({
    name: toCellString(row[0]),
    data: row.slice(1).map(toNumber),
  }));
  return { categories, series };
}

export function chartFromDataset(
  dataset: DataSet,
  opts: { categoryColumn?: number | string; seriesColumns?: Array<number | string>; transpose?: boolean } = {},
): ChartTable {
  if (opts.transpose) return transpose(dataset);

  const { columns, rows } = dataset;

  // Determine the category column: explicit selection, else the first all-string column.
  let categoryColumn: number;
  if (opts.categoryColumn !== undefined) {
    categoryColumn = resolveColumnIndex(columns, opts.categoryColumn);
    if (categoryColumn < 0) categoryColumn = 0;
  } else {
    const found = columns.findIndex((_, c) => columnKind(rows, c) === 'string');
    categoryColumn = found >= 0 ? found : 0;
  }

  // Determine the series columns: explicit selection, else all numeric columns.
  let seriesColumns: number[];
  if (opts.seriesColumns !== undefined && opts.seriesColumns.length > 0) {
    seriesColumns = opts.seriesColumns
      .map((sel) => resolveColumnIndex(columns, sel))
      .filter((c) => c >= 0);
  } else {
    seriesColumns = columns.map((_, c) => c).filter((c) => columnKind(rows, c) === 'numeric');
  }

  const categories = rows.map((row) => toCellString(row[categoryColumn]));
  const series: SeriesData[] = seriesColumns.map((c) => ({
    name: columns[c] ?? `列${c + 1}`,
    data: rows.map((row) => toNumber(row[c])),
  }));

  return { categories, series };
}
