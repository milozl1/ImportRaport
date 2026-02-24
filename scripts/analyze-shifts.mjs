/**
 * Deep shift analysis — examines EXACTLY what's in each cell for shifted rows
 * Focuses on:
 *  1) Seller zone (P-T, cols 15-19) — why are cols 15-19 always empty?
 *  2) Goods zone (DF-DY, cols 109-128) — rows where HS code is shifted
 *  3) The "Shipper→empty Seller" problem
 */
import * as XLSX from 'xlsx';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = join(import.meta.dirname, '..', 'excel');

function colLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) { idx--; s = String.fromCharCode(65 + (idx % 26)) + s; idx = Math.floor(idx / 26); }
  return s;
}

const files = readdirSync(DIR)
  .filter(f => f.endsWith('.xlsx') && !f.startsWith('.~'))
  .sort();

// ── ANALYSIS 1: SELLER ZONE ──
// The raw data shows cols 15-19 (P-T) are ALWAYS empty.
// But cols 20-24 (U-Y) have Shipper data which is correct per headers.
// → The SELLER fields are genuinely blank in the source Excel.
// → The validator thinks cols 20-24 are *shifted* seller data. BUG!

console.log('\n' + '='.repeat(80));
console.log('ANALYSIS 1: SELLER ZONE (cols 15-19 vs 20-24)');
console.log('='.repeat(80));

let sellerEmptyCount = 0;
let sellerFilledCount = 0;
let totalRows = 0;

for (const fname of files) {
  const fp = join(DIR, fname);
  const buf = readFileSync(fp);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const dataRows = rows.slice(2);
  
  let fileEmpty = 0, fileFilled = 0;
  for (const row of dataRows) {
    if (!row || row.filter(c => c != null && c !== '').length < 3) continue;
    totalRows++;
    
    const sellerName = row[15];
    const sellerAddr = row[16];
    const sellerTown = row[17];
    const sellerPost = row[18];
    const sellerCountry = row[19];
    
    const hasAnySeller = [sellerName, sellerAddr, sellerTown, sellerPost, sellerCountry]
      .some(v => v != null && v !== '');
    
    if (hasAnySeller) {
      fileFilled++;
      // Show some examples of filled seller rows
      if (fileFilled <= 2) {
        console.log(`  ${fname} row: Seller filled: P="${sellerName}" Q="${sellerAddr}" R="${sellerTown}" S="${sellerPost}" T="${sellerCountry}"`);
        console.log(`    Shipper: U="${row[20]}" V="${row[21]}" W="${row[22]}" X="${row[23]}" Y="${row[24]}"`);
      }
    } else {
      fileEmpty++;
    }
  }
  sellerEmptyCount += fileEmpty;
  sellerFilledCount += fileFilled;
  console.log(`  ${fname}: Seller empty=${fileEmpty}, filled=${fileFilled} (of ${fileEmpty+fileFilled} rows)`);
}
console.log(`\n  TOTAL: Seller empty=${sellerEmptyCount}, filled=${sellerFilledCount} (of ${totalRows} rows)`);
console.log(`  → Seller data is EMPTY in ${(sellerEmptyCount/totalRows*100).toFixed(1)}% of rows — this is SOURCE DATA, not a shift!`);

// ── ANALYSIS 2: GOODS ZONE SHIFTS ──
console.log('\n' + '='.repeat(80));
console.log('ANALYSIS 2: GOODS ZONE SHIFTS (cols 109-120)');
console.log('Looking for rows where HS Code (col 110) doesn\'t contain 8-11 digit number');
console.log('='.repeat(80));

for (const fname of files) {
  const fp = join(DIR, fname);
  const buf = readFileSync(fp);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const dataRows = rows.slice(2);
  
  let shiftedRows = [];
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row || row.filter(c => c != null && c !== '').length < 3) continue;
    
    const col110 = row[110]; // Should be HS Code (8-11 digits)
    const col111 = row[111]; // Should be country (2 letters)
    const col118 = row[118]; // Should be currency (3 letters)
    
    const hsOk = col110 != null && /^\d{8,11}$/.test(String(col110).trim());
    const countryOk = col111 != null && /^[A-Z]{2}$/i.test(String(col111).trim());
    const currencyOk = col118 != null && /^[A-Z]{3}$/.test(String(col118).trim());
    
    if (!hsOk || !countryOk || !currencyOk) {
      shiftedRows.push({
        row: r + 3,
        cols: Array.from({length: 15}, (_, i) => {
          const c = 108 + i;
          return `[${c}]=${String(row[c] ?? '').substring(0, 25)}`;
        }).join(' | '),
        col109: row[109],
        col110: row[110],
        col111: row[111],
        col112: row[112],
        col113: row[113],
        col117: row[117],
        col118: row[118],
      });
    }
  }
  
  if (shiftedRows.length > 0) {
    console.log(`\n  ${fname}: ${shiftedRows.length} shifted goods rows`);
    for (const sr of shiftedRows) {
      console.log(`    Row ${sr.row}:`);
      console.log(`      109(DF)="${String(sr.col109 ?? '').substring(0,40)}"`);
      console.log(`      110(DG)="${sr.col110}" ← should be HS code`);
      console.log(`      111(DH)="${sr.col111}" ← should be country`);
      console.log(`      112(DI)="${sr.col112}"`);
      console.log(`      113(DJ)="${sr.col113}"`);
      console.log(`      117(DN)="${sr.col117}" ← should be invoice value`);
      console.log(`      118(DO)="${sr.col118}" ← should be currency`);
    }
  }
}

// ── ANALYSIS 3: SELLER ZONE rows where postcode/country shifted ──
console.log('\n' + '='.repeat(80));
console.log('ANALYSIS 3: SELLER rows where something appears shifted (cols 15-24)');
console.log('='.repeat(80));

for (const fname of files) {
  const fp = join(DIR, fname);
  const buf = readFileSync(fp);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const dataRows = rows.slice(2);
  
  let issues = [];
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row || row.filter(c => c != null && c !== '').length < 3) continue;
    
    // Check if Shipper Country (col 24) doesn't look like a 2-letter code
    const shipperCountry = row[24];
    const shipperPC = row[23];
    const shipperTown = row[22];
    
    if (shipperCountry != null && shipperCountry !== '' && !/^[A-Z]{2}$/i.test(String(shipperCountry).trim())) {
      issues.push({
        row: r + 3,
        msg: `Shipper Country [24]="${shipperCountry}" NOT a country code! [22]="${shipperTown}" [23]="${shipperPC}"`,
        context: Array.from({length: 12}, (_, i) => `[${14+i}]="${String(row[14+i]??'').substring(0,20)}"`).join(' '),
      });
    }
    
    // Check if shipper postcode (col 23) is empty but something is in col 24 that looks like a postcode
    if ((shipperPC == null || shipperPC === '') && shipperCountry != null && !/^[A-Z]{2}$/i.test(String(shipperCountry).trim())) {
      issues.push({
        row: r + 3,
        msg: `Shipper PC [23] empty, but [24]="${shipperCountry}" doesn't look like country → possible +1 shift`,
        context: Array.from({length: 12}, (_, i) => `[${20+i}]="${String(row[20+i]??'').substring(0,20)}"`).join(' '),
      });
    }
  }
  
  if (issues.length > 0) {
    console.log(`\n  ${fname}: ${issues.length} shipper-zone issues`);
    for (const iss of issues.slice(0, 5)) {
      console.log(`    Row ${iss.row}: ${iss.msg}`);
      console.log(`      Context: ${iss.context}`);
    }
    if (issues.length > 5) console.log(`    ... and ${issues.length - 5} more`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
