/**
 * DSV Full Audit — processes all 16 DSV files through the validator
 *
 * DSV files come in two formats:
 *   - CSV (semicolon-delimited, UTF-8 BOM, European comma decimals)
 *   - XLSX (dot-decimal, dates as Excel serial numbers)
 *
 * Additionally, Luftfracht files may be multi-sheet or template-only.
 *
 * Verifies:
 *   1. All files parse correctly (CSV + XLSX)
 *   2. Footer detection works
 *   3. Validator runs without errors
 *   4. European comma→dot conversion applied
 *   5. String→Number conversion for numeric columns
 *   6. Excel serial date/time conversion (XLSX files)
 *   7. Three consecutive passes produce identical results (idempotent)
 *   8. Template files (Luftfracht Q1, 01.04-06.05) handled gracefully
 *
 * Run: node scripts/dsv-audit.mjs
 */

import XLSX from 'xlsx';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { validateAndFix, reportSummary } from '../src/js/validator.js';

const DSV_DIR = path.join(process.cwd(), 'excel', 'DSV');

const DSV_BROKER = {
  id: 'DSV',
  headerRows: 1,
  headerStartRow: 0,
  dataStartRow: 1,
  csvDelimiter: ';',
  sheetSelector: (sheetNames, fileName) => {
    if (!fileName || !fileName.toLowerCase().includes('luft')) return sheetNames[0];
    const dataSheet = sheetNames.find(n => /^(importzoll|hella)/i.test(n));
    return dataSheet || sheetNames[0];
  },
  isFooterRow: (row) => {
    if (!row || row.length < 2) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 2;
  },
};

/* ─── Parse a file (CSV or XLSX) ─── */
function parseFile(filePath, fileName) {
  const ext = fileName.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse(content, {
      delimiter: DSV_BROKER.csvDelimiter,
      skipEmptyLines: false,
    });
    let rows = result.data;
    // Strip BOM from first cell
    if (rows.length > 0 && rows[0].length > 0 && typeof rows[0][0] === 'string') {
      rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
    }
    return rows;
  }

  // XLSX
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });

  let sheetName = wb.SheetNames[0];
  if (DSV_BROKER.sheetSelector) {
    sheetName = DSV_BROKER.sheetSelector(wb.SheetNames, fileName) || sheetName;
  }
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

function extractParts(rows) {
  const headerStart = DSV_BROKER.headerStartRow;
  const headerEnd = headerStart + DSV_BROKER.headerRows;
  const headers = rows.slice(headerStart, headerEnd);
  const rawData = rows.slice(DSV_BROKER.dataStartRow);
  const data = rawData.filter(row => !DSV_BROKER.isFooterRow(row));
  return { headers, data };
}

/* ─── Detect template files (Luftfracht Q1, 01.04-06.05) ─── */
function isTemplateFile(headers) {
  if (!headers || headers.length === 0 || !headers[0]) return false;
  const row = headers[0];
  // Template files have ≤ 10 columns with metadata headers like "Field", "Format required"
  if (row.length <= 10) {
    const joined = row.filter(v => v != null).map(v => String(v).toLowerCase()).join(' ');
    if (joined.includes('field') || joined.includes('format') || joined.includes('template')) {
      return true;
    }
  }
  return false;
}

// ───────────────────────────────────────────────
// Main audit
// ───────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════');
console.log('  DSV Full Audit — processing all CSV + XLSX files');
console.log('═══════════════════════════════════════════════════════\n');

const allFiles = fs.readdirSync(DSV_DIR)
  .filter(f => f.endsWith('.csv') || f.endsWith('.xlsx'))
  .sort();

console.log(`Found ${allFiles.length} DSV files\n`);

let totalRows = 0;
let totalFixes = 0;
let totalWarnings = 0;
let totalCommaFixes = 0;
let totalStringToNum = 0;
let totalDateFixes = 0;
let skippedTemplates = 0;
let errors = 0;

// Collect all data + headers for multi-pass test
let allDataForMultiPass = [];
let multiPassHeaders = null;

