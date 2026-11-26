import 'server-only';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Cell, Period, ReportDef, ReportResult } from '@/lib/reports';

const periodLabel = (def: ReportDef, p: Period) => (def.period ? `${p.from} to ${p.to}` : 'As at ' + new Date().toISOString().slice(0, 10));
const csvCell = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s; // block spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const rs = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function toCsv(def: ReportDef, res: ReportResult) {
  const lines = [res.columns.map((c) => csvCell(c.label)).join(',')];
  res.rows.forEach((r) => lines.push(r.map(csvCell).join(',')));
  return lines.join('\r\n');
}

export function toXlsx(org: string, def: ReportDef, p: Period, res: ReportResult) {
  const aoa: Cell[][] = [[org], [def.title], [`Period: ${periodLabel(def, p)}`], [`Generated: ${new Date().toLocaleString('en-IN')}`], [], ...res.summary.map(([k, v]) => [k, v] as Cell[]), [], res.columns.map((c) => c.label), ...res.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = res.columns.map((c, i) => ({ wch: Math.min(40, Math.max(c.label.length + 2, ...res.rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.key.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function toPdf(org: string, def: ReportDef, p: Period, res: ReportResult, preparedBy: string) {
  const doc = new jsPDF({ orientation: res.columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.text(org, w / 2, 40, { align: 'center' });
  doc.setFontSize(12); doc.text(def.title, w / 2, 60, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${periodLabel(def, p)}    Generated: ${new Date().toLocaleString('en-IN')}    Prepared by: ${preparedBy}`, w / 2, 76, { align: 'center' });
  let y = 96;
  doc.setFontSize(9);
  res.summary.forEach(([k, v]) => { doc.text(`${k}: ${typeof v === 'number' && /total|value|cost|amount|outstanding|expenditure|valuation|gst/i.test(k) ? rs(v) : v}`, 40, y); y += 13; });
  autoTable(doc, {
    startY: y + 6,
    head: [res.columns.map((c) => c.label)],
    body: res.rows.map((r) => r.map((v, i) => (res.columns[i].money && typeof v === 'number' ? rs(v) : v === null ? '' : String(v)))),
    styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [30, 70, 100] },
    columnStyles: Object.fromEntries(res.columns.map((c, i) => [i, c.money ? { halign: 'right' as const } : {}])),
  });
  const endY = ((doc as any).lastAutoTable?.finalY ?? y) + 50;
  const h = doc.internal.pageSize.getHeight();
  let sy = endY;
  if (sy > h - 70) { doc.addPage(); sy = 90; }
  doc.setFontSize(9);
  ['Prepared by', 'Verified by', 'Authorised signatory'].forEach((label, i) => {
    const x = 40 + i * ((w - 80) / 3);
    doc.line(x, sy, x + (w - 80) / 3 - 20, sy);
    doc.text(label, x, sy + 12);
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`Page ${i} of ${pages}`, w - 40, h - 20, { align: 'right' }); }
  return Buffer.from(doc.output('arraybuffer'));
}
