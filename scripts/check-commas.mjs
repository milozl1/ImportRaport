import XLSX from 'xlsx';
import { extractParts } from '../src/js/engine.js';
import { BROKERS } from '../src/js/brokers.js';
import { validateAndFix } from '../src/js/validator.js';

const broker = BROKERS.find(b => b.id === 'DHL');
const targetCols = [33, 34, 67, 71, 75, 76, 117];
const colNames = ['AH(33)', 'AI(34)', 'BP(67)', 'BT(71)', 'BX(75)', 'BY(76)', 'DN(117)'];
const files = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

let commaValues = [];
let dotCommaValues = [];

for (const month of files) {
  const wb = XLSX.readFile('excel/' + month + ' 2025.xlsx', { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const { data } = extractParts(rows, broker);
  validateAndFix(data, broker);

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let ci = 0; ci < targetCols.length; ci++) {
      const c = targetCols[ci];
      const v = row[c];
      if (v == null) continue;
      const s = String(v);
      if (s.includes(',')) {
        commaValues.push({ month, row: r + 1, col: colNames[ci], value: s, type: typeof v });
      }
      // Also check for values that have BOTH . and , 
      if (s.includes('.') && s.includes(',')) {
        dotCommaValues.push({ month, row: r + 1, col: colNames[ci], value: s, type: typeof v });
      }
    }
  }
}

console.log('=== Values with commas AFTER validation in target columns ===');
console.log('Total with comma:', commaValues.length);
commaValues.slice(0, 40).forEach(cv =>
  console.log(`  ${cv.month} row ${cv.row} ${cv.col}: ${JSON.stringify(cv.value)} (type: ${cv.type})`)
);
if (commaValues.length > 40) console.log(`  ... and ${commaValues.length - 40} more`);

console.log('\n=== Values with BOTH dot AND comma ===');
console.log('Total:', dotCommaValues.length);
dotCommaValues.slice(0, 20).forEach(cv =>
  console.log(`  ${cv.month} row ${cv.row} ${cv.col}: ${JSON.stringify(cv.value)} (type: ${cv.type})`)
);

// Also check ALL columns for any remaining commas in numeric-looking values
console.log('\n=== Scanning ALL columns for remaining comma-decimal values ===');
let allCommaNumeric = [];
for (const month of files) {
  const wb = XLSX.readFile('excel/' + month + ' 2025.xlsx', { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const { data } = extractParts(rows, broker);
  validateAndFix(data, broker);

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v == null) continue;
      const s = String(v);
      // Find values that look like numbers but still have commas
      if (/^\-?\d+,\d+$/.test(s.trim()) || /^\-?\d{1,3}(\.\d{3})+,\d+$/.test(s.trim())) {
        allCommaNumeric.push({ month, row: r + 1, col: c, value: s, type: typeof v });
      }
    }
  }
}
console.log('Total numeric values with commas remaining:', allCommaNumeric.length);
allCommaNumeric.slice(0, 20).forEach(cv =>
  console.log(`  ${cv.month} row ${cv.row} col ${cv.col}: ${JSON.stringify(cv.value)} (type: ${cv.type})`)
);

// Check for raw number type values (typeof === 'number') in target columns
console.log('\n=== Check typeof for sample values in target columns (BEFORE validation) ===');
const wb = XLSX.readFile('excel/November 2025.xlsx', { raw: true, cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
const { data } = extractParts(rows, broker);

for (let r = 0; r < Math.min(5, data.length); r++) {
  const row = data[r];
  if (!row) continue;
  console.log(`  Row ${r + 1}:`);
  for (let ci = 0; ci < targetCols.length; ci++) {
    const c = targetCols[ci];
    const v = row[c];
    console.log(`    ${colNames[ci]}: ${JSON.stringify(v)} (type: ${typeof v})`);
  }
}
