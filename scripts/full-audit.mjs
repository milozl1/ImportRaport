/**
 * Full Audit Script — processes all 12 DHL Excel files through the
 * actual validator pipeline and checks every critical column for
 * correctness after repair.
 */

import * as XLSX from 'xlsx';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateAndFix, reportSummary } from '../src/js/validator.js';

// Resolve excel directory relative to the current working directory so the
// script behaves the same whether run from the project root or via an IDE.
// Point audit at the DHL folder
const EXCEL_DIR = join(process.cwd(), 'excel', 'DHL');

// DHL broker config (same as brokers.js)
const DHL = {
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

/* ─── Pattern matchers (same as validator.js) ─── */
const P = {
  hsCode:   (v) => v != null && v !== '' && /^\d{8,11}$/.test(String(v).trim()),
  country2: (v) => typeof v === 'string' && /^[A-Z]{2}$/i.test(v.trim()),
  currency3:(v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  procCode: (v) => v != null && v !== '' && /^\d{3,4}$/.test(String(v).trim()),
  numeric:  (v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'number') return true;
    return /^-?\d/.test(String(v).trim());
  },
  isEmpty:  (v) => v == null || v === '',
  postcode: (v) => {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return s.length > 0 && s.length <= 10 && /^[\dA-Z][\dA-Z \-\.]*$/i.test(s);
  },
};

/* ─── Load and parse one file ─── */
function loadFile(filePath) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

function extractParts(rows) {
  const headers = rows.slice(DHL.headerStartRow, DHL.headerStartRow + DHL.headerRows);
  const rawData = rows.slice(DHL.dataStartRow);
  const data = rawData.filter(row => !DHL.isFooterRow(row));
  return { headers, data };
}

/* ─── Column validation checks ─── */
function checkRow(row, rowIdx, fileName) {
  const issues = [];

  // ── Seller zone (cols 15-19) should be empty ──
  for (let c = 15; c <= 19; c++) {
    if (!P.isEmpty(row[c])) {
      issues.push({
        severity: 'ERROR',
        col: c,
        msg: `Seller col ${c} NOT EMPTY: "${String(row[c]).substring(0,40)}"`,
      });
    }
  }

  // ── HS Code (col 110) ──
  if (!P.hsCode(row[110]) && !P.isEmpty(row[110])) {
    issues.push({
      severity: 'ERROR',
      col: 110,
      msg: `HS Code invalid: "${String(row[110]).substring(0,30)}"`,
    });
  }
  if (P.isEmpty(row[110])) {
    issues.push({
      severity: 'WARN',
      col: 110,
      msg: `HS Code empty`,
    });
  }

  // ── Country of Origin (col 111) ──
  if (!P.country2(row[111]) && !P.isEmpty(row[111])) {
    // Check if it's a "no country" row (procCode at col 112)
    if (!(P.procCode(row[112]) && P.isEmpty(row[111]))) {
      issues.push({
        severity: 'ERROR',
        col: 111,
        msg: `Country of Origin invalid: "${String(row[111]).substring(0,30)}"`,
      });
    }
  }

  // ── Procedure Code (col 113) ──
  if (!P.procCode(row[113]) && !P.isEmpty(row[113])) {
    issues.push({
      severity: 'WARN',
      col: 113,
      msg: `ProcCode invalid: "${String(row[113]).substring(0,30)}"`,
    });
  }

  // ── Shipper Country (col 24) ──
  if (!P.country2(row[24]) && !P.isEmpty(row[24])) {
    issues.push({
      severity: 'ERROR',
      col: 24,
      msg: `Shipper Country invalid: "${String(row[24]).substring(0,30)}"`,
    });
  }

  // ── Consignee Country (col 30) ──
  if (!P.country2(row[30]) && !P.isEmpty(row[30])) {
    issues.push({
      severity: 'ERROR',
      col: 30,
      msg: `Consignee Country invalid: "${String(row[30]).substring(0,30)}"`,
    });
  }

  // ── Currency (col 118) ──
  if (!P.currency3(row[118]) && !P.isEmpty(row[118])) {
    issues.push({
      severity: 'WARN',
      col: 118,
      msg: `Currency invalid: "${String(row[118]).substring(0,10)}"`,
    });
  }

  // ── Numeric columns should not have leading comma/dot ──
  const numCols = [33, 34, 67, 71, 75, 76, 77, 116, 117, 119, 120, 121, 123, 124, 125, 127, 128];
  for (const c of numCols) {
    if (c >= row.length) continue;
    const v = row[c];
    if (typeof v === 'string' && /^[.,]\d/.test(v.trim())) {
      issues.push({
        severity: 'ERROR',
        col: c,
        msg: `Numeric col has leading comma/dot: "${v.trim()}"`,
      });
    }
  }

  // ── Description (col 109) should be text ──
  if (P.hsCode(row[109])) {
    issues.push({
      severity: 'ERROR',
      col: 109,
      msg: `Description col has HS Code value: "${row[109]}" — possible shift not repaired`,
    });
  }

  return issues;
}

/* ─── Main audit ─── */
function audit(passNumber) {
  const files = readdirSync(EXCEL_DIR)
    .filter(f => f.endsWith('.xlsx') && !f.startsWith('.~'))
    .sort();

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  AUDIT PASS #${passNumber} — ${files.length} files`);
  console.log(`${'═'.repeat(72)}`);

  let totalRows = 0;
  let totalErrors = 0;
  let totalWarns = 0;
  let totalShiftFixes = 0;
  let totalNumberFixes = 0;
  const perFileStats = [];

  for (const fileName of files) {
    const filePath = join(EXCEL_DIR, fileName);
    const rows = loadFile(filePath);
    const { data } = extractParts(rows);

    // Run validator
    const report = validateAndFix(data, DHL);

    // Now check every row for correctness AFTER validation
    let fileErrors = 0;
    let fileWarns = 0;
    const fileIssues = [];

    for (let r = 0; r < data.length; r++) {
      const issues = checkRow(data[r], r, fileName);
      for (const issue of issues) {
        if (issue.severity === 'ERROR') {
          fileErrors++;
          fileIssues.push({ row: r + 1, ...issue });
        } else {
          fileWarns++;
        }
      }
    }

    totalRows += data.length;
    totalErrors += fileErrors;
    totalWarns += fileWarns;
    totalShiftFixes += report.shiftFixes;
    totalNumberFixes += report.numberFixes;

    const status = fileErrors === 0 ? '✅' : '❌';
    const month = fileName.replace('.xlsx', '').padEnd(20);
    console.log(`  ${status} ${month}  ${String(data.length).padStart(4)} rows | ${report.shiftFixes} shifts fixed | ${report.numberFixes} number fixes | ${fileErrors} errors | ${fileWarns} warns`);

    if (fileErrors > 0 && fileIssues.length <= 10) {
      for (const issue of fileIssues) {
        console.log(`       ⚠️  Row ${String(issue.row).padStart(3)}, Col ${String(issue.col).padStart(3)}: ${issue.msg}`);
      }
    } else if (fileErrors > 0) {
      for (const issue of fileIssues.slice(0, 5)) {
        console.log(`       ⚠️  Row ${String(issue.row).padStart(3)}, Col ${String(issue.col).padStart(3)}: ${issue.msg}`);
      }
      console.log(`       ... and ${fileIssues.length - 5} more errors`);
    }

    perFileStats.push({ fileName, rows: data.length, errors: fileErrors, warns: fileWarns, ...report });
  }

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  TOTALS:`);
  console.log(`    Rows processed:   ${totalRows}`);
  console.log(`    Shift fixes:      ${totalShiftFixes}`);
  console.log(`    Number fixes:     ${totalNumberFixes}`);
  console.log(`    Errors remaining: ${totalErrors}`);
  console.log(`    Warnings:         ${totalWarns}`);
  console.log(`${'─'.repeat(72)}`);

  if (totalErrors === 0) {
    console.log(`\n  🎉 PASS #${passNumber} CLEAN — all ${totalRows} rows across ${files.length} files pass validation!`);
  } else {
    console.log(`\n  ❌ PASS #${passNumber} has ${totalErrors} remaining errors — see details above.`);
  }

  return { totalRows, totalErrors, totalWarns, totalShiftFixes, totalNumberFixes, perFileStats };
}

