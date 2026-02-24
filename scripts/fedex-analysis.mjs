/**
 * Deep analysis of FedEx Excel files — structure, headers, data, footer patterns
 */
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const FEDEX_DIR = 'excel/FEDEX';
const files = fs.readdirSync(FEDEX_DIR)
  .filter(f => f.endsWith('.xlsx') && !f.startsWith('.'))
  .sort();

console.log(`Found ${files.length} FedEx files:\n`);
files.forEach(f => console.log(`  ${f}`));

// Analyze first few files in detail
const samplesToAnalyze = [
  files.find(f => f.startsWith('04-jan')),
  files.find(f => f.startsWith('01-feb')),
  files.find(f => f.includes('Brokerage')),
  files.find(f => f.includes('Sept-Dec')),
].filter(Boolean);

for (const fname of samplesToAnalyze) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  FILE: ${fname}`);
  console.log('═'.repeat(80));

  const wb = XLSX.readFile(path.join(FEDEX_DIR, fname), { raw: true, cellDates: false });
  
  console.log(`\n  Sheets: ${wb.SheetNames.join(', ')}`);
  
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  
  console.log(`  Total rows: ${rows.length}`);
  
  // Show all rows up to row 20 for understanding header structure
  console.log(`\n  ── First 20 rows (raw) ──`);
  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const row = rows[r];
    if (!row) { console.log(`  Row ${r}: [null]`); continue; }
    const nonEmpty = row.filter(c => c != null && c !== '');
    const maxCol = row.length;
    const preview = row.slice(0, Math.min(12, maxCol)).map((v, i) => 
      `[${i}]=${v === null ? 'null' : typeof v === 'string' ? `"${v.substring(0,30)}"` : v}`
    ).join(' | ');
    console.log(`  Row ${r} (${nonEmpty.length} vals, ${maxCol} cols): ${preview}`);
  }

  // Identify what row 13 and 14 look like (broker config says headerStartRow=13, dataStartRow=14)
  console.log(`\n  ── Row 13 (expected header) ──`);
  if (rows[13]) {
    const h = rows[13];
    console.log(`  Cols: ${h.length}`);
    for (let c = 0; c < h.length; c++) {
      if (h[c] != null && h[c] !== '') {
        console.log(`    [${c}] = "${String(h[c]).substring(0, 60)}"`);
      }
    }
  } else {
    console.log('  Row 13 is null/missing!');
  }

  console.log(`\n  ── Row 14 (first data row) ──`);
  if (rows[14]) {
    const d = rows[14];
    console.log(`  Cols: ${d.length}`);
    for (let c = 0; c < Math.min(d.length, 40); c++) {
      if (d[c] != null && d[c] !== '') {
        console.log(`    [${c}] = ${JSON.stringify(d[c]).substring(0, 80)} (${typeof d[c]})`);
      }
    }
  }

  // Show last 5 rows to understand footer pattern
  console.log(`\n  ── Last 5 rows ──`);
  for (let r = Math.max(0, rows.length - 5); r < rows.length; r++) {
    const row = rows[r];
    if (!row) { console.log(`  Row ${r}: [null]`); continue; }
    const nonEmpty = row.filter(c => c != null && c !== '');
    const preview = row.slice(0, Math.min(10, row.length)).map((v, i) =>
      `[${i}]=${v === null ? 'null' : typeof v === 'string' ? `"${v.substring(0,25)}"` : v}`
    ).join(' | ');
    console.log(`  Row ${r} (${nonEmpty.length} vals): ${preview}`);
  }

  // Count data rows (rows after 14 that have >= 3 non-empty cells)
  let dataRowCount = 0;
  let footerStart = -1;
  for (let r = 14; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const nonEmpty = row.filter(c => c != null && c !== '');
    if (nonEmpty.length >= 3) {
      dataRowCount++;
    } else if (footerStart < 0 && nonEmpty.length < 3 && nonEmpty.length > 0) {
      footerStart = r;
    }
  }
  console.log(`\n  Data rows (>= 3 non-empty): ${dataRowCount}`);
  console.log(`  First footer-like row: ${footerStart}`);
}

// Now analyze ALL files to get aggregate stats
console.log(`\n${'═'.repeat(80)}`);
console.log('  AGGREGATE ANALYSIS — ALL FILES');
console.log('═'.repeat(80));

let totalDataRows = 0;
let allColCounts = [];
let headerMismatch = [];
let allHeaders = null;

for (const fname of files) {
  const wb = XLSX.readFile(path.join(FEDEX_DIR, fname), { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  
  const headerRow = rows[13];
  const dataRows = rows.slice(14).filter(r => {
    if (!r || r.length < 3) return false;
    const nonEmpty = r.filter(c => c != null && c !== '');
    return nonEmpty.length >= 3;
  });

  totalDataRows += dataRows.length;
  
  const colCount = headerRow ? headerRow.filter(c => c != null && c !== '').length : 0;
  allColCounts.push({ file: fname, cols: colCount, rows: dataRows.length });

  if (!allHeaders && headerRow) {
    allHeaders = headerRow;
  } else if (headerRow && allHeaders) {
    // Check if headers match
    const h1 = allHeaders.filter(c => c != null).join('|');
    const h2 = headerRow.filter(c => c != null).join('|');
    if (h1 !== h2) {
      headerMismatch.push(fname);
    }
  }
}

console.log(`\n  Total data rows across all files: ${totalDataRows}`);
console.log(`\n  Column counts per file:`);
allColCounts.forEach(x => console.log(`    ${x.file}: ${x.cols} cols, ${x.rows} data rows`));

if (headerMismatch.length > 0) {
  console.log(`\n  ⚠️  Header mismatches found in: ${headerMismatch.join(', ')}`);
} else {
  console.log(`\n  ✅ All files have consistent headers`);
}

// Full header dump from first file
console.log(`\n  ── FULL HEADER (from first file with headers) ──`);
if (allHeaders) {
  for (let c = 0; c < allHeaders.length; c++) {
    if (allHeaders[c] != null && allHeaders[c] !== '') {
      console.log(`    Col ${c}: "${allHeaders[c]}"`);
    }
  }
}

// Sample numeric values from a few columns
console.log(`\n  ── SAMPLE DATA VALUES (first file with data) ──`);
const sampleFile = files.find(f => f.startsWith('04-jan'));
if (sampleFile) {
  const wb = XLSX.readFile(path.join(FEDEX_DIR, sampleFile), { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const dataRows = rows.slice(14).filter(r => {
    if (!r || r.length < 3) return false;
    return r.filter(c => c != null && c !== '').length >= 3;
  });
  
  console.log(`\n  First 3 data rows (all columns):`);
  for (let r = 0; r < Math.min(3, dataRows.length); r++) {
    console.log(`\n  Data row ${r + 1}:`);
    const row = dataRows[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] != null && row[c] !== '') {
        console.log(`    [${c}] ${allHeaders && allHeaders[c] ? allHeaders[c] : '?'} = ${JSON.stringify(row[c])} (${typeof row[c]})`);
      }
    }
  }
}
