/**
 * Inspect the two problematic rows found in the audit:
 * - May 2025, row 5 (0-based): HS Code col has "BLENDE KAMERA ABDECKUNG"
 * - November 2025, row 17 (0-based): HS Code has "MX", Description has "85129090000"
 */

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
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

function dumpRow(label, rows, rowIdx, colStart, colEnd) {
  const row = rows[rowIdx];
  console.log(`\n${label} — Raw Excel row ${rowIdx} (0-based), cols ${colStart}-${colEnd}:`);
  for (let c = colStart; c <= colEnd; c++) {
    const v = row[c];
    const tag = v == null ? 'null' : typeof v === 'string' ? `"${v}"` : v;
    console.log(`  col ${String(c).padStart(3)} = ${tag}`);
  }
}

// ── May 2025 ──
console.log('='.repeat(72));
console.log('MAY 2025 — Row 5 (data row, 0-based after header removal)');
console.log('='.repeat(72));

const mayRows = loadFile(join(EXCEL_DIR, 'May 2025.xlsx'));
const mayData = mayRows.slice(2).filter(r => !isFooterRow(r));

// Row 5 = data[4] (audit uses 1-based row numbers)
const mayRowIdx = 4; // 0-based in data
const mayRawRowIdx = mayRowIdx + 2; // offset for headers
dumpRow('May row 5 (data)', mayRows, mayRawRowIdx + mayRowIdx, 105, 120);

// Actually, let me find the exact raw row
// The audit says row 5, which in our 1-based system is data[4]
console.log('\nMay data[4] — Goods zone (cols 107-116):');
const mayR = mayData[4];
for (let c = 107; c <= 120; c++) {
  const v = mayR[c];
  const tag = v == null ? 'null' : typeof v === 'string' ? `"${v}"` : v;
  console.log(`  col ${String(c).padStart(3)} = ${tag}`);
}

console.log('\nMay data[4] — ALL non-null columns:');
for (let c = 0; c < mayR.length; c++) {
  if (mayR[c] != null && mayR[c] !== '') {
    const v = mayR[c];
    const tag = typeof v === 'string' ? `"${v.substring(0, 60)}"` : v;
    console.log(`  col ${String(c).padStart(3)} = ${tag}`);
  }
}

// ── November 2025 ──
console.log('\n' + '='.repeat(72));
console.log('NOVEMBER 2025 — Row 17 (data row, 1-based in audit)');
console.log('='.repeat(72));

const novRows = loadFile(join(EXCEL_DIR, 'November 2025.xlsx'));
const novData = novRows.slice(2).filter(r => !isFooterRow(r));

const novR = novData[16]; // row 17, 0-based = 16
console.log('\nNov data[16] — Goods zone (cols 107-120):');
for (let c = 107; c <= 120; c++) {
  const v = novR[c];
  const tag = v == null ? 'null' : typeof v === 'string' ? `"${v}"` : v;
  console.log(`  col ${String(c).padStart(3)} = ${tag}`);
}

console.log('\nNov data[16] — ALL non-null columns:');
for (let c = 0; c < novR.length; c++) {
  if (novR[c] != null && novR[c] !== '') {
    const v = novR[c];
    const tag = typeof v === 'string' ? `"${v.substring(0, 60)}"` : v;
    console.log(`  col ${String(c).padStart(3)} = ${tag}`);
  }
}

// Also check the Shipper zone
console.log('\nNov data[16] — Shipper/Consignee zone (cols 18-32):');
for (let c = 18; c <= 32; c++) {
  const v = novR[c];
  const tag = v == null ? 'null' : typeof v === 'string' ? `"${v.substring(0, 60)}"` : v;
  console.log(`  col ${String(c).padStart(3)} = ${tag}`);
}