/* ─── Run 3 consecutive audit passes ─── */
console.log('\n🔍 Running 3 consecutive audit passes on all DHL Excel data...\n');

const results = [];
for (let pass = 1; pass <= 3; pass++) {
  results.push(audit(pass));
}

console.log(`\n${'═'.repeat(72)}`);
console.log('  CONSISTENCY CHECK — Are all 3 passes identical?');
console.log(`${'═'.repeat(72)}`);

const r1 = results[0], r2 = results[1], r3 = results[2];
const consistent =
  r1.totalRows === r2.totalRows && r2.totalRows === r3.totalRows &&
  r1.totalErrors === r2.totalErrors && r2.totalErrors === r3.totalErrors &&
  r1.totalShiftFixes === r2.totalShiftFixes && r2.totalShiftFixes === r3.totalShiftFixes &&
  r1.totalNumberFixes === r2.totalNumberFixes && r2.totalNumberFixes === r3.totalNumberFixes;

if (consistent) {
  console.log(`  ✅ All 3 passes produced IDENTICAL results!`);
  console.log(`     Rows: ${r1.totalRows} | Shifts fixed: ${r1.totalShiftFixes} | Numbers fixed: ${r1.totalNumberFixes} | Errors: ${r1.totalErrors}`);
} else {
  console.log(`  ❌ INCONSISTENCY DETECTED!`);
  for (let i = 0; i < 3; i++) {
    const r = results[i];
    console.log(`     Pass ${i + 1}: Rows=${r.totalRows} Shifts=${r.totalShiftFixes} Numbers=${r.totalNumberFixes} Errors=${r.totalErrors}`);
  }
}

console.log(`\n${'═'.repeat(72)}\n`);
