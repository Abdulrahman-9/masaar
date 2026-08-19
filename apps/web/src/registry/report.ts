/**
 * Registry layer (batch 1) — one column contract drives the on-screen table,
 * the CSV export and (later) the A4 report, so "what the user sees is what is
 * exported". Extracted from Users.tsx exportCsv (the completed local model).
 */

export interface ReportColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number;
  /** rendering hint for the table / A4 report — buildCsv emits the raw value(). */
  format?: 'money' | 'date' | 'count' | 'text';
  /** column is summed in the A4 report footer — metadata, not used by CSV. */
  total?: boolean;
}

/**
 * Pure CSV string builder — every cell (header included) is wrapped in quotes and
 * embedded quotes are doubled, exactly like Users.tsx exportCsv (lines 63-73).
 * Header cells are the column labels; body cells are the raw `value(row)` output.
 * Kept side-effect free so it can be unit-tested without a DOM.
 */
export function buildCsv<T>(columns: ReportColumn<T>[], rows: T[]): string {
  const head = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => String(c.value(row))));
  return [head, ...body]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/**
 * Download the columns/rows as a UTF-8 CSV (BOM-prefixed so Excel reads Arabic).
 * A local file export only — it never reaches the server audit log; the caller
 * raises the toast. `filename` gains a `.csv` suffix when it lacks one.
 */
export function exportCsv<T>(filename: string, columns: ReportColumn<T>[], rows: T[]): void {
  const csv = buildCsv(columns, rows);
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
