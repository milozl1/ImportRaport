/**
 * Diagnostic script: dump the problematic November row BEFORE and AFTER validation
 * to understand exactly what's happening with the mid-row overflow repair.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { validateAndFix } from '../src/js/validator.js';

const DHL_BROKER = {
  id: 'DHL',
  headerRows: 2,
  headerStartRow: 0,
  dataStartRow: 2,
  isFooterRow: (row) => {
    if (!row || row.length < 3) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 3;
  },
};

const filePath = resolve('excel', 'November 2025.xlsx');
const buf = readFileSync(filePath);
const wb = XLSX.read(buf, { raw: true, cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

// Extract headers and data
const headers = allRows.slice(0, 2);
const dataRows = allRows.slice(2).filter(row => {
  if (!row || row.length < 3) return false;
  const nonEmpty = row.filter(c => c != null && c !== '');
  return nonEmpty.length >= 3;
});

// Find the CARR. 110 IRAPUATO row (the cascade row)
console.log('=== SEARCHING FOR PROBLEMATIC ROW ===\n');
let targetIdx = -1;
for (let i = 0; i < dataRows.length; i++) {
  const row = dataRows[i];
  for (let c = 20; c < 40; c++) {
    if (row[c] && String(row[c]).includes('IRAPUATO')) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx >= 0) break;
}

if (targetIdx < 0) {
  console.log('Row not found!');
  process.exit(1);
}

console.log(`Found at data row index ${targetIdx}\n`);

// Column labels (Excel-style)
function colLabel(n) {
  let s = '';
  n++;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

// Header labels from row 1
const headerLabels = headers[0] || [];

// Dump cols 30-45 BEFORE validation
const row = dataRows[targetIdx];
console.log('=== BEFORE VALIDATION ===');
console.log('Cols 30-45 (AF-AT in Excel, 0-based 30-45):');
for (let c = 30; c <= 45; c++) {
  const excel = colLabel(c);
  const hdr = headerLabels[c] || '';
  console.log(`  [${c}] ${excel} (${hdr}): ${JSON.stringify(row[c])}`);
}

console.log('\nCols 20-30 (Shipper/Consignee):');
for (let c = 20; c <= 30; c++) {
  const excel = colLabel(c);
  const hdr = headerLabels[c] || '';
  console.log(`  [${c}] ${excel} (${hdr}): ${JSON.stringify(row[c])}`);
}

// Also check what's in the header row 1 for these columns
console.log('\n=== HEADER ROW 1 (cols 30-40) ===');
for (let c = 30; c <= 40; c++) {
  console.log(`  [${c}] ${colLabel(c)}: ${JSON.stringify(headerLabels[c])}`);
}

// Deep copy data for validation
const dataCopy = dataRows.map(r => [...r]);
const report = validateAndFix(dataCopy, DHL_BROKER);

console.log('\n=== AFTER VALIDATION ===');
const fixedRow = dataCopy[targetIdx];
console.log('Cols 30-45 (AF-AT in Excel):');
for (let c = 30; c <= 45; c++) {
  const excel = colLabel(c);
  const hdr = headerLabels[c] || '';
  console.log(`  [${c}] ${excel} (${hdr}): ${JSON.stringify(fixedRow[c])}`);
}

console.log('\nCols 20-30 (Shipper/Consignee):');
for (let c = 20; c <= 30; c++) {
  const excel = colLabel(c);
  const hdr = headerLabels[c] || '';
  console.log(`  [${c}] ${excel} (${hdr}): ${JSON.stringify(fixedRow[c])}`);
}

// Also dump cols 109-115 (goods zone)
console.log('\nCols 109-115 (Goods zone):');
for (let c = 109; c <= 115; c++) {
  const excel = colLabel(c);
  const hdr = headerLabels[c] || '';
  console.log(`  [${c}] ${excel} (${hdr}): ${JSON.stringify(fixedRow[c])}`);
}

// Compare with a known-good row
console.log('\n=== COMPARISON WITH KNOWN-GOOD ROW (row 1) ===');
const goodRow = dataCopy[0];
console.log('Good row cols 30-40:');
for (let c = 30; c <= 40; c++) {
  const excel = colLabel(c);
  const hdr = headerLabels[c] || '';
  console.log(`  [${c}] ${excel} (${hdr}): ${JSON.stringify(goodRow[c])}`);
}

// Report issues for this row
console.log('\n=== ISSUES FOR THIS ROW ===');
const rowNum = targetIdx + 1;
const rowIssues = report.issues.filter(i => i.row === rowNum);
for (const iss of rowIssues) {
  console.log(`  [${iss.type}] ${iss.zone || ''}: ${iss.detail}`);
}

// Also check: does the output still have a shift?
console.log('\n=== SHIFT CHECK ===');
const freightVal = fixedRow[33];
const weightVal = fixedRow[34];
console.log(`Col 33 (AH, freight): ${JSON.stringify(freightVal)} — numeric? ${typeof freightVal === 'number' || /^\d/.test(String(freightVal || ''))}`);
console.log(`Col 34 (AI, weight):  ${JSON.stringify(weightVal)} — numeric? ${typeof weightVal === 'number' || /^\d/.test(String(weightVal || ''))}`);

// Check ALL columns between 30 and 110 to find alignment issues
console.log('\n=== FULL RANGE COMPARISON (cols 30-50) ===');
console.log('          Good Row                   |  Problem Row');
for (let c = 30; c <= 50; c++) {
  const gv = JSON.stringify(goodRow[c] ?? null).padEnd(30);
  const pv = JSON.stringify(fixedRow[c] ?? null).padEnd(30);
  const match = gv.trim() === pv.trim() ? '  ' : '≠≠';
  console.log(`  [${String(c).padStart(3)}] ${colLabel(c).padStart(3)}: ${gv} | ${pv} ${match}`);
}
