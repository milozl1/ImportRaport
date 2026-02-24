/**
 * Deep analysis: Compare consolidated XLSX with source CSVs
 * to find column misalignment issues.
 */
import XLSX from 'xlsx';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

const DSV_DIR = 'excel/DSV';

// ─── 1. Read the consolidated XLSX ───
console.log('═══════════════════════════════════════════════════════');
console.log('  CONSOLIDATED XLSX ANALYSIS');
console.log('═══════════════════════════════════════════════════════\n');

const consBuf = fs.readFileSync(path.join(DSV_DIR, 'DSV_Consolidated_2026-02-24 (1).xlsx'));
const consWb = XLSX.read(consBuf, { type: 'buffer', raw: true, cellDates: false });
console.log('Sheets:', consWb.SheetNames);
const consWs = consWb.Sheets[consWb.SheetNames[0]];
const consRows = XLSX.utils.sheet_to_json(consWs, { header: 1, defval: null, blankrows: true, raw: true });

console.log('Total rows:', consRows.length);
console.log('Row 0 (header) length:', consRows[0]?.length);
console.log('Row 1 (first data) length:', consRows[1]?.length);

// Show header row
console.log('\n─── CONSOLIDATED HEADER ROW ───');
const consHeader = consRows[0] || [];
for (let c = 0; c < consHeader.length; c++) {
  if (consHeader[c] != null && String(consHeader[c]).trim() !== '') {
    console.log(`  Col ${String(c).padStart(3)}: ${JSON.stringify(consHeader[c])}`);
  }
}

// Show first 3 data rows, all non-null cells
console.log('\n─── FIRST 3 DATA ROWS (non-null cells) ───');
for (let r = 1; r <= 3 && r < consRows.length; r++) {
  console.log(`\nRow ${r}:`);
  const row = consRows[r];
  if (!row) { console.log('  (null row)'); continue; }
  for (let c = 0; c < row.length; c++) {
    if (row[c] != null && row[c] !== '') {
      console.log(`  Col ${String(c).padStart(3)}: ${JSON.stringify(row[c]).substring(0, 80)}`);
    }
  }
}

// ─── 2. Read a source CSV for comparison ───
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  SOURCE CSV COMPARISON');
console.log('═══════════════════════════════════════════════════════\n');

// Pick the first CSV file
const csvFiles = fs.readdirSync(DSV_DIR).filter(f => f.endsWith('.csv')).sort();
console.log('CSV files available:', csvFiles);

const firstCsv = csvFiles[0];
console.log(`\nAnalyzing: ${firstCsv}`);

const csvContent = fs.readFileSync(path.join(DSV_DIR, firstCsv), 'utf-8');
const csvResult = Papa.parse(csvContent, { delimiter: ';', skipEmptyLines: false });
let csvRows = csvResult.data;

// Strip BOM
if (csvRows[0]?.[0]) {
  csvRows[0][0] = csvRows[0][0].replace(/^\uFEFF/, '');
}

console.log('CSV total rows:', csvRows.length);
console.log('CSV header (row 0) length:', csvRows[0]?.length);

// Show CSV header
console.log('\n─── CSV HEADER ROW ───');
const csvHeader = csvRows[0] || [];
for (let c = 0; c < csvHeader.length; c++) {
  if (csvHeader[c] != null && String(csvHeader[c]).trim() !== '') {
    console.log(`  Col ${String(c).padStart(3)}: ${JSON.stringify(csvHeader[c])}`);
  }
}

// Show first 3 CSV data rows
console.log('\n─── FIRST 3 CSV DATA ROWS (non-null cells) ───');
for (let r = 1; r <= 3 && r < csvRows.length; r++) {
  console.log(`\nCSV Row ${r}:`);
  const row = csvRows[r];
  if (!row) { console.log('  (null row)'); continue; }
  for (let c = 0; c < row.length; c++) {
    if (row[c] != null && row[c] !== '') {
      console.log(`  Col ${String(c).padStart(3)}: ${JSON.stringify(row[c]).substring(0, 80)}`);
    }
  }
}

// ─── 3. Side-by-side header comparison ───
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  HEADER COMPARISON: CSV vs Consolidated');
console.log('═══════════════════════════════════════════════════════\n');

const maxCols = Math.max(csvHeader.length, consHeader.length);
let mismatches = 0;
for (let c = 0; c < maxCols; c++) {
  const csvH = csvHeader[c] != null ? String(csvHeader[c]).trim() : '(empty)';
  const conH = consHeader[c] != null ? String(consHeader[c]).trim() : '(empty)';
  const match = csvH === conH ? '✅' : '❌';
  if (csvH !== conH) {
    console.log(`  Col ${String(c).padStart(3)}: ${match}  CSV: ${JSON.stringify(csvH).padEnd(45)} CONS: ${JSON.stringify(conH)}`);
    mismatches++;
  }
}
console.log(`\nTotal header columns: CSV=${csvHeader.length}, Consolidated=${consHeader.length}`);
console.log(`Header mismatches: ${mismatches}`);

// ─── 4. Data comparison: first few rows ───
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  DATA COMPARISON: CSV Row 1 vs Consolidated Row 1');
console.log('═══════════════════════════════════════════════════════\n');

const csvDataRow = csvRows[1] || [];
const consDataRow = consRows[1] || [];

for (let c = 0; c < Math.max(csvDataRow.length, consDataRow.length); c++) {
  const csvV = csvDataRow[c] != null ? csvDataRow[c] : '(null)';
  const conV = consDataRow[c] != null ? consDataRow[c] : '(null)';
  const csvS = String(csvV).substring(0, 40);
  const conS = String(conV).substring(0, 40);
  
  // Only show if at least one has data
  if (csvV !== '(null)' || conV !== '(null)') {
    if (csvV === '' && conV === '(null)') continue; // Both empty
    if (csvV === '(null)' && conV === '(null)') continue; // Both null
    const hdr = csvHeader[c] ? String(csvHeader[c]).substring(0, 25) : `(col ${c})`;
    const match = csvS === conS ? '  ' : '❌';
    console.log(`  Col ${String(c).padStart(3)} [${hdr.padEnd(25)}]: ${match}  CSV: ${JSON.stringify(csvS).padEnd(42)} CONS: ${JSON.stringify(conS)}`);
  }
}

// ─── 5. Check for multiple CSV files with different column counts ───
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  ALL CSV FILE COLUMN COUNTS');
console.log('═══════════════════════════════════════════════════════\n');

for (const f of csvFiles) {
  const c = fs.readFileSync(path.join(DSV_DIR, f), 'utf-8');
  const res = Papa.parse(c, { delimiter: ';', skipEmptyLines: false });
  let rows = res.data;
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  
  const headerLen = rows[0]?.length || 0;
  const dataRows = rows.slice(1).filter(r => r && r.filter(x => x != null && x !== '').length >= 2);
  
  // Check if data rows have different lengths than header
  const dataLens = new Set(dataRows.map(r => r.length));
  
  console.log(`${f.padEnd(40)} header: ${headerLen} cols, data rows: ${dataRows.length}, data col counts: ${[...dataLens].join(',')}`);
  
  // Show first few headers for comparison
  const h5 = rows[0].slice(0, 5).map(h => JSON.stringify(h)).join(', ');
  console.log(`  First 5 headers: ${h5}`);
}