for (const file of allFiles) {
  const filePath = path.join(DSV_DIR, file);
  const ext = file.split('.').pop().toLowerCase();
  const isLuft = file.toLowerCase().includes('luft');

  try {
    const rows = parseFile(filePath, file);
    const { headers, data } = extractParts(rows);

    // Check for template files
    if (isTemplateFile(headers)) {
      console.log(`⏭️  ${file.padEnd(55)} TEMPLATE — skipped (${headers[0].length} cols)`);
      skippedTemplates++;
      continue;
    }

    if (data.length === 0) {
      console.log(`⏭️  ${file.padEnd(55)} NO DATA ROWS — skipped`);
      skippedTemplates++;
      continue;
    }

    totalRows += data.length;

    // Keep first real headers for multi-pass
    if (!multiPassHeaders) {
      multiPassHeaders = headers;
    }

    // Deep copy for multi-pass test
    const dataCopy = data.map(r => [...r]);
    allDataForMultiPass.push(...dataCopy);

    // Run validator
    const report = validateAndFix(data, DSV_BROKER, headers);

    const commaFixes = report.issues.filter(i => i.type === 'number' && i.detail.includes('→') && !i.detail.includes('string→number') && !i.detail.includes('serial')).length;
    const strToNum = report.issues.filter(i => i.type === 'number' && i.detail.includes('string→number')).length;
    const dateFixes = report.issues.filter(i => i.type === 'date').length;
    const warnCount = report.issues.filter(i => i.type === 'warning').length;

    totalCommaFixes += commaFixes;
    totalStringToNum += strToNum;
    totalDateFixes += dateFixes;
    totalFixes += report.numberFixes;
    totalWarnings += warnCount;

    const status = warnCount === 0 ? '✅' : '⚠️';
    const typeTag = ext === 'csv' ? 'CSV' : 'XLS';
    const luftTag = isLuft ? ' [Luft]' : '';
    console.log(`${status} ${file.padEnd(55)} ${typeTag}${luftTag} | ${data.length.toString().padStart(4)} rows | ${report.numberFixes.toString().padStart(5)} fixes | ${dateFixes.toString().padStart(3)} date | ${warnCount} warns`);

    if (warnCount > 0) {
      for (const w of report.issues.filter(i => i.type === 'warning')) {
        console.log(`   ⚠️  Row ${w.row}: ${w.detail}`);
        errors++;
      }
    }
  } catch (err) {
    console.log(`❌ ${file}: PARSE ERROR — ${err.message}`);
    console.log(`   ${err.stack?.split('\n')[1] || ''}`);
    errors++;
  }
}

console.log('\n───────────────────────────────────────────────────────');
console.log(`Total files processed:    ${allFiles.length - skippedTemplates}`);
console.log(`Templates skipped:        ${skippedTemplates}`);
console.log(`Total data rows:          ${totalRows}`);
console.log(`Total fixes:              ${totalFixes}`);
console.log(`  - Comma→dot:            ${totalCommaFixes}`);
console.log(`  - String→Number:        ${totalStringToNum}`);
console.log(`  - Date/time serial:     ${totalDateFixes}`);
console.log(`Total warnings:           ${totalWarnings}`);
console.log(`Errors:                   ${errors}`);

// ───────────────────────────────────────────────
// Multi-pass idempotency test (3 passes)
// ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Multi-pass idempotency test (3 passes)');
console.log('═══════════════════════════════════════════════════════\n');

if (allDataForMultiPass.length === 0) {
  console.log('⚠️  No data to test — skipping multi-pass');
} else {
  // Pass 1
  const pass1 = validateAndFix(allDataForMultiPass, DSV_BROKER, multiPassHeaders);
  const snap1 = allDataForMultiPass.map(r => [...r]);
  console.log(`Pass 1: ${pass1.numberFixes} fixes, ${pass1.issues.filter(i => i.type === 'warning').length} warnings`);

  // Pass 2
  const pass2 = validateAndFix(allDataForMultiPass, DSV_BROKER, multiPassHeaders);
  const snap2 = allDataForMultiPass.map(r => [...r]);
  console.log(`Pass 2: ${pass2.numberFixes} fixes, ${pass2.issues.filter(i => i.type === 'warning').length} warnings`);

  // Pass 3
  const pass3 = validateAndFix(allDataForMultiPass, DSV_BROKER, multiPassHeaders);
  const snap3 = allDataForMultiPass.map(r => [...r]);
  console.log(`Pass 3: ${pass3.numberFixes} fixes, ${pass3.issues.filter(i => i.type === 'warning').length} warnings`);

  // Verify idempotency
  if (pass2.numberFixes !== 0) {
    console.log('❌ Pass 2 had non-zero fixes — NOT idempotent!');
    errors++;
  } else {
    console.log('✅ Pass 2: 0 fixes (idempotent)');
  }

  if (pass3.numberFixes !== 0) {
    console.log('❌ Pass 3 had non-zero fixes — NOT idempotent!');
    errors++;
  } else {
    console.log('✅ Pass 3: 0 fixes (idempotent)');
  }

  // Verify data identical
  let dataIdentical = true;
  let diffCount = 0;
  for (let i = 0; i < snap1.length; i++) {
    const maxLen = Math.max(snap1[i]?.length || 0, snap2[i]?.length || 0, snap3[i]?.length || 0);
    for (let c = 0; c < maxLen; c++) {
      const v1 = snap1[i]?.[c];
      const v2 = snap2[i]?.[c];
      const v3 = snap3[i]?.[c];
      if (v1 !== v2 || v2 !== v3) {
        if (diffCount < 5) {
          console.log(`❌ Row ${i}, Col ${c}: p1="${v1}" p2="${v2}" p3="${v3}"`);
        }
        dataIdentical = false;
        diffCount++;
        errors++;
      }
    }
  }

  if (dataIdentical) {
    console.log('✅ All 3 passes produce identical data');
  } else {
    console.log(`❌ ${diffCount} cell(s) differ between passes!`);
  }
}

