import XLSX from 'xlsx';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const path = join(ROOT, 'excel', 'DSV', 'Zollreport Luftfracht 07.05. - 30.06.2025.xlsx');
const wb = XLSX.readFile(path, { raw: true });

// Check the data sheet
const dataSheet = wb.SheetNames.find(n => /^(importzoll|hella|import report)/i.test(n)) || wb.SheetNames[0];
const ws = wb.Sheets[dataSheet];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });

console.log('Sheet:', dataSheet, '| Rows:', rows.length, '| Cols:', rows[0]?.length);
console.log('Header:', JSON.stringify(rows[0]?.slice(0, 10)));

// Show ALL rows with their detailed content
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (!row) { console.log(`Row ${i}: null`); continue; }
  
  const nonNull = row.filter(c => c != null && c !== '').length;
  const zeroOnly = row.filter(c => c === 0).length;
  const totalCells = row.length;
  
  console.log(`Row ${i}: len=${totalCells}, nonNull=${nonNull}, zeros=${zeroOnly}, first10:`, JSON.stringify(row.slice(0, 10)));
}

// Check Sheet1 also
console.log('\n=== Sheet1 (if exists) ===');
if (wb.SheetNames.includes('Sheet1')) {
  const ws2 = wb.Sheets['Sheet1'];
  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null, blankrows: true, raw: true });
  console.log('Sheet1 rows:', rows2.length);
  for (let i = 0; i < rows2.length; i++) {
    const row = rows2[i];
    if (!row) { console.log(`Row ${i}: null`); continue; }
    const nonNull = row.filter(c => c != null && c !== '').length;
    console.log(`Row ${i}: len=${row.length}, nonNull=${nonNull}, first5:`, JSON.stringify(row.slice(0, 5)));
  }
}
