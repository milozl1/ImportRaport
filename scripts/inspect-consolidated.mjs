import XLSX from 'xlsx';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const path = join(ROOT, 'excel', 'DSV', 'DSV_Consolidated_2026-02-24.xlsx');

const wb = XLSX.readFile(path, { raw: true });
console.log('Sheets:', wb.SheetNames);

const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });

console.log('Total rows:', rows.length);
console.log('Header (cols 0-7):', rows[0]?.slice(0, 8));

// Find all-zero/empty rows
let zeroCount = 0;
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row) continue;
  
  // A row is "all zero or empty" if every cell is null, '', or 0
  const allZeroOrEmpty = row.every(c => c == null || c === '' || c === 0);
  if (allZeroOrEmpty) {
    zeroCount++;
    if (zeroCount <= 10) {
      console.log('ZERO row', i, ':', row.slice(0, 10));
    }
  }
}
console.log('\nTotal all-zero rows:', zeroCount);

// Show date column values from Luftfracht rows
console.log('\n--- Date examples (compressed dates) ---');
let shown = 0;
for (let i = 1; i < rows.length && shown < 20; i++) {
  const row = rows[i];
  if (!row) continue;
  const dateVal = row[4]; // Anlagedatum is usually col 4
  if (typeof dateVal === 'number' && dateVal > 1000000 && dateVal < 99999999) {
    console.log('Row', i, ': date=', dateVal, '| col2:', row[2], '| col3:', row[3]);
    shown++;
  }
}
