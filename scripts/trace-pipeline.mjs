/**
 * Trace the exact pipeline steps for November row 17.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';

const filePath = resolve('excel', 'November 2025.xlsx');
const buf = readFileSync(filePath);
const wb = XLSX.read(buf, { raw: true, cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

const dataRows = allRows.slice(2).filter(row => {
  if (!row || row.length < 3) return false;
  const nonEmpty = row.filter(c => c != null && c !== '');
  return nonEmpty.length >= 3;
});

const row = [...dataRows[16]]; // row 17, 0-indexed = 16

function dump(label, row, start, end) {
  console.log(`\n--- ${label} ---`);
  for (let c = start; c <= end; c++) {
    console.log(`  [${c}]: ${JSON.stringify(row[c])}`);
  }
}

console.log('=== ORIGINAL SOURCE DATA ===');
dump('Shipper zone (20-25)', row, 20, 25);
dump('Consignee/mid-row zone (26-38)', row, 26, 38);

// Now simulate shipper repair manually
// Shipper address: col 20=name, 21=addr, 22=overflow, 23=town, 24=postcode, 25=country
console.log('\n=== SHIPPER ZONE ANALYSIS ===');
console.log(`Col 20 (Name): ${JSON.stringify(row[20])}`);
console.log(`Col 21 (Addr): ${JSON.stringify(row[21])}`);
console.log(`Col 22 (Town/Overflow): ${JSON.stringify(row[22])}`);
console.log(`Col 23 (Post): ${JSON.stringify(row[23])}`);
console.log(`Col 24 (Country): ${JSON.stringify(row[24])}`);
console.log(`Col 25 (Gap): ${JSON.stringify(row[25])}`);

// Check: is col 24 a 2-letter country? If so, no shift.
// If col 24 is NOT a 2-letter country, but col 25 IS -> shift +1
const isCountry = (v) => v && /^[A-Z]{2}$/i.test(String(v).trim());
console.log(`\nCol 24 isCountry? ${isCountry(row[24])}`);
console.log(`Col 25 isCountry? ${isCountry(row[25])}`);

// After shipper +1 repair:
// - Addr is merged: "CENTRO INDUSTRIAL GUANAJUATO" + "CARR. 110 IRAPUATO, ABASOLO"
// - everything from col 22 onwards shifts LEFT by 1
// So col 22 (was Town) becomes the new Town position, but the old col 23 slides into 22
// Wait, the repair REBUILDS: [0..19, Name, MergedAddr, Town, Post, Country, ...rest from col 26 onward]

// Let me trace what the repair actually does:
// Base = 20. After +1 shift repair:
// before = row[0..19]
// Name = row[20]  (unchanged)
// Addr = row[21] + " " + row[22]  (merged)
// Town = row[23] → goes to position 22
// Post = row[24] → goes to position 23
// Country = row[25] → goes to position 24
// rest = row[26..end] → starts at position 25

console.log('\n=== SIMULATED POST-SHIPPER-REPAIR ===');
// The new positions after shift -1 from col 22:
const newCol25 = row[26];  // was consignee customs number
const newCol26 = row[27];  // was consignee name  
const newCol30 = row[31];  // was incoterm (DE)
const newCol31 = row[32];  // was delivery location (EXW)
const newCol32 = row[33];  // was freight (CARR. 110...)
const newCol33 = row[34];  // was weight (null)
const newCol34 = row[35];  // was pieces (334.24)

console.log(`After shipper repair, the row gets rebuilt:`);
console.log(`  new col 24 (Country): ${JSON.stringify(row[25])} → "MX" ✓`);
console.log(`  new col 25 (Gap): ${JSON.stringify(row[26])} → consignee customs number`);
console.log(`  ...`);
console.log(`  new col 30 (Consignee Country): ${JSON.stringify(row[31])} → "${row[31]}"`);
console.log(`  new col 31 (Incoterm): ${JSON.stringify(row[32])} → "${row[32]}"`);
console.log(`  new col 32 (Delivery Location): ${JSON.stringify(row[33])} → CARR. 110 IRAPUATO, ABASOLO!`);
console.log(`  new col 33 (Freight): ${JSON.stringify(row[34])} → NULL!`);
console.log(`  new col 34 (Weight): ${JSON.stringify(row[35])} → 334.24 (but this IS freight!)`);
console.log(`  new col 35 (Pieces): ${JSON.stringify(row[36])} → 12.0`);

// So after shipper repair:
// col 32 = "CARR. 110 IRAPUATO, ABASOLO" (correctly the delivery location)
// col 33 = null (the hole — should be freight!)
// col 34 = 334.24 (freight at wrong position)
// col 35 = 12.0 (weight at wrong position)

// The mid-row detector checks: is col 33 non-numeric text?
// But col 33 is NULL! So P.isEmpty(col 33) returns true, and detectMidRowOverflow returns 0.

// The issue: the source data had the delivery location overflowing,
// but there was NO text in col 34 (it was empty). So col 33 in source had "CARR. 110..."
// and col 34 was empty, and col 35 had 334.24.
// After shipper repair shifts everything left by 1:
// col 32 = CARR.110..., col 33 = empty, col 34 = 334.24, col 35 = 12.0

// This is a +1 shift but with an EMPTY cell in between.
// The delivery location IS in col 32 (correct), but freight is at col 34 instead of 33.
// The problem is that there was a gap/empty cell in the original data between
// the delivery location and freight.

console.log('\n=== ROOT CAUSE ===');
console.log('After shipper repair, col 32 has delivery location text.');
console.log('Col 33 is NULL/empty (from the gap in source data).');
console.log('Col 34 has freight (334.24), col 35 has weight (12.0).');
console.log('The mid-row overflow detector only triggers when col 33 has NON-NUMERIC TEXT.');
console.log('Since col 33 is empty/null, the detector returns 0 and no repair happens.');
console.log('');
console.log('FIX: Need to also detect the case where col 33 is EMPTY but col 32 has text');
console.log('and col 34+ has the numeric freight value. This means the delivery location');
console.log('did not overflow textually but there is a structural gap causing a +1 shift.');
