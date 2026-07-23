import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { ReportResult } from '../reports/types';

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const MARGIN = 40;

export async function generateReportPdf(result: ReportResult): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = page.getHeight() - MARGIN;
  const pageWidth = page.getWidth();

  page.drawText(result.title, { x: MARGIN, y, size: 14, font: bold });
  y -= 16;
  page.drawText(`Dijana: ${result.generatedAt.slice(0, 19).replace('T', ' ')}`, {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 20;

  for (const item of result.summary) {
    page.drawText(`${item.label}: `, { x: MARGIN, y, size: 10, font: bold });
    const labelWidth = bold.widthOfTextAtSize(`${item.label}: `, 10);
    page.drawText(item.value, { x: MARGIN + labelWidth, y, size: 10, font });
    y -= 14;
  }
  y -= 12;

  const colCount = result.columns.length;
  const colWidth = (pageWidth - MARGIN * 2) / colCount;

  const drawHeader = (p: PDFPage, atY: number) => {
    p.drawRectangle({ x: MARGIN, y: atY - 4, width: pageWidth - MARGIN * 2, height: 18, color: rgb(0.94, 0.94, 0.94) });
    result.columns.forEach((col, i) => {
      p.drawText(col.label, { x: MARGIN + i * colWidth + 4, y: atY, size: 8, font: bold });
    });
  };

  drawHeader(page, y);
  y -= 20;

  for (const row of result.rows) {
    if (y < 60) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = page.getHeight() - MARGIN;
      drawHeader(page, y);
      y -= 20;
    }
    result.columns.forEach((col, i) => {
      const value = truncate(String(row[col.key] ?? ''), 30);
      page.drawText(value, { x: MARGIN + i * colWidth + 4, y, size: 9, font });
    });
    y -= 16;
  }

  if (result.rows.length === 0) {
    page.drawText('Tiada data untuk tempoh/kriteria ini.', { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  }

  return pdfDoc.save();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
