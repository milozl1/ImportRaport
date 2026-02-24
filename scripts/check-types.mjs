import XLSX from 'xlsx';
import { extractParts } from '../src/js/engine.js';
import { BROKERS } from '../src/js/brokers.js';
import { validateAndFix } from '../src/js/validator.js';

const broker = BROKERS.find(b => b.id === 'DHL');
const targetCols = [33, 34, 67, 71, 75, 76, 117];
const colNames = ['AH(33)', 'AI(34)', 'BP(67)', 'BT(71)', 'BX(75)', 'BY(76)', 'DN(117)'];

// Check November file - raw values BEFORE validation
const wb = XLSX.readFile('excel/November 2025.xlsx', { raw: true, cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
const { data } = extractParts(rows, broker);

console.log('=== BEFORE validation - raw types ===');
for (let r = 0; r < Math.min(10, data.length); r++) {
  const row = data[r];
  if (!row) continue;
  const vals = targetCols.map((c, ci) => {
    const v = row[c];
    return `${colNames[ci]}=${JSON.stringify(v)}(${typeof v})`;
  });
  console.log(`Row ${r + 1}: ${vals.join(' | ')}`);
}

// Now validate
validateAndFix(data, broker);

console.log('\n=== AFTER validation - types ===');
for (let r = 0; r < Math.min(10, data.length); r++) {
  const row = data[r];
  if (!row) continue;
  const vals = targetCols.map((c, ci) => {
    const v = row[c];
    return `${colNames[ci]}=${JSON.stringify(v)}(${typeof v})`;
  });
  console.log(`Row ${r + 1}: ${vals.join(' | ')}`);
}

// Count how many values in target cols are typeof 'number' vs 'string'
const wb2 = XLSX.readFile('excel/November 2025.xlsx', { raw: true, cellDates: false });
const ws2 = wb2.Sheets[wb2.SheetNames[0]];
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null });
const { data: data2 } = extractParts(rows2, broker);

let numCount = 0, strCount = 0, strWithComma = 0, strWithDot = 0;
for (let r = 0; r < data2.length; r++) {
  const row = data2[r];
  if (!row) continue;
  for (const c of targetCols) {
    const v = row[c];
    if (v == null) continue;
    if (typeof v === 'number') numCount++;
    else if (typeof v === 'string') {
      strCount++;
      if (v.includes(',')) strWithComma++;
      if (v.includes('.')) strWithDot++;
    }
  }
}
console.log('\n=== November raw value type distribution in target cols (BEFORE validation) ===');
console.log(`  number: ${numCount}`);
console.log(`  string: ${strCount} (with comma: ${strWithComma}, with dot: ${strWithDot})`);

// Check what the Excel output would look like
// Simulate the download: create AoA and write to sheet
console.log('\n=== Simulating Excel write ===');
const testRow = [110.19, '110,19', '110.19', 1234.56, '1.234,56'];
console.log('Input values:', testRow.map(v => `${JSON.stringify(v)}(${typeof v})`).join(', '));

const testWs = XLSX.utils.aoa_to_sheet([['A', 'B', 'C', 'D', 'E'], testRow]);
console.log('Cell A2:', JSON.stringify(testWs['A2']));
console.log('Cell B2:', JSON.stringify(testWs['B2']));
console.log('Cell C2:', JSON.stringify(testWs['C2']));
console.log('Cell D2:', JSON.stringify(testWs['D2']));
console.log('Cell E2:', JSON.stringify(testWs['E2']));
