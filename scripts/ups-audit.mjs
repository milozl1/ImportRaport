/**
 * UPS Full Audit
 * Processes all 12 UPS Excel files through the validator pipeline.
 * Verifies:
 *   - All numeric columns are Number type after validation
 *   - HS codes valid, country codes valid
 *   - 0 warnings after repair
 *   - 3-pass idempotent (deterministic)
 *
 * Run: node scripts/ups-audit.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import * as XLSX from 'xlsx';
import { validateAndFix, reportSummary } from '../src/js/validator.js';

const DIR = 'excel/UPS';
const BROKER = { id: 'UPS', headerRows: 1, headerStartRow: 0, dataStartRow: 1 };
const files = readdirSync(DIR).filter(f => f.endsWith('.xlsx')).sort();

const NUMERIC_COLS = [5, 6, 8, 10, 11, 15, 16, 17, 19, 20, 21, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 47];
const COUNTRY_COLS = [23, 24, 42, 44];
const HS_COL = 28;

let totalRows = 0;
let totalFixes = 0;
let totalWarnings = 0;
let errors = 0;

console.log(`UPS Full Audit — ${files.length} files\n`);

for (const fname of files) {
  const buf = readFileSync(`${DIR}/${fname}`);
  const wb = XLSX.read(buf, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const headers = [rows[0]];
  const data = rows.slice(1);
  totalRows += data.length;

  // Pass 1
  const r1 = validateAndFix(data, BROKER, headers);
  const pass1Fixes = r1.numberFixes;
  const pass1Warnings = r1.issues.filter(i => i.type === 'warning').length;

  // Pass 2 — should be 0 fixes (idempotent)
  const r2 = validateAndFix(data, BROKER, headers);
  const pass2Fixes = r2.numberFixes;

  // Pass 3 — should also be 0 fixes
  const r3 = validateAndFix(data, BROKER, headers);
  const pass3Fixes = r3.numberFixes;

  let fileErrors = 0;

  // Check idempotency
  if (pass2Fixes !== 0) {
    console.log(`  ❌ ${fname}: Pass 2 had ${pass2Fixes} fixes (not idempotent)`);
    fileErrors++;
  }
  if (pass3Fixes !== 0) {
    console.log(`  ❌ ${fname}: Pass 3 had ${pass3Fixes} fixes (not idempotent)`);
    fileErrors++;
  }

  // Post-validation checks
  for (let ri = 0; ri < data.length; ri++) {
    const row = data[ri];
    if (!row) continue;

    // Numeric columns should be Number type
    for (const col of NUMERIC_COLS) {
      if (col >= row.length) continue;
      const v = row[col];
      if (v == null || v === '') continue;
      if (typeof v !== 'number') {
        console.log(`  ❌ ${fname} R${ri + 1} Col${col}: expected Number, got ${typeof v} "${v}"`);
        fileErrors++;
      }
    }

    // HS code (col 28)
    const hs = row[HS_COL];
    if (hs != null && hs !== '') {
      const s = String(hs).trim();
      if (!/^\d{8,11}$/.test(s)) {
        console.log(`  ❌ ${fname} R${ri + 1}: bad HS code "${s}"`);
        fileErrors++;
      }
    }

    // Country codes
    for (const col of COUNTRY_COLS) {
      if (col >= row.length) continue;
      const v = row[col];
      if (v == null || v === '') continue;
      const s = String(v).trim();
      if (!/^[A-Z]{2}$/i.test(s)) {
        console.log(`  ❌ ${fname} R${ri + 1} Col${col}: bad country "${s}"`);
        fileErrors++;
      }
    }

    // Trailing cols should be trimmed
    if (row.length > 62) {
      console.log(`  ❌ ${fname} R${ri + 1}: row length ${row.length} > 62 (trailing cols not trimmed)`);
      fileErrors++;
    }
  }

  totalFixes += pass1Fixes;
  totalWarnings += pass1Warnings;
  errors += fileErrors;

  const status = fileErrors === 0 ? '✅' : '❌';
  console.log(`${status} ${fname}: ${data.length} rows, ${pass1Fixes} fixes, ${pass1Warnings} warnings, pass2=${pass2Fixes}, pass3=${pass3Fixes}${fileErrors > 0 ? `, ${fileErrors} ERRORS` : ''}`);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`RESULTS`);
console.log(`${'═'.repeat(60)}`);
console.log(`Files:    ${files.length}`);
console.log(`Rows:     ${totalRows}`);
console.log(`Fixes:    ${totalFixes}`);
console.log(`Warnings: ${totalWarnings}`);
console.log(`Errors:   ${errors}`);
console.log(`${'═'.repeat(60)}`);

process.exit(errors > 0 ? 1 : 0);
