/**
 * Find ALL rows across all months where col 33 (AH, freight) is empty or non-numeric
 * and find any row where col 34 has 334.24
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
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

const excelDir = resolve('excel');
const files = readdirSync(excelDir).filter(f => f.endsWith('.xlsx')).sort();

console.log('=== SEARCHING FOR ROWS WITH EMPTY/NON-NUMERIC COL 33 (AH) AFTER VALIDATION ===\n');

for (const file of files) {
  const buf = readFileSync(join(excelDir, file));
  const wb = XLSX.read(buf, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  
  const dataRows = allRows.slice(2).filter(row => {
    if (!row || row.length < 3) return false;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length >= 3;
  });

  // Deep copy
  const dataCopy = dataRows.map(r => [...r]);
  validateAndFix(dataCopy, DHL_BROKER);

  for (let i = 0; i < dataCopy.length; i++) {
    const row = dataCopy[i];
    const col33 = row[33];
    const isEmpty33 = col33 == null || col33 === '';
    const isNonNumeric33 = !isEmpty33 && !/^\d/.test(String(col33));
    
    if (isEmpty33 || isNonNumeric33) {
      // Check if this row has real data (not a blank row)
      const col32 = row[32];
      if (col32 && String(col32).length > 2) {
        console.log(`${file} row ${i + 1}:`);
        console.log(`  [32] AG: ${JSON.stringify(col32)}`);
        console.log(`  [33] AH: ${JSON.stringify(col33)} ← EMPTY/NON-NUMERIC`);
        console.log(`  [34] AI: ${JSON.stringify(row[34])}`);
        console.log(`  [35] AJ: ${JSON.stringify(row[35])}`);
        console.log('');
      }
    }
  }
}

// Now let's also check: does any row have the value 334.24 somewhere near col 33-35?
console.log('\n=== SEARCHING FOR VALUE 334.24 ===\n');
for (const file of files) {
  const buf = readFileSync(join(excelDir, file));
  const wb = XLSX.read(buf, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  
  const dataRows = allRows.slice(2).filter(row => {
    if (!row || row.length < 3) return false;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length >= 3;
  });

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    for (let c = 30; c <= 40; c++) {
      if (String(row[c]).includes('334.24') || String(row[c]).includes('334,24')) {
        console.log(`${file} row ${i + 1} col ${c}: ${JSON.stringify(row[c])} [AG val: ${JSON.stringify(row[32])}]`);
      }
    }
  }
}

// Also check the ORIGINAL (pre-validation) data for any row that has ABASOLO
console.log('\n=== SEARCHING FOR ABASOLO IN ALL FILES ===\n');
for (const file of files) {
  const buf = readFileSync(join(excelDir, file));
  const wb = XLSX.read(buf, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  
  const dataRows = allRows.slice(2).filter(row => {
    if (!row || row.length < 3) return false;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length >= 3;
  });

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    for (let c = 0; c < 50; c++) {
      if (row[c] && String(row[c]).includes('ABASOLO')) {
        console.log(`${file} row ${i + 1} col ${c}: ${JSON.stringify(row[c])}`);
        console.log(`  Cols 30-38:`);
        for (let cc = 30; cc <= 38; cc++) {
          console.log(`    [${cc}]: ${JSON.stringify(row[cc])}`);
        }
        break;
      }
    }
  }
}
