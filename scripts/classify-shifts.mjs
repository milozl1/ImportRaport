/**
 * Classify every anomalous row to understand exact shift patterns.
 * Focus on: WHERE does the shift start, HOW FAR does it propagate.
 */

import * as XLSX from 'xlsx';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const EXCEL_DIR = join(import.meta.dirname, '..', 'excel');

function loadFile(filePath) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

function isFooterRow(row) {
  if (!row || row.length < 3) return true;
  const nonEmpty = row.filter(c => c != null && c !== '');
  return nonEmpty.length < 3;
}

function colLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) { idx--; s = String.fromCharCode(65 + (idx % 26)) + s; idx = Math.floor(idx / 26); }
  return s;
}

const P = {
  hsCode: (v) => v != null && v !== '' && /^\d{8,11}$/.test(String(v).trim()),
  country2: (v) => typeof v === 'string' && /^[A-Z]{2}$/i.test(v.trim()),
  currency3: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  procCode: (v) => v != null && v !== '' && /^\d{3,4}$/.test(String(v).trim()),
  isEmpty: (v) => v == null || v === '',
  isDatePlaceholder: (v) => v != null && String(v).trim() === '0001-01-01',
  incoterm: (v) => typeof v === 'string' && /^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DAT|XXX)$/i.test(v.trim()),
};

const files = readdirSync(EXCEL_DIR)
  .filter(f => f.endsWith('.xlsx') && !f.startsWith('.~'))
  .sort();

console.log('═'.repeat(80));
console.log('SHIFT CLASSIFICATION — Every anomalous row across all 12 files');
console.log('═'.repeat(80));

// For each row, determine:
// 1. Is there a Shipper address overflow (col 22 has address text, col 24 not country)?
// 2. Is the Consignee zone also shifted? (col 26 empty, col 27 has name)
// 3. Is there a "full row cascade" shift (everything from col 22+ shifted right)?
// 4. Is there a goods-only shift (goods zone shifted but rest is OK)?

let shiftCategories = {
  'shipper-only': [],          // Shipper shifted, rest not affected
  'shipper-cascade': [],       // Shipper shift cascades to consignee and beyond
  'consignee-only': [],        // Consignee shifted only
  'goods-only-desc': [],       // Description overflow only
  'goods-only-desc-large': [], // Description overflow > 4 cols
  'full-cascade': [],          // Everything shifted from some point
  'incoterm-xxx': [],          // Incoterm = "XXX" (not a shift, just bad data)
  'unknown': [],               // Can't classify
};

