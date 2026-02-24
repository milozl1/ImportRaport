/**
 * Investigate the 3 "unknown" rows and deep-dive the "full cascade" row
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

function colLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) { idx--; s = String.fromCharCode(65 + (idx % 26)) + s; idx = Math.floor(idx / 26); }
  return s;
}

function dumpRow(label, row) {
  console.log(`\n${label}`);
  for (let c = 0; c < row.length; c++) {
    if (row[c] != null && row[c] !== '') {
      const v = typeof row[c] === 'string' ? `"${row[c].substring(0, 70)}"` : row[c];
      console.log(`  ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
    }
  }
}

// ── Unknown 1: December 2025 row 107 ──
console.log('═'.repeat(80));
console.log('Unknown 1: December 2025 — Row 107 (19.12.2025)');
console.log('═'.repeat(80));
{
  const rows = loadFile(join(EXCEL_DIR, 'December 2025.xlsx'));
  const data = rows.slice(2).filter(r => !isFooterRow(r));
  const row = data[106]; // 0-based
  console.log('Cols 109-130:');
  for (let c = 109; c <= 130; c++) {
    if (row[c] != null && row[c] !== '') {
      const v = typeof row[c] === 'string' ? `"${row[c].substring(0, 70)}"` : row[c];
      console.log(`  ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
    }
  }
}

// ── Unknown 2: February 2025 row 35 ──
console.log('\n' + '═'.repeat(80));
console.log('Unknown 2: February 2025 — Row 35 (17.02.2025)');
console.log('═'.repeat(80));
{
  const rows = loadFile(join(EXCEL_DIR, 'February 2025.xlsx'));
  const data = rows.slice(2).filter(r => !isFooterRow(r));
  const row = data[34];
  console.log('Cols 109-130:');
  for (let c = 109; c <= 130; c++) {
    if (row[c] != null && row[c] !== '') {
      const v = typeof row[c] === 'string' ? `"${row[c].substring(0, 70)}"` : row[c];
      console.log(`  ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
    }
  }
}

// ── Unknown 3: January 2025 row 50 ──
console.log('\n' + '═'.repeat(80));
console.log('Unknown 3: January 2025 — Row 50 (14.01.2025)');
console.log('═'.repeat(80));
{
  const rows = loadFile(join(EXCEL_DIR, 'January 2025.xlsx'));
  const data = rows.slice(2).filter(r => !isFooterRow(r));
  const row = data[49];
  console.log('Cols 109-130:');
  for (let c = 109; c <= 130; c++) {
    if (row[c] != null && row[c] !== '') {
      const v = typeof row[c] === 'string' ? `"${row[c].substring(0, 70)}"` : row[c];
      console.log(`  ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
    }
  }
}

// ── Full cascade: Nov 2025 row 17 — FULL row dump to understand exactly what's shifted ──
console.log('\n' + '═'.repeat(80));
console.log('FULL CASCADE: November 2025 — Row 17 (05.11.2025)');
console.log('═'.repeat(80));
{
  const rows = loadFile(join(EXCEL_DIR, 'November 2025.xlsx'));
  const data = rows.slice(2).filter(r => !isFooterRow(r));
  const row = data[16];

  // Compare with a good row to see the offset
  // Good row (row 14, index 13)
  const goodRow = data[13];

  console.log('\nSHIFTED ROW 17 vs GOOD ROW 14 — side by side for cols 20-50:');
  console.log(`${'Col'.padEnd(6)} ${'Letter'.padEnd(4)} ${'Good Row 14'.padEnd(45)} ${'Shifted Row 17'.padEnd(45)}`);
  console.log('─'.repeat(100));
  for (let c = 20; c <= 50; c++) {
    const gv = goodRow[c] == null ? '' : typeof goodRow[c] === 'string' ? `"${goodRow[c].substring(0, 40)}"` : goodRow[c];
    const sv = row[c] == null ? '' : typeof row[c] === 'string' ? `"${row[c].substring(0, 40)}"` : row[c];
    if (gv || sv) {
      console.log(`  ${String(c).padEnd(4)} ${colLetter(c).padEnd(4)} ${String(gv).padEnd(45)} ${String(sv).padEnd(45)}`);
    }
  }

  console.log('\nSHIFTED ROW 17 vs GOOD ROW 14 — side by side for cols 60-80:');
  console.log(`${'Col'.padEnd(6)} ${'Letter'.padEnd(4)} ${'Good Row 14'.padEnd(45)} ${'Shifted Row 17'.padEnd(45)}`);
  console.log('─'.repeat(100));
  for (let c = 60; c <= 80; c++) {
    const gv = goodRow[c] == null ? '' : typeof goodRow[c] === 'string' ? `"${goodRow[c].substring(0, 40)}"` : goodRow[c];
    const sv = row[c] == null ? '' : typeof row[c] === 'string' ? `"${row[c].substring(0, 40)}"` : row[c];
    if (gv || sv) {
      console.log(`  ${String(c).padEnd(4)} ${colLetter(c).padEnd(4)} ${String(gv).padEnd(45)} ${String(sv).padEnd(45)}`);
    }
  }

  // Key question: is the shift constant (+2) throughout, or does it vary?
  // Check date placeholder pattern: in good row they appear at 45, 48, 51, ...
  // In shifted row, they should appear at 47, 50, 53, ... (if +2 shift)
  console.log('\nDate placeholder (0001-01-01) positions:');
  const goodDates = [], shiftedDates = [];
  for (let c = 40; c < 110; c++) {
    if (goodRow[c] != null && String(goodRow[c]).trim() === '0001-01-01') goodDates.push(c);
    if (row[c] != null && String(row[c]).trim() === '0001-01-01') shiftedDates.push(c);
  }
  console.log(`  Good row:    [${goodDates.join(', ')}]`);
  console.log(`  Shifted row: [${shiftedDates.join(', ')}]`);
  
  // Calculate offsets
  console.log('\nOffset calculation:');
  for (let i = 0; i < Math.min(goodDates.length, shiftedDates.length); i++) {
    console.log(`  Good[${i}]=${goodDates[i]} → Shifted[${i}]=${shiftedDates[i]}, offset = +${shiftedDates[i] - goodDates[i]}`);
  }
}
