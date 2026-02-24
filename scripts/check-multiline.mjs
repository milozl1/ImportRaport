import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('excel/DHL/April 2025.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const data = rows.slice(2);

const byDecl = {};
for (const r of data) {
  const d = r[4];
  if (d) {
    if (!byDecl[d]) byDecl[d] = [];
    byDecl[d].push(r);
  }
}

const multi = Object.entries(byDecl).find(e => e[1].length > 1);
if (multi) {
  console.log('Declaration:', multi[0], 'Lines:', multi[1].length);
  for (const r of multi[1]) {
    console.log(
      '  summary_duty[67]:', r[67],
      ' line_duty[123]:', r[123],
      ' summary_vat[71]:', r[71],
      ' line_vat[127]:', r[127],
      ' invoice[117]:', r[117]
    );
  }
} else {
  console.log('No multi-line declarations found');
}

// Also check: which columns have the most data for FedEx VAT?
console.log('\n--- FedEx VAT column search ---');
const wb2 = XLSX.readFile('excel/FEDEX/01-feb-2025.xlsx');
const ws2 = wb2.Sheets[wb2.SheetNames[0]];
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });
const h = rows2[0] || [];
// Show all headers with "eust" or "vat" or "steuer" in the name
for (let i = 0; i < h.length; i++) {
  const name = String(h[i] || '').toLowerCase();
  if (name.includes('eust') || name.includes('vat') || name.includes('steuer') || name.includes('abgabe') || name.includes('zoll')) {
    console.log(`  [${i}] ${h[i]} → sample data: ${rows2[1]?.[i]}, ${rows2[2]?.[i]}`);
  }
}
