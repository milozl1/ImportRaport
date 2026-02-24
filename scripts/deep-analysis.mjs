/**
 * Deep analysis of November 2025 - specifically the 05.11.2025 row
 * that has a shift starting at column AH (col 33, 0-based).
 * 
 * Also: exhaustive analysis of ALL files to find ANY column misalignment.
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
  while (idx > 0) {
    idx--;
    s = String.fromCharCode(65 + (idx % 26)) + s;
    idx = Math.floor(idx / 26);
  }
  return s;
}

// ── Pattern matchers ──
const P = {
  hsCode:   (v) => v != null && v !== '' && /^\d{8,11}$/.test(String(v).trim()),
  country2: (v) => typeof v === 'string' && /^[A-Z]{2}$/i.test(v.trim()),
  currency3:(v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  procCode: (v) => v != null && v !== '' && /^\d{3,4}$/.test(String(v).trim()),
  numeric:  (v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'number') return true;
    return /^-?[,.]?\d/.test(String(v).trim());
  },
  isEmpty:  (v) => v == null || v === '',
  isDate:   (v) => {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return /^\d{2}\.\d{2}\.\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{8}$/.test(s);
  },
  isDatePlaceholder: (v) => v != null && String(v).trim() === '0001-01-01',
  incoterm: (v) => typeof v === 'string' && /^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DAT)$/i.test(v.trim()),
};

// ═══════════════════════════════════════════════════════
// PART 1: Deep analysis of November 2025 rows dated 05.11.2025
// ═══════════════════════════════════════════════════════

console.log('═'.repeat(80));
console.log('PART 1: November 2025 — rows dated 05.11.2025');
console.log('═'.repeat(80));

const novRows = loadFile(join(EXCEL_DIR, 'November 2025.xlsx'));
const novHeaders1 = novRows[0];
const novHeaders2 = novRows[1];
const novData = novRows.slice(2).filter(r => !isFooterRow(r));

// Print headers for columns 30-120
console.log('\nHeaders for cols 30-120 (AE-DQ):');
for (let c = 30; c <= 120; c++) {
  const h1 = novHeaders1?.[c] ?? '';
  const h2 = novHeaders2?.[c] ?? '';
  if (h1 || h2) {
    console.log(`  ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): "${h1}" / "${h2}"`);
  }
}

// Find rows dated 05.11.2025
console.log('\n--- Rows with date 05.11.2025 ---');
for (let r = 0; r < novData.length; r++) {
  const row = novData[r];
  if (row[0] === '05.11.2025') {
    console.log(`\n  Row ${r + 1} (data index ${r}):`);
    console.log('  ALL non-null cells:');
    for (let c = 0; c < row.length; c++) {
      if (row[c] != null && row[c] !== '') {
        const v = typeof row[c] === 'string' ? `"${row[c].substring(0, 70)}"` : row[c];
        const letter = colLetter(c);
        console.log(`    ${letter.padStart(3)} (${String(c).padStart(3)}): ${v}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// PART 2: Cross-reference with a KNOWN-GOOD row to detect shifts
// ═══════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log('PART 2: Compare shifted rows vs. known-good row layout');
console.log('═'.repeat(80));

// Find a "known good" row (one where col 110 has an HS code, col 24 has a 2-letter country)
let goodRow = null;
let goodRowIdx = -1;
for (let r = 0; r < novData.length; r++) {
  const row = novData[r];
  if (P.hsCode(row[110]) && P.country2(row[24]) && P.country2(row[111]) && P.incoterm(row[31])) {
    goodRow = row;
    goodRowIdx = r;
    break;
  }
}

if (goodRow) {
  console.log(`\nKnown-good row: index ${goodRowIdx} (date: ${goodRow[0]})`);
  console.log('  Non-null cells (cols 30-137):');
  for (let c = 30; c < goodRow.length; c++) {
    if (goodRow[c] != null && goodRow[c] !== '') {
      const v = typeof goodRow[c] === 'string' ? `"${goodRow[c].substring(0, 50)}"` : goodRow[c];
      console.log(`    ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// PART 3: Exhaustive shift detection across ALL files
// ═══════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log('PART 3: Exhaustive shift detection — ALL 12 files');
console.log('═'.repeat(80));

// What we expect in "normal" layout:
// col 31: Incoterm (3-letter like DDP, EXW, etc.)
// col 33: Freight (numeric)
// col 34: Weight (numeric)
// col 67: Summary duty (numeric) 
// col 110: HS Code
// col 111: Country 2
// col 113: ProcCode
// col 118: Currency

const files = readdirSync(EXCEL_DIR)
  .filter(f => f.endsWith('.xlsx') && !f.startsWith('.~'))
  .sort();

const allShiftIssues = [];

for (const fileName of files) {
  const filePath = join(EXCEL_DIR, fileName);
  const rows = loadFile(filePath);
  const data = rows.slice(2).filter(r => !isFooterRow(r));

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const issues = [];

    // ── Check Shipper zone (20-24) ──
    if (!P.isEmpty(row[20]) && !P.country2(row[24]) && !P.isEmpty(row[24])) {
      // Something in Shipper Country that's not a 2-letter code
      issues.push({ zone: 'Shipper', col: 24, expected: 'country2', got: row[24] });
    }

    // ── Check Consignee zone (26-30) ──
    if (!P.isEmpty(row[26]) && !P.country2(row[30]) && !P.isEmpty(row[30])) {
      issues.push({ zone: 'Consignee', col: 30, expected: 'country2', got: row[30] });
    }

    // ── Check Incoterm (col 31) ──
    if (!P.incoterm(row[31]) && !P.isEmpty(row[31])) {
      issues.push({ zone: 'Incoterm', col: 31, expected: 'incoterm', got: row[31] });
    }

    // ── Check col 32: should be town/location text ──
    // ── Check col 33: should be numeric (freight) ──
    if (!P.numeric(row[33]) && !P.isEmpty(row[33]) && !P.isDatePlaceholder(row[33])) {
      issues.push({ zone: 'Freight', col: 33, expected: 'numeric', got: row[33] });
    }

    // ── Check col 34: weight (numeric) ──
    if (!P.numeric(row[34]) && !P.isEmpty(row[34]) && !P.isDatePlaceholder(row[34])) {
      issues.push({ zone: 'Weight', col: 34, expected: 'numeric', got: row[34] });
    }

    // ── Check col 67: summary duty (numeric) ──
    if (!P.numeric(row[67]) && !P.isEmpty(row[67]) && !P.isDatePlaceholder(row[67])) {
      issues.push({ zone: 'SummaryDuty', col: 67, expected: 'numeric', got: row[67] });
    }

    // ── Check HS Code (col 110) ──
    if (!P.hsCode(row[110]) && !P.isEmpty(row[110]) && !P.isDatePlaceholder(row[110])) {
      issues.push({ zone: 'HSCode', col: 110, expected: 'hsCode', got: row[110] });
    }

    // ── Check Country of Origin (col 111) ──
    if (!P.country2(row[111]) && !P.isEmpty(row[111]) && !P.isDatePlaceholder(row[111])) {
      issues.push({ zone: 'CountryOfOrigin', col: 111, expected: 'country2', got: row[111] });
    }

    // ── Check ProcCode (col 113) ──
    if (!P.procCode(row[113]) && !P.isEmpty(row[113]) && !P.isDatePlaceholder(row[113])) {
      issues.push({ zone: 'ProcCode', col: 113, expected: 'procCode', got: row[113] });
    }

    // ── Check Currency (col 118) ──
    if (!P.currency3(row[118]) && !P.isEmpty(row[118]) && !P.isDatePlaceholder(row[118])) {
      issues.push({ zone: 'Currency', col: 118, expected: 'currency3', got: row[118] });
    }

    // ── Check for non-empty Seller zone ──
    for (let c = 15; c <= 19; c++) {
      if (!P.isEmpty(row[c])) {
        issues.push({ zone: 'Seller', col: c, expected: 'empty', got: row[c] });
      }
    }

    // ── NEW: Check for Consignee data pushed into wrong columns ──
    // If col 26 is empty but col 27 has a name-like value, might be shifted
    if (P.isEmpty(row[26]) && !P.isEmpty(row[27])) {
      // Check if this looks like consignee data starts at col 27 instead of 26
      if (!P.isEmpty(row[31]) && !P.incoterm(row[31])) {
        issues.push({ zone: 'Consignee-shift?', col: 26, expected: 'name', got: 'empty, data starts at 27' });
      }
    }

    if (issues.length > 0) {
      allShiftIssues.push({ file: fileName, row: r + 1, date: row[0], issues });
    }
  }
}

console.log(`\nTotal rows with potential issues (BEFORE validator): ${allShiftIssues.length}`);
for (const item of allShiftIssues) {
  console.log(`\n  ${item.file} — Row ${item.row} (${item.date}):`);
  for (const issue of item.issues) {
    const v = typeof issue.got === 'string' ? `"${String(issue.got).substring(0, 60)}"` : issue.got;
    console.log(`    ${issue.zone.padEnd(20)} col ${String(issue.col).padStart(3)} (${colLetter(issue.col).padStart(3)}): expected ${issue.expected}, got ${v}`);
  }
}

// ═══════════════════════════════════════════════════════
// PART 4: Specific deep dive into rows with Consignee/Incoterm issues
// ═══════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log('PART 4: Rows where col 33 (AH) has non-numeric data');
console.log('═'.repeat(80));

for (const fileName of files) {
  const filePath = join(EXCEL_DIR, fileName);
  const rows = loadFile(filePath);
  const data = rows.slice(2).filter(r => !isFooterRow(r));

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    // Col 33 should be Freight (numeric). If it has text, something is shifted.
    if (!P.numeric(row[33]) && !P.isEmpty(row[33]) && !P.isDatePlaceholder(row[33])) {
      console.log(`\n  ${fileName} — Row ${r + 1} (${row[0]}): Col AH(33) = "${String(row[33]).substring(0, 60)}"`);
      // Show cols 20-40
      console.log('  Cols 20-45 (U-AT):');
      for (let c = 20; c <= 45; c++) {
        if (row[c] != null && row[c] !== '') {
          const v = typeof row[c] === 'string' ? `"${String(row[c]).substring(0, 60)}"` : row[c];
          console.log(`    ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
        }
      }
      // Also show goods zone
      console.log('  Cols 109-125:');
      for (let c = 109; c <= 130; c++) {
        if (row[c] != null && row[c] !== '') {
          const v = typeof row[c] === 'string' ? `"${String(row[c]).substring(0, 60)}"` : row[c];
          console.log(`    ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// PART 5: Check what the Shipper zone shift does to remaining columns
// ═══════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log('PART 5: Trace shipper shift impact on ALL subsequent columns');
console.log('═'.repeat(80));

// For each row where shipper zone col 24 is NOT a country code, trace what's in col 25-35
for (const fileName of files) {
  const filePath = join(EXCEL_DIR, fileName);
  const rows = loadFile(filePath);
  const data = rows.slice(2).filter(r => !isFooterRow(r));

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!P.isEmpty(row[20]) && !P.country2(row[24]) && !P.isEmpty(row[24])) {
      console.log(`\n  ${fileName} — Row ${r + 1} (${row[0]}): Shipper shift detected`);
      console.log('  Cols 20-45 (U-AT):');
      for (let c = 20; c <= 45; c++) {
        if (row[c] != null && row[c] !== '') {
          const v = typeof row[c] === 'string' ? `"${String(row[c]).substring(0, 60)}"` : row[c];
          console.log(`    ${colLetter(c).padStart(3)} (${String(c).padStart(3)}): ${v}`);
        }
      }
    }
  }
}
