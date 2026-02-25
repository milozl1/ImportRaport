import XLSX from 'xlsx';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;

// Check the Luftfracht file in detail
const path = join(ROOT, 'excel', 'DSV', 'Zollreport Luftfracht 07.05. - 30.06.2025.xlsx');
const wb = XLSX.readFile(path, { raw: true });
console.log('Sheets:', wb.SheetNames);

const dataSheet = wb.SheetNames.find(n => /^(importzoll|hella|import report)/i.test(n)) || wb.SheetNames[0];
console.log('Using:', dataSheet);

const ws = wb.Sheets[dataSheet];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
console.log('Rows:', rows.length, '| Cols:', rows[0]?.length);

// Check for rows where every cell is 0 or empty
console.log('\n=== Checking for all-zero / mostly-zero rows ===');
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (!row) { console.log('Row', i, ': null'); continue; }
  
  const nonEmpty = row.filter(c => c != null && c !== '' && c !== 0);
  
  // Check if row has ONLY zeros (not null/empty but specifically 0)
  const hasOnlyZeros = row.some(c => c === 0) && row.every(c => c == null || c === '' || c === 0);
  
  if (nonEmpty.length <= 3 || hasOnlyZeros) {
    console.log(`Row ${i}: nonEmpty=${nonEmpty.length}, values:`, nonEmpty.slice(0, 5), '| first8:', row.slice(0, 8));
  }
}

// Now check the "Sheet1" for zero rows
console.log('\n=== Sheet1 ===');
const ws2 = wb.Sheets['Sheet1'];
if (ws2) {
  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null, blankrows: true, raw: true });
  console.log('Rows:', rows2.length);
  for (let i = 0; i < Math.min(20, rows2.length); i++) {
    const row = rows2[i];
    if (!row) { console.log('Row', i, ': null'); continue; }
    const nonEmpty = row.filter(c => c != null && c !== '' && c !== 0);
    console.log(`Row ${i}: nonEmpty=${nonEmpty.length}`, nonEmpty.length <= 5 ? nonEmpty : nonEmpty.slice(0, 5));
  }
}

// Check the consolidated output to see if zeros appear there
console.log('\n=== Check the consolidated output ===');
const cpath = join(ROOT, 'excel', 'DSV', 'DSV_Consolidated_2026-02-24.xlsx');
const cwb = XLSX.readFile(cpath, { raw: true });
const cws = cwb.Sheets[cwb.SheetNames[0]];
const crows = XLSX.utils.sheet_to_json(cws, { header: 1, defval: null, blankrows: true, raw: true });

// Find rows that have 0 in many columns
let problematicCount = 0;
for (let i = 1; i < crows.length; i++) {
  const row = crows[i];
  if (!row) continue;
  
  const zeroCount = row.filter(c => c === 0).length;
  const nonEmpty = row.filter(c => c != null && c !== '' && c !== 0);
  
  // Flag rows with many zeros and few real values
  if (zeroCount > 50 && nonEmpty.length < 10) {
    problematicCount++;
    if (problematicCount <= 5) {
      console.log(`Row ${i}: zeros=${zeroCount}, nonEmpty=${nonEmpty.length}, vals:`, nonEmpty.slice(0, 5));
    }
  }
}
console.log('Rows with >50 zeros and <10 real values:', problematicCount);

// Check header row for how many Luftfracht compressed dates exist in final
let compressedDateCount = 0;
for (let i = 1; i < crows.length; i++) {
  const v = crows[i]?.[4];
  if (typeof v === 'number' && v > 1000000 && v < 99999999) compressedDateCount++;
}
console.log('Rows with compressed dates in consolidated:', compressedDateCount);
