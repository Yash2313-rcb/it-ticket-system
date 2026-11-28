import { toYmd } from './dates';
import type { ImportAdapter, SheetData } from './adapter';

/**
 * Reads the company's existing "IT All Assets" register (Sr no, Asset ID, Name of Item, Item Description,
 * Item Serial Number, Location, User, Received Date, Bill Date, Bill No., Qty, Value / Base Value /
 * Transportation / GST / Total, Working / Non-Working, FAR, Remarks, In Account books,
 * Tangible / In-Tangible, Software licence key, sale) and turns each row into the standard asset columns.
 */

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const OTHER = 'Other IT Equipment';
const PLACEHOLDER = /^(?:[-.]+|n[\\\/]?a|nil|none|null|not available)$/i; // "-", "N/A", "N\A", "nil" ...

/** Standard columns the rest of the importer understands (must match the asset import field labels). */
const OUT = ['Asset ID', 'Asset name', 'Category', 'Serial number', 'Invoice number', 'Purchase date', 'Purchase price (INR)', 'Location', 'Condition', 'Status', 'Specifications', 'Remarks'] as const;

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return toYmd(v) ?? '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return PLACEHOLDER.test(s) ? '' : s;
}

function amount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = text(v).replace(/[₹,\s]|rs\.?|inr/gi, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** A real date, or null with the original text so it can be kept in the remarks instead of rejecting the row. */
function dateCell(v: unknown): { ymd: string | null; raw: string } {
  const raw = text(v);
  if (!raw) return { ymd: null, raw: '' };
  if (typeof v === 'number') return { ymd: null, raw }; // a bare number such as 47 is not a usable date
  const ymd = toYmd(v);
  const year = ymd ? Number(ymd.slice(0, 4)) : 0;
  return ymd && year >= 1980 && year <= 2100 ? { ymd, raw } : { ymd: null, raw };
}

/** Category names to try, best first. The importer uses the first one that exists in the app. */
function categoryFor(item: string, desc: string): string {
  const n = item.toLowerCase();
  const d = desc.toLowerCase();
  const pick = (...names: string[]) => [...new Set([...names, OTHER])].join('||');

  // "Computer" / "Server" / "Laptop" rows are the parts of one set; the description says which part.
  if (/^(computer|server|laptop|desktop)\b/.test(n)) {
    if (/^mouse\b/.test(d)) return pick('Mouse');
    if (/^(keyboard|keboard)\b/.test(d)) return pick('Keyboards');
    if (/^(lcd|monitor|display)\b/.test(d)) return pick('Monitors');
    if (/^printer\b/.test(d)) return pick('Printers');
    if (/^ups\b/.test(d)) return pick('UPS');
    if (/^nas\b/.test(d)) return pick('Storage Devices');
    if (/^(usb|hub)\b/.test(d)) return pick();
  }

  const rules: [RegExp, string[]][] = [
    [/web ?cam/, []],
    [/firewall|fortigate/, ['Firewalls']],
    [/cctv|\bcamera\b/, ['CCTV Cameras']],
    [/\bnvr\b|\bdvr\b/, ['DVR / NVR']],
    [/hdd|ssd|hard ?disk|pen ?drive|storage|card reader|\bnas\b/, ['Storage Devices']],
    [/router/, ['Routers']],
    [/swich|switch|\bpoe\b/, ['Network Switches']],
    [/wi-?fi|\bwif\b/, ['Wi-Fi Access Points']],
    [/bett?ery|battery|charger|adapter|\bdvd\b|rack|cable|tester|crimping|meeter|blow|\bcell\b/, []],
    [/\bups\b/, ['UPS']],
    [/projector/, ['Projectors']],
    [/barcode|scanner gun/, ['Barcode Scanners', 'Scanners']],
    [/scanner/, ['Scanners']],
    [/printer|cartridge|\bink\b|toner/, ['Printers']],
    [/laptop/, ['Laptops']],
    [/mobile|tablet|ipad/, ['Tablets / Mobile Devices']],
    [/monitor|display|\blcd\b/, ['Monitors']],
    [/server/, ['Servers']],
    [/keyboard|keboard/, ['Keyboards']],
    [/mouse/, ['Mouse']],
    [/computer|\bcpu\b|cabinet|mother ?board|processor/, ['Desktop Computers']],
  ];
  for (const [re, cats] of rules) if (re.test(n)) return pick(...cats);
  return pick();
}

/** Asset name shown in the app: the item plus its description when the description adds something. */
function assetName(item: string, desc: string): string {
  const a = item.toLowerCase();
  const b = desc.toLowerCase();
  let name = item;
  if (!item) name = desc;
  else if (desc && !a.includes(b)) name = b.includes(a) ? desc : `${item} - ${desc}`;
  return name.replace(/[\s-]+$/, '').slice(0, 200); // "CPU -" -> "CPU"
}

export const legacyAssetsAdapter: ImportAdapter = {
  detect(headers) {
    const h = new Set(headers.map(norm));
    if (!h.has('nameofitem')) return false;
    return ['assetid', 'itemdescription', 'itemserialnumber', 'location', 'workingnonworking'].filter((k) => h.has(k)).length >= 2;
  },

  convert(sheet: SheetData) {
    const rows = [...sheet.rows];
    const rowNos = sheet.rowNos ? [...sheet.rowNos] : undefined;
    const headers = [...sheet.headers];

    // The register has a second header row under "Value" (Base Value / Transportation / GST / Total).
    const subKeys = new Set(['basevalue', 'transportation', 'gst', 'total']);
    const first = rows[0] ?? [];
    if (first.some((c) => subKeys.has(norm(c))) && !first.some((c) => norm(c) === 'nameofitem')) {
      first.forEach((c, i) => {
        const main = norm(headers[i]);
        if (norm(c) && (!main || main === 'value')) headers[i] = String(c).trim();
      });
      rows.shift();
      rowNos?.shift();
    }

    const find = (pred: (k: string) => boolean) => headers.findIndex((h) => pred(norm(h)));
    const col = {
      code: find((k) => k === 'assetid'),
      item: find((k) => k === 'nameofitem'),
      desc: find((k) => k === 'itemdescription'),
      serial: find((k) => k === 'itemserialnumber'),
      loc: find((k) => k === 'location'),
      user: find((k) => k === 'user'),
      recv: find((k) => k === 'receiveddate'),
      billDate: find((k) => k === 'billdate'),
      billNo: find((k) => k === 'billno'),
      base: find((k) => k === 'basevalue'),
      transport: find((k) => k === 'transportation'),
      gst: find((k) => k === 'gst'),
      total: find((k) => k === 'total'),
      qty: find((k) => k === 'qty'),
      work: find((k) => k.startsWith('working')),
      far: find((k) => k.startsWith('far')),
      remarks: find((k) => k === 'remarks'),
      books: find((k) => k === 'inaccountbooks'),
      tang: find((k) => k.startsWith('tangible')),
      lic: find((k) => k.includes('licence') || k.includes('license')),
      sale: find((k) => k === 'sale' || k === 'sold'),
    };
    if (col.item < 0) return { error: 'The column "Name of Item" was not found.' };

    const get = (r: unknown[], i: number) => (i < 0 ? '' : r[i]);
    const explicitCodes = new Set(rows.map((r) => text(get(r, col.code)).toLowerCase()).filter(Boolean));
    const usedCodes = new Set<string>();
    const suffixCount = new Map<string, number>();
    const usedSerials = new Set<string>();

    const n = { noCode: 0, sharedCode: 0, serialMoved: 0, badDate: 0, notWorking: 0, sold: 0, other: 0, qtyMany: 0, priceFromParts: 0 };

    const out: unknown[][] = rows.map((r) => {
      const remarks: string[] = [];
      const sheetRemark = text(get(r, col.remarks));
      if (sheetRemark) remarks.push(sheetRemark);

      // Asset ID: the register repeats one ID for every part of a set (CPU, keyboard, mouse...). The app needs a unique ID per asset.
      let code = text(get(r, col.code));
      if (!code) n.noCode += 1;
      else {
        const key = code.toLowerCase();
        if (usedCodes.has(key)) {
          let k = suffixCount.get(key) ?? 1;
          let candidate: string;
          do { k += 1; candidate = `${code}-${k}`; } while (usedCodes.has(candidate.toLowerCase()) || explicitCodes.has(candidate.toLowerCase()));
          suffixCount.set(key, k);
          remarks.push(`Asset ID in register: ${code}`);
          n.sharedCode += 1;
          code = candidate;
        }
        usedCodes.add(code.toLowerCase());
      }

      const item = text(get(r, col.item));
      const desc = text(get(r, col.desc));
      const category = categoryFor(item, desc);
      if (category === OTHER) n.other += 1;

      // Serial number must be unique in the app: "-" / "N/A" are treated as empty, repeats are kept in the remarks.
      let serial = text(get(r, col.serial));
      if (serial) {
        const key = serial.toLowerCase();
        if (usedSerials.has(key)) { remarks.push(`Serial number also listed on another row: ${serial}`); serial = ''; n.serialMoved += 1; }
        else usedSerials.add(key);
      }

      // Dates: received date first, bill date as a fallback. Text that is not a date stays in the remarks.
      const recv = dateCell(get(r, col.recv));
      const bill = dateCell(get(r, col.billDate));
      const purchase = recv.ymd ?? bill.ymd ?? '';
      if (recv.raw && !recv.ymd) { remarks.push(`Received date in register: ${recv.raw}`); n.badDate += 1; }
      if (bill.raw && !bill.ymd) remarks.push(`Bill date in register: ${bill.raw}`);

      // Price: the register's Total; when that is empty or 0, base + transportation + GST. 0 means "not recorded".
      let price = amount(get(r, col.total));
      if (!price || price <= 0) {
        const parts = [col.base, col.transport, col.gst].map((i) => amount(get(r, i)) ?? 0);
        const sum = parts[0] + parts[1] + parts[2];
        price = sum > 0 ? sum : null;
        if (price) n.priceFromParts += 1;
      }

      // Condition and status
      const working = text(get(r, col.work)).toLowerCase();
      const notWorking = /^(not|non)[\s-]*working/.test(working);
      const soldTo = text(get(r, col.sale));
      let condition = 'Good';
      let status = 'Available';
      if (notWorking) { condition = 'Poor'; status = 'Damaged'; n.notWorking += 1; }
      if (soldTo) { status = 'Retired'; remarks.push(`Sold: ${soldTo}`); n.sold += 1; }

      const user = text(get(r, col.user));
      if (user) remarks.push(`User: ${user}`);
      const far = text(get(r, col.far));
      if (far) remarks.push(`FAR record with accounts: ${far}`);
      const books = text(get(r, col.books));
      if (books) remarks.push(`In account books: ${books}`);
      const tang = text(get(r, col.tang));
      if (tang) remarks.push(`Type: ${tang}`);

      const qty = amount(get(r, col.qty));
      if (qty !== null && qty > 1) n.qtyMany += 1;

      const lic = text(get(r, col.lic));
      const rec: Record<(typeof OUT)[number], unknown> = {
        'Asset ID': code,
        'Asset name': assetName(item, desc),
        'Category': category,
        'Serial number': serial,
        'Invoice number': text(get(r, col.billNo)),
        'Purchase date': purchase,
        'Purchase price (INR)': price ?? '',
        'Location': text(get(r, col.loc)),
        'Condition': condition,
        'Status': status,
        'Specifications': lic ? `Licence key: ${lic}` : '',
        'Remarks': remarks.join(' | '),
      };
      return OUT.map((k) => rec[k]);
    });

    const notes: string[] = [];
    const plural = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
    if (n.noCode) notes.push(`${plural(n.noCode, 'row has', 'rows have')} no Asset ID. The app will give ${n.noCode === 1 ? 'it' : 'them'} automatic IDs (AST-000001 style).`);
    if (n.sharedCode) notes.push(`${plural(n.sharedCode, 'row repeats', 'rows repeat')} an Asset ID used earlier (parts of the same set). They are saved as SC00002-2, SC00002-3 ... and the original ID is kept in Remarks.`);
    if (n.serialMoved) notes.push(`${plural(n.serialMoved, 'serial number is', 'serial numbers are')} repeated on another row. The first row keeps it; the others have it in Remarks. Entries like "-" and "N/A" are treated as empty.`);
    if (n.badDate) notes.push(`${plural(n.badDate, 'Received Date is', 'Received Dates are')} not a valid date. The text is kept in Remarks.`);
    if (n.notWorking) notes.push(`${plural(n.notWorking, 'item is', 'items are')} marked Not Working and will be saved as Damaged (condition Poor), so ${n.notWorking === 1 ? 'it is' : 'they are'} not offered for allocation.`);
    if (n.sold) notes.push(`${plural(n.sold, 'item is', 'items are')} marked as sold and will be saved as Retired, with the buyer in Remarks.`);
    if (n.other) notes.push(`${plural(n.other, 'item has', 'items have')} no matching category in the app (telephones, speakers, tools, software ...) and go to "${OTHER}". You can change the category later.`);
    if (n.qtyMany) notes.push(`${plural(n.qtyMany, 'row has', 'rows have')} Qty above 1. Each row is saved as one asset, so add separate rows for each unit.`);

    // Which uploaded columns were used or left out
    const usedIdx = new Set(Object.entries(col).filter(([k, i]) => i >= 0 && k !== 'qty').map(([, i]) => i));
    const matched = headers.filter((h, i) => h && usedIdx.has(i));
    const ignored = headers.filter((h, i) => h && !usedIdx.has(i));

    return { sheet: { headers: [...OUT], rows: out, rowNos }, notes, matched, ignored };
  },
};
