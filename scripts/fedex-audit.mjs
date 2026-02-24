/**
 * FedEx Full Audit — processes all 22 FedEx Excel files through the validator
 *
 * Verifies:
 *   1. All files parse correctly
 *   2. Footer detection works (correct row counts)
 *   3. Validator runs without errors
 *   4. No warnings remain after processing
 *   5. Three consecutive passes produce identical results (deterministic)
 *   6. String-to-Number conversions applied correctly
 *   7. Newline cleanups applied correctly
 *
 * Run: node scripts/fedex-audit.mjs
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { validateAndFix, reportSummary } from '../src/js/validator.js';

const FEDEX_DIR = 'excel/FEDEX';
const FEDEX_BROKER = {
  id: 'FEDEX',
  headerRows: 1,
  headerStartRow: 13,
  dataStartRow: 14,
  isFooterRow: (row) => {
    if (!row || row.length < 3) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 3;
  },
};

function parseFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

function extractParts(rows, broker) {
  const headerStart = broker.headerStartRow ?? 0;
  const headerEnd = headerStart + broker.headerRows;
  const dataStart = broker.dataStartRow;
  const headers = rows.slice(headerStart, headerEnd);
  const rawData = rows.slice(dataStart);
  const data = rawData.filter(row => !broker.isFooterRow(row));
  return { headers, data };
}

// ───────────────────────────────────────────────
// Main audit
// ───────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════');
console.log('  FedEx Full Audit — processing all Excel files');
console.log('═══════════════════════════════════════════════════════\n');

const files = fs.readdirSync(FEDEX_DIR).filter(f => f.endsWith('.xlsx')).sort();
console.log(`Found ${files.length} FedEx files\n`);

let totalRows = 0;
let totalFixes = 0;
let totalWarnings = 0;
let totalNewlineCleanups = 0;
let totalStringToNum = 0;
let totalNumberFmt = 0;
let errors = 0;

// Collect all data for multi-pass test
let allDataForMultiPass = [];

for (const file of files) {
  const filePath = path.join(FEDEX_DIR, file);
  try {
    const rows = parseFile(filePath);
    const { headers, data } = extractParts(rows, FEDEX_BROKER);

    totalRows += data.length;

    // Deep copy for multi-pass test
    const dataCopy = data.map(r => [...r]);
    allDataForMultiPass.push(...dataCopy);

    // Run validator
    const report = validateAndFix(data, FEDEX_BROKER);

    const cleanupCount = report.issues.filter(i => i.type === 'cleanup').length;
    const strToNumCount = report.issues.filter(i => i.type === 'number' && i.detail.includes('string→number')).length;
    const numFmtCount = report.issues.filter(i => i.type === 'number' && !i.detail.includes('string→number') && !i.detail.includes('stripped')).length;
    const warnCount = report.issues.filter(i => i.type === 'warning').length;

    totalNewlineCleanups += cleanupCount;
    totalStringToNum += strToNumCount;
    totalNumberFmt += numFmtCount;
    totalFixes += report.numberFixes;
    totalWarnings += warnCount;

    const status = warnCount === 0 ? '✅' : '⚠️';
    console.log(`${status} ${file.padEnd(60)} ${data.length.toString().padStart(4)} rows | ${report.numberFixes} fixes | ${warnCount} warns`);

    if (warnCount > 0) {
      for (const w of report.issues.filter(i => i.type === 'warning')) {
        console.log(`   ⚠️  Row ${w.row}: ${w.detail}`);
        errors++;
      }
    }
  } catch (err) {
    console.log(`❌ ${file}: PARSE ERROR — ${err.message}`);
    errors++;
  }
}

console.log('\n───────────────────────────────────────────────────────');
console.log(`Total files:              ${files.length}`);
console.log(`Total data rows:          ${totalRows}`);
console.log(`Total fixes:              ${totalFixes}`);
console.log(`  - Newline cleanups:     ${totalNewlineCleanups}`);
console.log(`  - String→Number:        ${totalStringToNum}`);
console.log(`  - Number format:        ${totalNumberFmt}`);
console.log(`Total warnings:           ${totalWarnings}`);
console.log(`Errors:                   ${errors}`);

// ───────────────────────────────────────────────
// Multi-pass idempotency test (3 passes)
// ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Multi-pass idempotency test (3 passes)');
console.log('═══════════════════════════════════════════════════════\n');

// Pass 1
const pass1Report = validateAndFix(allDataForMultiPass, FEDEX_BROKER);
const snapshot1 = allDataForMultiPass.map(r => [...r]);
console.log(`Pass 1: ${pass1Report.numberFixes} fixes, ${pass1Report.issues.filter(i => i.type === 'warning').length} warnings`);

// Pass 2
const pass2Report = validateAndFix(allDataForMultiPass, FEDEX_BROKER);
const snapshot2 = allDataForMultiPass.map(r => [...r]);
console.log(`Pass 2: ${pass2Report.numberFixes} fixes, ${pass2Report.issues.filter(i => i.type === 'warning').length} warnings`);

// Pass 3
const pass3Report = validateAndFix(allDataForMultiPass, FEDEX_BROKER);
const snapshot3 = allDataForMultiPass.map(r => [...r]);
console.log(`Pass 3: ${pass3Report.numberFixes} fixes, ${pass3Report.issues.filter(i => i.type === 'warning').length} warnings`);

// Verify passes 2 & 3 produce 0 new fixes
if (pass2Report.numberFixes !== 0) {
  console.log('❌ Pass 2 had non-zero fixes — NOT idempotent!');
  errors++;
} else {
  console.log('✅ Pass 2: 0 fixes (idempotent)');
}

if (pass3Report.numberFixes !== 0) {
  console.log('❌ Pass 3 had non-zero fixes — NOT idempotent!');
  errors++;
} else {
  console.log('✅ Pass 3: 0 fixes (idempotent)');
}

// Verify data is identical between passes
let dataIdentical = true;
for (let i = 0; i < snapshot1.length; i++) {
  for (let c = 0; c < Math.max(snapshot1[i].length, snapshot2[i].length, snapshot3[i].length); c++) {
    if (snapshot1[i][c] !== snapshot2[i][c] || snapshot2[i][c] !== snapshot3[i][c]) {
      console.log(`❌ Row ${i}, Col ${c}: pass1="${snapshot1[i][c]}" pass2="${snapshot2[i][c]}" pass3="${snapshot3[i][c]}"`);
      dataIdentical = false;
      errors++;
    }
  }
}

if (dataIdentical) {
  console.log('✅ All 3 passes produce identical data');
}

// ───────────────────────────────────────────────
// Spot-check: verify key column types after processing
// ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Post-processing column type verification');
console.log('═══════════════════════════════════════════════════════\n');

const numericCols = [22,24,27,44,49,53,60,61,65,66,67,68,70,73,85,86,88,89,90,91];
let typeErrors = 0;

for (const col of numericCols) {
  let numberCount = 0;
  let stringCount = 0;
  let nullCount = 0;
  let otherCount = 0;

  for (const row of allDataForMultiPass) {
    const v = row[col];
    if (v == null || v === '') nullCount++;
    else if (typeof v === 'number') numberCount++;
    else if (typeof v === 'string') { stringCount++; }
    else otherCount++;
  }

  const total = numberCount + stringCount + nullCount + otherCount;
  const pct = total > 0 ? ((numberCount / (numberCount + stringCount)) * 100).toFixed(1) : '0';

  if (stringCount > 0) {
    // Check if remaining strings are non-numeric (legitimate)
    let legitStrings = 0;
    for (const row of allDataForMultiPass) {
      const v = row[col];
      if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.trim());
        if (isNaN(n)) legitStrings++;
      }
    }
    if (legitStrings === stringCount) {
      console.log(`  Col ${col.toString().padStart(2)}: ${numberCount} num, ${stringCount} str (all non-numeric → OK), ${nullCount} null`);
    } else {
      console.log(`  ⚠️  Col ${col.toString().padStart(2)}: ${numberCount} num, ${stringCount} str (${stringCount - legitStrings} could be converted!), ${nullCount} null`);
      typeErrors++;
    }
  } else {
    console.log(`  Col ${col.toString().padStart(2)}: ${numberCount} num, ${nullCount} null — 100% numeric ✅`);
  }
}

if (typeErrors > 0) {
  console.log(`\n⚠️  ${typeErrors} columns have unconverted string numbers!`);
  errors++;
}

// Verify HS code (col 56) stays string
let hsAsString = 0, hsAsNumber = 0;
for (const row of allDataForMultiPass) {
  const v = row[56];
  if (v == null || v === '') continue;
  if (typeof v === 'string') hsAsString++;
  else if (typeof v === 'number') hsAsNumber++;
}
console.log(`\n  HS Code (col 56): ${hsAsString} string, ${hsAsNumber} number`);
if (hsAsNumber > 0) {
  console.log('  ⚠️  HS codes should remain as strings!');
  errors++;
} else {
  console.log('  ✅ All HS codes preserved as strings');
}

// Verify descriptions (col 64) have no trailing newlines
let descWithNewline = 0;
for (const row of allDataForMultiPass) {
  const v = row[64];
  if (typeof v === 'string' && /[\r\n]$/.test(v)) {
    descWithNewline++;
  }
}
console.log(`\n  Descriptions (col 64) with trailing newlines: ${descWithNewline}`);
if (descWithNewline > 0) {
  console.log('  ⚠️  Some descriptions still have trailing newlines!');
  errors++;
} else {
  console.log('  ✅ All descriptions clean (no trailing newlines)');
}

// ───────────────────────────────────────────────
// Final result
// ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
if (errors === 0) {
  console.log('  ✅ AUDIT PASSED — 0 errors, 0 warnings');
} else {
  console.log(`  ❌ AUDIT FAILED — ${errors} error(s)`);
}
console.log('═══════════════════════════════════════════════════════\n');

if (errors > 0) process.exit(1);