// ───────────────────────────────────────────────
// Post-processing spot checks
// ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Post-processing column type verification');
console.log('═══════════════════════════════════════════════════════\n');

if (multiPassHeaders && multiPassHeaders[0]) {
  const headerRow = multiPassHeaders[0];

  // Check known numeric headers are all numbers
  const numericHeaders = [
    'Rechnungsbetrag', 'Zollwert', 'AbgabeZoll', 'AbgabeEust',
    'Eigenmasse', 'Rohmasse', 'Gesamtgewicht',
  ];

  for (const hdr of numericHeaders) {
    const colIdx = headerRow.findIndex(h => h != null && String(h).trim().toLowerCase() === hdr.toLowerCase());
    if (colIdx === -1) {
      console.log(`  ⏭️  ${hdr}: not found in headers`);
      continue;
    }

    let numCount = 0, strCount = 0, nullCount = 0;
    for (const row of allDataForMultiPass) {
      const v = row[colIdx];
      if (v == null || v === '') nullCount++;
      else if (typeof v === 'number') numCount++;
      else strCount++;
    }

    if (strCount > 0) {
      // Check if remaining strings are non-numeric (legitimate blanks etc.)
      let legitStr = 0;
      for (const row of allDataForMultiPass) {
        const v = row[colIdx];
        if (typeof v === 'string' && v.trim() !== '') {
          if (isNaN(Number(v.trim()))) legitStr++;
        }
      }
      if (legitStr === strCount) {
        console.log(`  ${hdr.padEnd(25)} ${numCount} num, ${strCount} str (non-numeric → OK), ${nullCount} null`);
      } else {
        console.log(`  ⚠️  ${hdr.padEnd(25)} ${numCount} num, ${strCount} str (${strCount - legitStr} unconverted!), ${nullCount} null`);
        errors++;
      }
    } else {
      console.log(`  ${hdr.padEnd(25)} ${numCount} num, ${nullCount} null — 100% numeric ✅`);
    }
  }

  // Check date columns are all strings (DD.MM.YYYY)
  const dateHeaders = ['Anlagedatum', 'Überlassungsdatum', 'Annahmedatum'];
  for (const hdr of dateHeaders) {
    const colIdx = headerRow.findIndex(h => h != null && String(h).trim().toLowerCase() === hdr.toLowerCase());
    if (colIdx === -1) {
      // Try alternate encoding
      const altIdx = headerRow.findIndex(h => h != null && String(h).trim().toLowerCase().includes(hdr.substring(0, 6).toLowerCase()));
      if (altIdx === -1) {
        console.log(`  ⏭️  ${hdr}: not found`);
        continue;
      }
    }
    if (colIdx >= 0) {
      let dateStr = 0, dateSerial = 0, dateOther = 0, nullCount = 0;
      for (const row of allDataForMultiPass) {
        const v = row[colIdx];
        if (v == null || v === '') nullCount++;
        else if (typeof v === 'string') dateStr++;
        else if (typeof v === 'number' && v > 40000 && v < 60000) dateSerial++;
        else dateOther++;
      }
      if (dateSerial > 0) {
        console.log(`  ⚠️  ${hdr.padEnd(25)} ${dateStr} str, ${dateSerial} UNCONVERTED serials, ${dateOther} other, ${nullCount} null`);
        errors++;
      } else {
        console.log(`  ${hdr.padEnd(25)} ${dateStr} str, ${dateOther} non-serial num, ${nullCount} null — OK ✅`);
      }
    }
  }
}

// ───────────────────────────────────────────────
// Final result
// ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
if (errors === 0) {
  console.log('  ✅ DSV AUDIT PASSED — 0 errors, 0 warnings');
} else {
  console.log(`  ❌ DSV AUDIT FAILED — ${errors} error(s)`);
}
console.log('═══════════════════════════════════════════════════════\n');

if (errors > 0) process.exit(1);
