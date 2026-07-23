export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportResult {
  title: string;
  generatedAt: string;
  summary: Array<{ label: string; value: string }>;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number>>;
}
