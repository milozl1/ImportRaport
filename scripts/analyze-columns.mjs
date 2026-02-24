/**
 * Deep column analysis for all brokers.
 * Extracts headers and sample data to understand what analytics are possible.
 */
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

const BASE = path.resolve('excel');

function readExcel(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

function readCSV(filePath, delimiter = ',') {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const result = Papa.parse(text, { delimiter, skipEmptyLines: false });
  return result.data;
}

function analyzeFile(rows, headerStart, headerRows, dataStart, isFooterFn) {
  const headers = rows.slice(headerStart, headerStart + headerRows);
  const rawData = rows.slice(dataStart);
  const data = rawData.filter(r => {
    if (!r || r.length < 2) return false;
    const nonEmpty = r.filter(c => c != null && c !== '');
    return nonEmpty.length >= 2;
  });
  return { headers, data };
}

// ═════════════════════════════════════════
// DHL Analysis
// ═════════════════════════════════════════
console.log('\n═══ DHL ANALYSIS ═══');
const dhlFiles = fs.readdirSync(path.join(BASE, 'DHL')).filter(f => f.endsWith('.xlsx'));
let dhlHeaders = null;
let dhlAllData = [];

for (const f of dhlFiles) {
  const rows = readExcel(path.join(BASE, 'DHL', f));
  const { headers, data } = analyzeFile(rows, 0, 2, 2);
  if (!dhlHeaders) dhlHeaders = headers;
  console.log(`  ${f}: ${data.length} rows, ${(headers[0]||[]).length} cols`);
  dhlAllData.push(...data);
}

// Print key headers
console.log(`\nDHL Total: ${dhlAllData.length} rows`);
console.log('\nDHL Headers (Row 1 - first 50):');
(dhlHeaders[0] || []).slice(0, 50).forEach((h, i) => {
  if (h) console.log(`  [${i}] ${h}`);
});
console.log('DHL Headers (Row 1 - cols 60-80):');
(dhlHeaders[0] || []).slice(60, 80).forEach((h, i) => {
  if (h) console.log(`  [${i+60}] ${h}`);
});
console.log('DHL Headers (Row 1 - cols 109-130):');
(dhlHeaders[0] || []).slice(109, 130).forEach((h, i) => {
  if (h) console.log(`  [${i+109}] ${h}`);
});

// Sample values for key columns
const dhlKeyCol = [0, 1, 20, 24, 26, 30, 31, 33, 34, 67, 71, 75, 76, 109, 110, 111, 112, 113, 117, 118, 119, 123, 127];
console.log('\nDHL Sample (first 3 rows, key columns):');
for (let r = 0; r < Math.min(3, dhlAllData.length); r++) {
  console.log(`  Row ${r}:`);
  for (const c of dhlKeyCol) {
    const v = dhlAllData[r][c];
    if (v != null && v !== '') console.log(`    [${c}] ${v}`);
  }
}

// ═════════════════════════════════════════
// FedEx Analysis
// ═════════════════════════════════════════
console.log('\n\n═══ FEDEX ANALYSIS ═══');
const fedexFiles = fs.readdirSync(path.join(BASE, 'FEDEX')).filter(f => f.endsWith('.xlsx'));
let fedexHeaders = null;
let fedexAllData = [];

for (const f of fedexFiles.slice(0, 3)) {
  const rows = readExcel(path.join(BASE, 'FEDEX', f));
  const { headers, data } = analyzeFile(rows, 13, 1, 14);
  if (!fedexHeaders) fedexHeaders = headers;
  console.log(`  ${f}: ${data.length} rows, ${(headers[0]||[]).length} cols`);
  fedexAllData.push(...data);
}

console.log(`\nFedEx Total (sample): ${fedexAllData.length} rows`);
console.log('\nFedEx Headers:');
(fedexHeaders[0] || []).forEach((h, i) => {
  if (h) console.log(`  [${i}] ${h}`);
});

// ═════════════════════════════════════════
// UPS Analysis
// ═════════════════════════════════════════
console.log('\n\n═══ UPS ANALYSIS ═══');
const upsFiles = fs.readdirSync(path.join(BASE, 'UPS')).filter(f => f.endsWith('.xlsx'));
let upsHeaders = null;
let upsAllData = [];

for (const f of upsFiles.slice(0, 3)) {
  const rows = readExcel(path.join(BASE, 'UPS', f));
  const { headers, data } = analyzeFile(rows, 0, 1, 1);
  if (!upsHeaders) upsHeaders = headers;
  console.log(`  ${f}: ${data.length} rows, ${(headers[0]||[]).length} cols`);
  upsAllData.push(...data);
}

console.log(`\nUPS Total (sample): ${upsAllData.length} rows`);
console.log('\nUPS Headers:');
(upsHeaders[0] || []).forEach((h, i) => {
  if (h) console.log(`  [${i}] ${h}`);
});

// ═════════════════════════════════════════
// DSV Analysis  
// ═════════════════════════════════════════
console.log('\n\n═══ DSV ANALYSIS ═══');
const dsvFiles = fs.readdirSync(path.join(BASE, 'DSV')).filter(f => f.endsWith('.csv') || f.endsWith('.xlsx'));
const dsvSource = dsvFiles.filter(f => !f.includes('Consolidated'));
let dsvHeaders = null;
let dsvAllData = [];

for (const f of dsvSource.slice(0, 4)) {
  let rows;
  if (f.endsWith('.csv')) {
    rows = readCSV(path.join(BASE, 'DSV', f), ';');
  } else {
    rows = readExcel(path.join(BASE, 'DSV', f));
  }
  const { headers, data } = analyzeFile(rows, 0, 1, 1);
  if (!dsvHeaders) dsvHeaders = headers;
  console.log(`  ${f}: ${data.length} rows, ${(headers[0]||[]).length} cols`);
  dsvAllData.push(...data);
}

console.log(`\nDSV Total (sample): ${dsvAllData.length} rows`);
console.log('\nDSV Headers (first file):');
(dsvHeaders[0] || []).forEach((h, i) => {
  if (h) console.log(`  [${i}] ${h}`);
});
