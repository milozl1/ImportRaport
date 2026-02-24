/**
 * Deep investigation of FedEx footer patterns and data integrity
 */
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const FEDEX_DIR = 'excel/FEDEX';

// Check footer patterns in the big files
const filesToCheck = [
  'Brokerage DE Monthly Adhoc optimized DE2393166_94_3352218091013970251.xlsx',
  'Sept-Dec.xlsx',
  '04-jan-2025.xlsx',
  '01-feb-2025.xlsx',
];

for (const fname of filesToCheck) {
  const fpath = path.join(FEDEX_DIR, fname);
  if (!fs.existsSync(fpath)) continue;
  
  const wb = XLSX.readFile(fpath, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${fname} (${rows.length} rows)`);
  console.log('═'.repeat(70));
  
  // Check footer area — last 10 rows
  console.log('\n  Last 10 rows:');
  for (let r = Math.max(14, rows.length - 10); r < rows.length; r++) {
    const row = rows[r];
    if (!row) { console.log(`  Row ${r}: [null/empty]`); continue; }
    const nonEmpty = row.filter(c => c != null && c !== '');
    const preview = [];
    for (let c = 0; c < row.length; c++) {
      if (row[c] != null && row[c] !== '') {
        preview.push(`[${c}]=${JSON.stringify(String(row[c]).substring(0, 40))}`);
      }
    }
    console.log(`  Row ${r} (${nonEmpty.length} vals): ${preview.join(' | ')}`);
  }
  
  // Check if the isFooterRow function from broker config would work correctly
  const isFooterRow = (row) => {
    if (!row || row.length < 3) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 3;
  };
  
  const dataRows = rows.slice(14).filter(r => !isFooterRow(r));
  const footerRows = rows.slice(14).filter(r => isFooterRow(r));
  
  console.log(`\n  Data rows (passing isFooterRow): ${dataRows.length}`);
  console.log(`  Footer/blank rows (filtered out): ${footerRows.length}`);
  
  // Check for rows with exactly 2 non-empty cells (edge case for footer detection)
  const edgeCases = rows.slice(14).filter(r => {
    if (!r) return false;
    const ne = r.filter(c => c != null && c !== '');
    return ne.length >= 1 && ne.length <= 5;
  });
  if (edgeCases.length > 0) {
    console.log(`\n  Rows with 1-5 non-empty cells (potential footer confusion):`);
    edgeCases.forEach(r => {
      const rowIdx = rows.indexOf(r);
      const ne = r.filter(c => c != null && c !== '');
      const preview = [];
      for (let c = 0; c < r.length; c++) {
        if (r[c] != null && r[c] !== '') {
          preview.push(`[${c}]=${JSON.stringify(String(r[c]).substring(0, 50))}`);
        }
      }
      console.log(`    Row ${rowIdx} (${ne.length} vals): ${preview.join(' | ')}`);
    });
  }
}

// Check numeric format patterns across all FedEx data
console.log(`\n${'═'.repeat(70)}`);
console.log('  NUMERIC FORMAT ANALYSIS');
console.log('═'.repeat(70));

const numericCols = [22, 24, 27, 44, 49, 53, 60, 61, 65, 66, 67, 68, 70, 73, 85, 86, 88, 89, 90, 91];
const colNames = {
  22: 'RECHNUNGSPREIS', 24: 'KURS', 27: 'GESAMTROHMASSE',
  65: 'EIGENMASSE', 66: 'RECHNUNGSPREIS2', 67: 'ZOLLWERT',
  68: 'EUSTWERT', 70: 'ARTIKELPREIS', 85: 'ZOLLSATZ',
  86: 'FRACHTKOSTEN', 88: 'PROZENTSATZ', 91: 'ZOLL'
};

let strWithComma = 0;
let strWithDot = 0;
let jsNumber = 0;
let strNumeric = 0;
let totalChecked = 0;

const allFiles = fs.readdirSync(FEDEX_DIR)
  .filter(f => f.endsWith('.xlsx') && !f.startsWith('.'));

for (const fname of allFiles) {
  const wb = XLSX.readFile(path.join(FEDEX_DIR, fname), { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  
  const isFooterRow = (row) => {
    if (!row || row.length < 3) return true;
    return row.filter(c => c != null && c !== '').length < 3;
  };
  
  const dataRows = rows.slice(14).filter(r => !isFooterRow(r));
  
  for (const row of dataRows) {
    for (const col of numericCols) {
      const v = row[col];
      if (v == null || v === '') continue;
      totalChecked++;
      if (typeof v === 'number') jsNumber++;
      else if (typeof v === 'string') {
        strNumeric++;
        if (v.includes(',')) strWithComma++;
        if (v.includes('.')) strWithDot++;
      }
    }
  }
}

console.log(`\n  Total numeric cells checked: ${totalChecked}`);
console.log(`  JS Number type: ${jsNumber}`);
console.log(`  String type: ${strNumeric}`);
console.log(`    - with comma: ${strWithComma}`);
console.log(`    - with dot: ${strWithDot}`);

// Check DATE column (col 7) format
console.log(`\n  DATE column (col 7) format sample:`);
const sampleWb = XLSX.readFile(path.join(FEDEX_DIR, '04-jan-2025.xlsx'), { raw: true, cellDates: false });
const sampleWs = sampleWb.Sheets[sampleWb.SheetNames[0]];
const sampleRows = XLSX.utils.sheet_to_json(sampleWs, { header: 1, defval: null, blankrows: true, raw: true });
for (let r = 14; r < Math.min(20, sampleRows.length); r++) {
  const v = sampleRows[r]?.[7];
  if (v != null) console.log(`    Row ${r}: ${JSON.stringify(v)} (${typeof v})`);
}
