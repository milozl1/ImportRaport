import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const outDir = path.join('excel','DHL');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const COLS = 137; // DHL layout
function makeRow(defaults={}){
  const r = new Array(COLS).fill(null);
  // minimal meaningful fields
  r[0] = '01.01.2025'; // Date string
  r[1] = 'DE123456789'; // EORI
  r[15] = null; r[16] = null; r[17] = null; r[18] = null; r[19] = null; // seller empty
  r[20] = 'SHIPPER LTD';
  r[21] = 'SHIPPER ADDR';
  r[22] = 'TOWN';
  r[23] = '12345';
  r[24] = 'DE';
  // goods zone
  r[109] = 'LIGHTING PARTS';
  r[110] = '85122000';
  r[111] = 'CN';
  r[117] = 100.0; // invoice
  r[119] = 1.0;
  r[120] = 100.0;
  r[121] = 20.0;
  r[123] = 5.0; // duty
  r[124] = 25.0; // tax basis
  r[125] = 2.5;
  r[127] = 7.5;
  r[128] = 9.0;

  // apply overrides
  for(const [k,v] of Object.entries(defaults)) r[Number(k)] = v;
  return r;
}

function writeXlsx(fileName, rows){
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, path.join(outDir, fileName));
}

// 1) Normal file
const rows1 = [];
rows1.push(new Array(COLS).fill(null));
rows1.push(new Array(COLS).fill(null)); // header rows (2 as DHL uses headerStartRow=0, headerRows=2)
// Add header labels in row 0/1 for realism
rows1[0][0] = 'DHL Sample Report';
rows1[1][0] = 'Columns...';

// data rows
for(let i=0;i<10;i++){
  const r = makeRow({0: `01.0${i+1}.2025`, 110: String(85122000 + i), 109: `PART ${i}`});
  rows1.push(r);
}
writeXlsx('DHL-sample-normal.xlsx', rows1);
console.log('Wrote DHL-sample-normal.xlsx');

// 2) Shifted goods file — simulate goods description overflow: put HS code shifted right by +2
const rows2 = [];
rows2.push(new Array(COLS).fill(null));
rows2.push(new Array(COLS).fill(null));
rows2[0][0] = 'DHL Sample Shift Report';
rows2[1][0] = 'Header';

// Create a row where description occupies col109 and overflows into 110/111, pushing HS to 112
const r = makeRow();
// Put fragments: original description + overflow in 110 and 111
r[109] = 'LONG DESCRIPTION PART1';
r[110] = 'PART2';
r[111] = '85122000123'; // HS code incorrectly pushed to 111 (should be 110)
// Clear the 'official' HS col to simulate shift
r[112] = null;
rows2.push(r);
// Add a couple more normal rows
rows2.push(makeRow({109:'PART A',110:'85122011'}));
rows2.push(makeRow({109:'PART B',110:'85122022'}));

writeXlsx('DHL-sample-shift.xlsx', rows2);
console.log('Wrote DHL-sample-shift.xlsx');

console.log('Done generating DHL sample files in', outDir);
