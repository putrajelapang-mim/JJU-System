import type { ReportResult } from './types';

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(result: ReportResult): string {
  const header = result.columns.map((c) => escapeCsvField(c.label)).join(',');
  const rows = result.rows.map((row) => result.columns.map((c) => escapeCsvField(row[c.key] ?? '')).join(','));
  return [header, ...rows].join('\r\n');
}
