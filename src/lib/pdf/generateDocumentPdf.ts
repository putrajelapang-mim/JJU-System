import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Env } from '../../types';

export interface DocLineItem {
  name: string;
  qty: number;
  price: number;
}

export interface GenerateDocumentInput {
  docType: 'quotation' | 'invoice' | 'resit';
  docNumber: string;
  company: { name: string; address: string | null; phone: string | null; logoKey: string | null };
  customer: { name: string; phone: string | null };
  car: { plate_no: string; model: string | null };
  items: DocLineItem[];
  subtotal: number;
  discountAmount: number;
  sstEnabled: boolean;
  sstRate: number;
  sstAmount: number;
  total: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  createdAt: string;
  validUntil?: string;
}

const DOC_TITLES: Record<GenerateDocumentInput['docType'], string> = {
  quotation: 'SEBUT HARGA / QUOTATION',
  invoice: 'INVOIS / INVOICE',
  resit: 'RESIT / RECEIPT',
};

function money(n: number): string {
  return `RM ${n.toFixed(2)}`;
}

async function embedLogo(pdfDoc: PDFDocument, env: Env, logoKey: string | null) {
  if (!logoKey) return null;
  const object = await env.IMAGES.get(logoKey);
  if (!object) return null;
  const bytes = await object.arrayBuffer();
  const ext = logoKey.split('.').pop();
  try {
    if (ext === 'png') return await pdfDoc.embedPng(bytes);
    if (ext === 'jpg' || ext === 'jpeg') return await pdfDoc.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

export async function generateDocumentPdf(env: Env, input: GenerateDocumentInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const pageWidth = page.getWidth();
  let y = page.getHeight() - margin;

  const logo = await embedLogo(pdfDoc, env, input.company.logoKey);
  if (logo) {
    const logoDims = logo.scaleToFit(70, 70);
    page.drawImage(logo, { x: margin, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
  }

  const headerTextX = logo ? margin + 80 : margin;
  page.drawText(input.company.name, { x: headerTextX, y, size: 14, font: bold });
  y -= 16;
  if (input.company.address) {
    page.drawText(input.company.address, { x: headerTextX, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;
  }
  if (input.company.phone) {
    page.drawText(`Tel: ${input.company.phone}`, { x: headerTextX, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;
  }

  y = Math.min(y, page.getHeight() - margin - 80);
  y -= 10;

  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 24;

  const title = DOC_TITLES[input.docType];
  page.drawText(title, { x: margin, y, size: 13, font: bold });
  page.drawText(input.docNumber, { x: pageWidth - margin - bold.widthOfTextAtSize(input.docNumber, 11), y, size: 11, font: bold });
  y -= 16;
  const dateLabel = `Tarikh: ${input.createdAt.slice(0, 10)}`;
  page.drawText(dateLabel, { x: pageWidth - margin - font.widthOfTextAtSize(dateLabel, 9), y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  if (input.docType === 'quotation' && input.validUntil) {
    y -= 12;
    const validLabel = `Sah sehingga: ${input.validUntil}`;
    page.drawText(validLabel, { x: pageWidth - margin - font.widthOfTextAtSize(validLabel, 9), y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  }
  y -= 24;

  page.drawText('Pelanggan / Customer', { x: margin, y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 14;
  page.drawText(input.customer.name, { x: margin, y, size: 11, font });
  if (input.customer.phone) {
    y -= 14;
    page.drawText(input.customer.phone, { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  }
  y -= 14;
  const carLine = `${input.car.plate_no}${input.car.model ? ` — ${input.car.model}` : ''}`;
  page.drawText(carLine, { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 28;

  // Table header
  const colItem = margin;
  const colQty = pageWidth - margin - 200;
  const colPrice = pageWidth - margin - 130;
  const colAmount = pageWidth - margin - 60;

  page.drawRectangle({ x: margin, y: y - 4, width: pageWidth - margin * 2, height: 20, color: rgb(0.94, 0.94, 0.94) });
  page.drawText('Perkara', { x: colItem + 4, y, size: 9, font: bold });
  page.drawText('Kuantiti', { x: colQty, y, size: 9, font: bold });
  page.drawText('Harga', { x: colPrice, y, size: 9, font: bold });
  page.drawText('Jumlah', { x: colAmount, y, size: 9, font: bold });
  y -= 24;

  let currentPage = page;
  for (const item of input.items) {
    if (y < 140) {
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      y = currentPage.getHeight() - 60;
    }
    drawTableRow(currentPage, font, item, colItem, colQty, colPrice, colAmount, y);
    y -= 18;
  }

  if (y < 160) {
    currentPage = pdfDoc.addPage([595.28, 841.89]);
    y = currentPage.getHeight() - 60;
  }

  y -= 10;
  currentPage.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  drawTotalLine(currentPage, font, 'Subtotal', input.subtotal, colAmount, y);
  y -= 16;
  if (input.discountAmount > 0) {
    drawTotalLine(currentPage, font, 'Diskaun', -input.discountAmount, colAmount, y);
    y -= 16;
  }
  if (input.sstEnabled) {
    drawTotalLine(currentPage, font, `SST (${input.sstRate}%)`, input.sstAmount, colAmount, y);
    y -= 16;
  }
  currentPage.drawLine({ start: { x: colPrice - 20, y: y + 6 }, end: { x: pageWidth - margin, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  drawTotalLine(currentPage, bold, 'JUMLAH', input.total, colAmount, y, 11);
  y -= 30;

  if (input.docType === 'invoice') {
    drawStatusBadge(currentPage, bold, 'BELUM BAYAR', margin, y, rgb(0.8, 0.2, 0.2));
  } else if (input.docType === 'resit') {
    drawStatusBadge(currentPage, bold, 'DAH BAYAR', margin, y, rgb(0.13, 0.55, 0.13));
    if (input.paymentMethod) {
      y -= 16;
      currentPage.drawText(`Kaedah bayaran: ${input.paymentMethod.toUpperCase()}`, { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  return pdfDoc.save();
}

function drawTableRow(
  page: PDFPage,
  font: PDFFont,
  item: DocLineItem,
  colItem: number,
  colQty: number,
  colPrice: number,
  colAmount: number,
  y: number
) {
  page.drawText(truncate(item.name, 42), { x: colItem + 4, y, size: 10, font });
  page.drawText(String(item.qty), { x: colQty, y, size: 10, font });
  page.drawText(money(item.price), { x: colPrice, y, size: 10, font });
  page.drawText(money(item.price * item.qty), { x: colAmount, y, size: 10, font });
}

function drawTotalLine(page: PDFPage, font: PDFFont, label: string, value: number, colAmount: number, y: number, size = 10) {
  const text = money(value);
  page.drawText(label, { x: colAmount - 100, y, size, font });
  page.drawText(text, { x: colAmount, y, size, font });
}

function drawStatusBadge(page: PDFPage, font: PDFFont, label: string, x: number, y: number, color: ReturnType<typeof rgb>) {
  const width = font.widthOfTextAtSize(label, 10) + 16;
  page.drawRectangle({ x, y: y - 4, width, height: 18, color, opacity: 0.15 });
  page.drawText(label, { x: x + 8, y, size: 10, font, color });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
