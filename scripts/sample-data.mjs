/**
 * Quick sample data extraction for FedEx and UPS.
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const BASE = path.resolve('excel');

function readExcel(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

// FedEx sample
console.log('═══ FEDEX SAMPLE DATA ═══');
const fRows = readExcel(path.join(BASE, 'FEDEX', '01-feb-2025.xlsx'));
const fData = fRows[14]; // First data row
const fH = fRows[13]; // Header
[7,21,22,23,24,27,31,32,53,56,57,58,61,64,65,66,67,68,70,85,86,91].forEach(i => {
  console.log(`  [${i}] ${fH[i]}: ${JSON.stringify(fData[i])}`);
});

// UPS sample
console.log('\n═══ UPS SAMPLE DATA ═══');
const uRows = readExcel(path.join(BASE, 'UPS', 'Hella_DE2393166_January_2025.xlsx'));
const uData = uRows[1]; // First data row
const uH = uRows[0]; // Header
[0,5,8,9,10,11,15,16,17,20,23,24,28,29,30,31,32,38,39,40,41,42,44,45,47].forEach(i => {
  console.log(`  [${i}] ${uH[i]}: ${JSON.stringify(uData[i])}`);
});

// Count totals for all brokers
console.log('\n═══ TOTAL ROW COUNTS ═══');
const dhlFiles = fs.readdirSync(path.join(BASE, 'DHL')).filter(f => f.endsWith('.xlsx'));
let dhlTotal = 0;
for (const f of dhlFiles) {
  const rows = readExcel(path.join(BASE, 'DHL', f));
  const data = rows.slice(2).filter(r => r && r.filter(c => c != null && c !== '').length >= 3);
  dhlTotal += data.length;
}
console.log(`  DHL: ${dhlTotal} rows across ${dhlFiles.length} files`);

const fedexFiles = fs.readdirSync(path.join(BASE, 'FEDEX')).filter(f => f.endsWith('.xlsx'));
let fedexTotal = 0;
for (const f of fedexFiles) {
  const rows = readExcel(path.join(BASE, 'FEDEX', f));
  const data = rows.slice(14).filter(r => r && r.filter(c => c != null && c !== '').length >= 3);
  fedexTotal += data.length;
}
console.log(`  FedEx: ${fedexTotal} rows across ${fedexFiles.length} files`);

const upsFiles = fs.readdirSync(path.join(BASE, 'UPS')).filter(f => f.endsWith('.xlsx'));
let upsTotal = 0;
for (const f of upsFiles) {
  const rows = readExcel(path.join(BASE, 'UPS', f));
  const data = rows.slice(1).filter(r => r && r.filter(c => c != null && c !== '').length >= 2);
  upsTotal += data.length;
}
console.log(`  UPS: ${upsTotal} rows across ${upsFiles.length} files`);

import Papa from 'papaparse';
const dsvFiles = fs.readdirSync(path.join(BASE, 'DSV')).filter(f => (f.endsWith('.csv') || f.endsWith('.xlsx')) && !f.includes('Consolidated'));
let dsvTotal = 0;
for (const f of dsvFiles) {
  let rows;
  if (f.endsWith('.csv')) {
    const text = fs.readFileSync(path.join(BASE, 'DSV', f), 'utf-8').replace(/^\uFEFF/, '');
    rows = Papa.parse(text, { delimiter: ';' }).data;
  } else {
    rows = readExcel(path.join(BASE, 'DSV', f));
  }
  const data = rows.slice(1).filter(r => r && r.filter(c => c != null && c !== '').length >= 2);
  dsvTotal += data.length;
}
console.log(`  DSV: ${dsvTotal} rows across ${dsvFiles.length} files`);
