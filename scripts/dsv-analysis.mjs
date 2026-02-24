import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DSV_DIR = path.join(ROOT, 'excel', 'DSV');

function isNumericEU(v) {
  if (v == null || v === '') return false;
  const s = String(v).trim();
  return /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) ||
         /^-?\d+(,\d+)?$/.test(s) ||
         /^-?\d+(\.\d+)?$/.test(s);
}

function isDateLike(v) {
  if (v == null || v === '') return false;
  const s = String(v).trim();
  return /^\d{2}\.\d{2}\.\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
}

function classify(v) {
  if (v == null || v === '') return 'empty';
  const s = String(v).trim();
  if (s === '') return 'empty';
  if (isDateLike(s)) return 'date';
  if (isNumericEU(s)) return 'numeric';
  return 'text';
}

function parseCSVManual(filePath) {
  const raw = fs.readFileSync(filePath, 'latin1');
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map(line => line.split(';'));
}

function parseXLSX_file(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

const files = fs.readdirSync(DSV_DIR).filter(f => /\.(csv|xlsx?)$/i.test(f)).sort();
console.log('='.repeat(80));
console.log('DSV DEEP ANALYSIS - ' + files.length + ' files');
console.log('='.repeat(80));

const fileInfos = [];

for (const file of files) {
  const fp = path.join(DSV_DIR, file);
  const ext = path.extname(file).toLowerCase();
  let rows;
  try {
    rows = ext === '.csv' ? parseCSVManual(fp) : parseXLSX_file(fp);
  } catch (e) {
    console.log('ERROR parsing ' + file + ': ' + e.message);
    continue;
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (!last || last.every(c => c == null || String(c).trim() === '')) rows.pop();
    else break;
  }

  const headerRow = rows[0] || [];
  const dataRows = rows.slice(1);
  const numCols = headerRow.length;

  const colStats = [];
  for (let c = 0; c < numCols; c++) {
    const vals = dataRows.map(r => (r && r[c] != null) ? r[c] : null);
    const nonEmpty = vals.filter(v => v != null && String(v).trim() !== '');
    const types = {};
    nonEmpty.forEach(v => { const t = classify(v); types[t] = (types[t] || 0) + 1; });
    const sample = nonEmpty.slice(0, 3).map(v => String(v).substring(0, 40));
    colStats.push({ idx: c, header: String(headerRow[c] || '').trim(), total: nonEmpty.length, types, sample });
  }

  const info = { file, ext, totalRows: rows.length, dataRows: dataRows.length, numCols, headerRow: headerRow.map(h => String(h || '').trim()), colStats };
  fileInfos.push(info);

  console.log('\n' + '-'.repeat(80));
  console.log('FILE: ' + file);
  console.log('  Format: ' + ext.toUpperCase() + ' | Cols: ' + numCols + ' | Data rows: ' + dataRows.length);

  console.log('\n  COL# | HEADER                              | FILLED | TYPES            | SAMPLES');
  console.log('  ' + '-'.repeat(105));
  for (const cs of colStats) {
    const typeStr = Object.entries(cs.types).map(([k, v]) => k + ':' + v).join(', ');
    const sampleStr = cs.sample.join(' | ');
    console.log('  ' + String(cs.idx).padStart(4) + ' | ' + cs.header.padEnd(35).substring(0, 35) + ' | ' + String(cs.total).padStart(6) + ' | ' + typeStr.padEnd(16).substring(0, 16) + ' | ' + sampleStr.substring(0, 60));
  }
}

// Cross-file comparison
console.log('\n\n' + '='.repeat(80));
console.log('CROSS-FILE COMPARISON');
console.log('='.repeat(80));

const byColCount = {};
fileInfos.forEach(fi => { const k = fi.numCols; if (!byColCount[k]) byColCount[k] = []; byColCount[k].push(fi.file); });
console.log('\nColumn count groups:');
for (const [k, v] of Object.entries(byColCount)) {
  console.log('  ' + k + ' cols: ' + v.join(', '));
}

// Luftfracht vs Sea
console.log('\n' + '='.repeat(80));
console.log('LUFTFRACHT vs SEA COMPARISON');
console.log('='.repeat(80));

const seaFiles = fileInfos.filter(fi => fi.file.toLowerCase().includes('sea') || fi.file.toLowerCase().includes('imp-hella'));
const luftFiles = fileInfos.filter(fi => fi.file.toLowerCase().includes('luft'));

console.log('\nSea files: ' + seaFiles.length);
seaFiles.forEach(f => console.log('  ' + f.file + ' (' + f.numCols + ' cols, ' + f.dataRows + ' rows)'));
console.log('Luftfracht files: ' + luftFiles.length);
luftFiles.forEach(f => console.log('  ' + f.file + ' (' + f.numCols + ' cols, ' + f.dataRows + ' rows)'));

if (seaFiles.length > 0 && luftFiles.length > 0) {
  const seaH = seaFiles[0].headerRow;
  const luftH = luftFiles[0].headerRow;
  console.log('\nSea cols: ' + seaH.length + ', Luft cols: ' + luftH.length);

  console.log('\nLuftfracht headers (' + luftFiles[0].file + '):');
  luftH.forEach((h, i) => console.log('  [' + i + '] ' + h));

  console.log('\nSea headers (' + seaFiles[0].file + '):');
  seaH.forEach((h, i) => console.log('  [' + i + '] ' + h));

  const seaSet = new Set(seaH.filter(Boolean));
  const luftSet = new Set(luftH.filter(Boolean));
  const common = [...seaSet].filter(h => luftSet.has(h));
  const onlySea = [...seaSet].filter(h => !luftSet.has(h));
  const onlyLuft = [...luftSet].filter(h => !seaSet.has(h));
  console.log('\nCommon: ' + common.length + ', Only Sea: ' + onlySea.length + ', Only Luft: ' + onlyLuft.length);
  if (onlySea.length > 0) console.log('Only in Sea: ' + onlySea.join(', '));
  if (onlyLuft.length > 0) console.log('Only in Luft: ' + onlyLuft.join(', '));
}

// Numeric columns
console.log('\n' + '='.repeat(80));
console.log('NUMERIC COLUMNS (>=50% numeric values)');
console.log('='.repeat(80));

const biggest = fileInfos.reduce((best, fi) => fi.dataRows > (best ? best.dataRows : 0) ? fi : best, null);
if (biggest) {
  console.log('\nFrom: ' + biggest.file + ' (' + biggest.numCols + ' cols, ' + biggest.dataRows + ' rows)');
  for (const cs of biggest.colStats) {
    const numCount = cs.types.numeric || 0;
    const total = cs.total || 1;
    const pct = ((numCount / total) * 100).toFixed(0);
    if (numCount > 0 && parseInt(pct) >= 50) {
      console.log('  Col ' + cs.idx + ': "' + cs.header + '" - ' + pct + '% numeric (' + numCount + '/' + total + ') - samples: ' + cs.sample.join(', '));
    }
  }
}

// Encoding check
console.log('\n' + '='.repeat(80));
console.log('ENCODING CHECK (CSV files)');
console.log('='.repeat(80));

for (const fi of fileInfos.filter(f => f.ext === '.csv')) {
  const fp = path.join(DSV_DIR, fi.file);
  const raw = fs.readFileSync(fp);
  let nonAscii = 0;
  const problematicBytes = new Set();
  for (let i = 0; i < Math.min(raw.length, 50000); i++) {
    if (raw[i] > 127) { nonAscii++; problematicBytes.add(raw[i]); }
  }
  console.log('  ' + fi.file + ': non-ASCII=' + nonAscii + ', bytes=[' + [...problematicBytes].map(b => '0x' + b.toString(16)).join(',') + ']');
  const specialH = fi.headerRow.filter(h => /[^\x20-\x7E]/.test(h));
  if (specialH.length > 0) console.log('    Special char headers: ' + specialH.join(', '));
}

// XLSX sheet names
console.log('\n' + '='.repeat(80));
console.log('XLSX SHEET STRUCTURE');
console.log('='.repeat(80));

for (const fi of fileInfos.filter(f => f.ext !== '.csv')) {
  const fp = path.join(DSV_DIR, fi.file);
  const buf = fs.readFileSync(fp);
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log('\n  ' + fi.file + ':');
  console.log('    Sheets: ' + wb.SheetNames.join(', '));
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    console.log('    Sheet "' + sn + '": range=' + (ws['!ref'] || 'empty'));
  }
}

// Sample data rows
console.log('\n' + '='.repeat(80));
console.log('SAMPLE DATA (first 2 rows of each file, non-empty cells only)');
console.log('='.repeat(80));

for (const fi of fileInfos) {
  const fp = path.join(DSV_DIR, fi.file);
  let rows;
  try {
    rows = fi.ext === '.csv' ? parseCSVManual(fp) : parseXLSX_file(fp);
  } catch (e) { continue; }
  const dataRows = rows.slice(1, 3);
  console.log('\n  ' + fi.file + ':');
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r] || [];
    console.log('  Row ' + (r + 1) + ':');
    for (let c = 0; c < Math.min(row.length, fi.headerRow.length); c++) {
      const v = row[c];
      if (v != null && String(v).trim() !== '') {
        console.log('    [' + c + '] ' + (fi.headerRow[c] || 'col' + c) + ': "' + String(v).substring(0, 80) + '"');
      }
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
