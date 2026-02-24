import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const dir = 'excel/FEDEX';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));
const numCols = [22,24,27,44,49,53,60,61,65,66,67,68,70,73,85,86,88,89,90,91];
let stringNums = [];

for (const f of files) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { raw: true, cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const data = rows.slice(14);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmpty.length < 3) continue;
    for (const c of numCols) {
      const v = row[c];
      if (v != null && typeof v === 'string' && String(v).trim() !== '') {
        stringNums.push({ file: f, rowIdx: 14+i, col: c, value: v });
      }
    }
  }
}

console.log('Total string values in numeric cols:', stringNums.length);
console.log('\nBy column:');
const byCols = {};
for (const s of stringNums) { byCols[s.col] = (byCols[s.col]||0)+1; }
for (const [c,n] of Object.entries(byCols).sort((a,b)=>Number(a)-Number(b))) {
  console.log(`  Col ${c}: ${n} string values`);
}

console.log('\nUnique string values per column:');
const uniqueByCol = {};
for (const s of stringNums) {
  if (!uniqueByCol[s.col]) uniqueByCol[s.col] = new Set();
  uniqueByCol[s.col].add(s.value);
}
for (const [c,vals] of Object.entries(uniqueByCol).sort((a,b)=>Number(a)-Number(b))) {
  console.log(`  Col ${c}: ${[...vals].join(', ')}`);
}

// Also check: are there any trailing/leading whitespace issues in data?
console.log('\n\n=== WHITESPACE ISSUES ===');
let wsIssues = 0;
for (const f of files) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { raw: true, cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const data = rows.slice(14);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmpty.length < 3) continue;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v != null && typeof v === 'string' && v !== v.trim() && v.trim() !== '') {
        if (wsIssues < 20) console.log(`  [${f}] Row ${14+i}, Col ${c}: "${v}" has whitespace`);
        wsIssues++;
      }
    }
  }
}
console.log(`Total cells with trailing/leading whitespace: ${wsIssues}`);

// Check for newlines in data
console.log('\n\n=== NEWLINE ISSUES ===');
let nlIssues = 0;
for (const f of files) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { raw: true, cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const data = rows.slice(14);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmpty.length < 3) continue;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v != null && typeof v === 'string' && v.includes('\n')) {
        if (nlIssues < 20) console.log(`  [${f}] Row ${14+i}, Col ${c}: "${v.replace(/\n/g, '\\n')}"`);
        nlIssues++;
      }
    }
  }
}
console.log(`Total cells with newlines: ${nlIssues}`);

// Check column 56 (TARIFNUMMER/HS code) format
console.log('\n\n=== TARIFNUMMER (HS Code) col 56 ===');
const hsCodeSet = new Set();
let hsCodeTypes = { number: 0, string: 0 };
let badHsCodes = [];
for (const f of files) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { raw: true, cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const data = rows.slice(14);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmpty.length < 3) continue;
    const v = row[56];
    if (v != null) {
      hsCodeTypes[typeof v]++;
      const s = String(v);
      hsCodeSet.add(s.length);
      if (!/^\d{8,11}$/.test(s.replace(/^0+/, ''))) {
        // HS codes that don't look like 8-11 digit numbers
        if (badHsCodes.length < 10) badHsCodes.push({ file: f, row: 14+i, value: v, type: typeof v });
      }
    }
  }
}
console.log(`  Types: number=${hsCodeTypes.number}, string=${hsCodeTypes.string}`);
console.log(`  String lengths: ${[...hsCodeSet].sort((a,b)=>a-b).join(', ')}`);
if (badHsCodes.length) {
  console.log(`  Bad HS codes:`);
  badHsCodes.forEach(h => console.log(`    ${h.file} row ${h.row}: "${h.value}" (${h.type})`));
} else {
  console.log(`  All HS codes valid (8-11 digits)`);
}

// Check country codes (col 21, 57)
console.log('\n\n=== COUNTRY CODES ===');
const countryCols = { 21: 'VERSENDUNGSLAND', 57: 'URSPRUNGSLAND' };
for (const [col, name] of Object.entries(countryCols)) {
  const vals = new Set();
  let bad = [];
  for (const f of files) {
    const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { raw: true, cellDates: false });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const data = rows.slice(14);
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
      if (nonEmpty.length < 3) continue;
      const v = row[Number(col)];
      if (v != null) {
        vals.add(String(v).trim());
        if (!/^[A-Z]{2}$/.test(String(v).trim())) {
          if (bad.length < 5) bad.push({ file: f, row: 14+i, value: v });
        }
      }
    }
  }
  console.log(`  Col ${col} (${name}): ${vals.size} unique values: ${[...vals].sort().join(', ')}`);
  if (bad.length) {
    console.log(`    Bad values:`, bad);
  }
}