for (const fileName of files) {
  const filePath = join(EXCEL_DIR, fileName);
  const rows = loadFile(filePath);
  const data = rows.slice(2).filter(r => !isFooterRow(r));

  for (let r = 0; r < data.length; r++) {
    const row = data[r];

    // Quick check: is this row normal?
    const shipperCountryOK = P.country2(row[24]) || P.isEmpty(row[24]);
    const consigneeCountryOK = P.country2(row[30]) || P.isEmpty(row[30]);
    const hsCodeOK = P.hsCode(row[110]) || P.isEmpty(row[110]) || P.isDatePlaceholder(row[110]);
    const incotermOK = P.incoterm(row[31]) || P.isEmpty(row[31]);
    const currencyOK = P.currency3(row[118]) || P.isEmpty(row[118]) || P.isDatePlaceholder(row[118]);

    if (shipperCountryOK && consigneeCountryOK && hsCodeOK && incotermOK && currencyOK) continue;

    // ── Classify ──
    const info = {
      file: fileName,
      row: r + 1,
      date: row[0],
    };

    // Check for Incoterm "XXX"
    if (row[31] === 'XXX' && shipperCountryOK && hsCodeOK) {
      shiftCategories['incoterm-xxx'].push({ ...info, note: 'Incoterm=XXX (source data issue)' });
      continue;
    }

    // Check if shipper is shifted
    const shipperShifted = !P.isEmpty(row[20]) && !P.country2(row[24]) && !P.isEmpty(row[24]);

    // Check if consignee is also shifted
    const consigneeShifted = !P.isEmpty(row[27]) && P.isEmpty(row[26]);

    // Check if everything after shipper is also shifted (cascade)
    // Signs: col 31 has a country code instead of incoterm, col 33 has text
    const fullCascade = shipperShifted && (
      (P.country2(row[31]) || !incotermOK) &&
      (typeof row[33] === 'string' && !/^-?[,.]?\d/.test(row[33].trim()))
    );

    if (fullCascade) {
      // Find where HS code actually is
      let hsAt = -1;
      for (let c = 110; c <= 120; c++) {
        if (P.hsCode(row[c])) { hsAt = c; break; }
      }
      const shiftAmount = hsAt > 110 ? hsAt - 110 : '?';

      info.category = 'full-cascade';
      info.note = `Shipper overflow cascades through entire row. HS at col ${hsAt} (shift +${shiftAmount})`;
      info.details = {
        col24: row[24], col25: row[25], col30: row[30], col31: row[31],
        col33: String(row[33]).substring(0, 40),
        col109: String(row[109]).substring(0, 40),
        col110: String(row[110]).substring(0, 40),
        col111: String(row[111]).substring(0, 40),
        col112: String(row[112]).substring(0, 40),
        hsAtCol: hsAt,
      };
      shiftCategories['full-cascade'].push(info);
      continue;
    }

    if (shipperShifted && !consigneeShifted) {
      shiftCategories['shipper-only'].push({ ...info, note: `col24="${row[24]}", col25="${row[25]}"` });
      continue;
    }

    if (shipperShifted && consigneeShifted) {
      shiftCategories['shipper-cascade'].push({ ...info, note: `Shipper+Consignee shifted, col26 empty` });
      continue;
    }

    // Goods-only shift
    if (shipperCountryOK && consigneeCountryOK && !hsCodeOK) {
      // Find where HS code actually is
      let hsAt = -1;
      for (let c = 110; c <= 120; c++) {
        if (P.hsCode(row[c])) { hsAt = c; break; }
      }
      const offset = hsAt > 110 ? hsAt - 110 : 0;

      if (offset > 4) {
        shiftCategories['goods-only-desc-large'].push({
          ...info,
          note: `Description overflow +${offset} (HS at col ${hsAt}). col109="${String(row[109]).substring(0, 50)}"`,
        });
      } else if (offset > 0) {
        shiftCategories['goods-only-desc'].push({
          ...info,
          note: `Description overflow +${offset} (HS at col ${hsAt}). col109="${String(row[109]).substring(0, 50)}"`,
        });
      } else {
        shiftCategories['unknown'].push({
          ...info,
          note: `HS not found nearby. col110="${String(row[110]).substring(0, 50)}", col111="${String(row[111]).substring(0, 40)}"`,
        });
      }
      continue;
    }

    // Unknown
    shiftCategories['unknown'].push({
      ...info,
      note: `shipperOK=${shipperCountryOK} consigneeOK=${consigneeCountryOK} hsOK=${hsCodeOK} incotermOK=${incotermOK}`,
    });
  }
}

// Print results
for (const [category, items] of Object.entries(shiftCategories)) {
  if (items.length === 0) continue;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${category.toUpperCase()} — ${items.length} row(s)`);
  console.log(`${'─'.repeat(60)}`);
  for (const item of items) {
    console.log(`  ${item.file.padEnd(25)} Row ${String(item.row).padStart(3)} (${item.date}): ${item.note}`);
    if (item.details) {
      console.log(`    Details: col24=${item.details.col24}, col25=${item.details.col25}, col30=${item.details.col30}, col31=${item.details.col31}`);
      console.log(`    col33="${item.details.col33}"`);
      console.log(`    col109="${item.details.col109}"`);
      console.log(`    col110="${item.details.col110}"`);
      console.log(`    col111="${item.details.col111}"`);
      console.log(`    col112="${item.details.col112}"`);
    }
  }
}

// Summary
console.log('\n' + '═'.repeat(80));
console.log('SUMMARY');
console.log('═'.repeat(80));
let total = 0;
for (const [category, items] of Object.entries(shiftCategories)) {
  if (items.length > 0) {
    console.log(`  ${category.padEnd(30)} ${items.length} row(s)`);
    total += items.length;
  }
}
console.log(`  ${'TOTAL'.padEnd(30)} ${total} row(s)`);
