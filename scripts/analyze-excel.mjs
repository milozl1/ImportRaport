/**
 * Deep Excel analyzer — dumps raw column data to find shift problems
 * Run: node scripts/analyze-excel.mjs
 */
import * as XLSX from 'xlsx';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = join(import.meta.dirname, '..', 'excel');

// DHL schema expectations (column index → expected content type)
const COL_EXPECTATIONS = {
  0: { name: 'Date of Declaration', test: v => /^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}/.test(String(v||'').trim()) },
  1: { name: 'EORI Number', test: v => /^[A-Z]{2}\d+/.test(String(v||'').trim()) },
  15: { name: 'Seller Name', test: v => typeof v === 'string' && v.trim().length > 3 },
  16: { name: 'Seller Address', test: v => typeof v === 'string' && v.trim().length > 3 },
  17: { name: 'Seller Town', test: v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 30 },
  18: { name: 'Seller Postcode', test: v => { const s=String(v||'').trim(); return s.length>0 && s.length<=10; } },
  19: { name: 'Seller Country', test: v => /^[A-Z]{2}$/i.test(String(v||'').trim()) },
  20: { name: 'Shipper Name', test: v => typeof v === 'string' && v.trim().length > 3 },
  21: { name: 'Shipper Address', test: v => typeof v === 'string' && v.trim().length > 3 },
  22: { name: 'Shipper Town', test: v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 30 },
  23: { name: 'Shipper Postcode', test: v => { const s=String(v||'').trim(); return s.length>0 && s.length<=10; } },
  24: { name: 'Shipper Country', test: v => /^[A-Z]{2}$/i.test(String(v||'').trim()) },
  25: { name: 'Col25 (gap?)', test: v => true },
  26: { name: 'Consignee Name', test: v => typeof v === 'string' && v.trim().length > 3 },
  27: { name: 'Consignee Address', test: v => typeof v === 'string' && v.trim().length > 3 },
  28: { name: 'Consignee Town', test: v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 30 },
  29: { name: 'Consignee Postcode', test: v => { const s=String(v||'').trim(); return s.length>0 && s.length<=10; } },
  30: { name: 'Consignee Country', test: v => /^[A-Z]{2}$/i.test(String(v||'').trim()) },
  31: { name: 'Incoterm', test: v => /^[A-Z]{3}$/.test(String(v||'').trim()) },
  109: { name: 'Description of Goods', test: v => typeof v === 'string' && v.trim().length > 5 },
  110: { name: 'HS Code', test: v => /^\d{8,11}$/.test(String(v||'').trim()) },
  111: { name: 'Country of Origin', test: v => /^[A-Z]{2}$/i.test(String(v||'').trim()) },
  113: { name: 'Procedure Code', test: v => /^\d{3,4}$/.test(String(v||'').trim()) },
  117: { name: 'Invoice Value', test: v => { if(typeof v==='number') return true; return /^-?[\d.,]+$/.test(String(v||'').trim()); } },
  118: { name: 'Currency', test: v => /^[A-Z]{3}$/.test(String(v||'').trim()) },
};

// Column letters for reference
function colLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) { idx--; s = String.fromCharCode(65 + (idx % 26)) + s; idx = Math.floor(idx / 26); }
  return s;
}

const files = readdirSync(DIR)
  .filter(f => f.endsWith('.xlsx') && !f.startsWith('.~'))
  .sort();

console.log(`\n${'='.repeat(80)}`);
console.log(`ANALYZING ${files.length} EXCEL FILES`);
console.log(`${'='.repeat(80)}\n`);

for (const fname of files) {
  const fp = join(DIR, fname);
  const buf = readFileSync(fp);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`FILE: ${fname}  |  Rows: ${rows.length}  |  Max cols: ${Math.max(...rows.map(r=>(r||[]).length))}`);
  console.log(`${'─'.repeat(80)}`);

  // Print header rows (0 and 1)
  console.log('\n  HEADER ROW 0 (selected columns):');
  const h0 = rows[0] || [];
  const h1 = rows[1] || [];
  const checkCols = [0,1,2,3,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,
                     67,71,75,76,109,110,111,112,113,114,115,116,117,118,119,120,121,123,124,125,127,128];
  for (const c of checkCols) {
    const letter = colLetter(c);
    const v0 = h0[c] ?? '';
    const v1 = h1[c] ?? '';
    if (v0 || v1) {
      console.log(`    Col ${c} (${letter}): H0="${String(v0).substring(0,50)}" | H1="${String(v1).substring(0,50)}"`);
    }
  }

  // Analyze data rows (starting from row 2)
  const dataRows = rows.slice(2);
  let anomalies = [];
  let totalDataRows = 0;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row || row.length < 3) continue;
    const nonEmpty = row.filter(c => c != null && c !== '');
    if (nonEmpty.length < 3) continue;
    totalDataRows++;

    // Check each expected column
    for (const [colStr, exp] of Object.entries(COL_EXPECTATIONS)) {
      const col = parseInt(colStr);
      const val = row[col];
      if (val == null || val === '') {
        // Check if there's content shifted nearby
        const nearby = [];
        for (let off = -3; off <= 3; off++) {
          if (off === 0) continue;
          const nc = col + off;
          if (nc >= 0 && nc < row.length && row[nc] != null && row[nc] !== '') {
            if (exp.test(row[nc])) {
              nearby.push({ offset: off, val: row[nc] });
            }
          }
        }
        if (nearby.length > 0) {
          anomalies.push({
            row: r + 3, // 1-based, accounting for 2 header rows
            col, colLetter: colLetter(col),
            expected: exp.name,
            actual: '(empty)',
            foundAt: nearby.map(n => `offset ${n.offset > 0 ? '+' : ''}${n.offset}: "${String(n.val).substring(0,30)}"`).join('; '),
          });
        }
        continue;
      }
      if (!exp.test(val)) {
        // Value doesn't match expectation — might be shifted
        anomalies.push({
          row: r + 3,
          col, colLetter: colLetter(col),
          expected: exp.name,
          actual: String(val).substring(0, 40),
          foundAt: '',
        });
      }
    }
  }

  console.log(`\n  DATA ROWS: ${totalDataRows}`);
  console.log(`  ANOMALIES FOUND: ${anomalies.length}`);

  if (anomalies.length > 0) {
    // Group by column
    const byCol = {};
    for (const a of anomalies) {
      const key = `Col ${a.col} (${a.colLetter}) — ${a.expected}`;
      if (!byCol[key]) byCol[key] = [];
      byCol[key].push(a);
    }

    for (const [key, items] of Object.entries(byCol)) {
      console.log(`\n  ${key}: ${items.length} issue(s)`);
      // Show first 5 examples
      for (const item of items.slice(0, 5)) {
        const details = item.foundAt ? ` → found nearby: ${item.foundAt}` : '';
        console.log(`    Row ${item.row}: actual="${item.actual}"${details}`);
      }
      if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
    }
  }

  // ── DETAILED DUMP: Show cols 14-31 for first 10 data rows to see raw layout ──
  console.log(`\n  RAW DATA DUMP — Columns 14-31 (first 10 data rows):`);
  console.log(`  ${'Col'.padEnd(4)} | ${Array.from({length:18}, (_,i) => colLetter(14+i).padEnd(15)).join('| ')}`);
  console.log(`  ${''.padEnd(4)} | ${Array.from({length:18}, (_,i) => `[${14+i}]`.padEnd(15)).join('| ')}`);
  console.log(`  ${'─'.repeat(300)}`);
  let shown = 0;
  for (let r = 0; r < dataRows.length && shown < 10; r++) {
    const row = dataRows[r];
    if (!row || row.length < 3) continue;
    const nonEmpty = (row||[]).filter(c => c != null && c !== '');
    if (nonEmpty.length < 3) continue;
    shown++;
    const vals = Array.from({length:18}, (_,i) => {
      const v = row[14+i];
      return String(v ?? '').substring(0, 14).padEnd(15);
    });
    console.log(`  R${(r+3).toString().padEnd(3)} | ${vals.join('| ')}`);
  }

  // ── DETAILED DUMP: Show cols 108-120 for first 10 data rows ──
  console.log(`\n  RAW DATA DUMP — Columns 108-120 (first 10 data rows):`);
  console.log(`  ${'Col'.padEnd(4)} | ${Array.from({length:13}, (_,i) => colLetter(108+i).padEnd(20)).join('| ')}`);
  console.log(`  ${''.padEnd(4)} | ${Array.from({length:13}, (_,i) => `[${108+i}]`.padEnd(20)).join('| ')}`);
  console.log(`  ${'─'.repeat(300)}`);
  shown = 0;
  for (let r = 0; r < dataRows.length && shown < 10; r++) {
    const row = dataRows[r];
    if (!row || row.length < 3) continue;
    const nonEmpty = (row||[]).filter(c => c != null && c !== '');
    if (nonEmpty.length < 3) continue;
    shown++;
    const vals = Array.from({length:13}, (_,i) => {
      const v = row[108+i];
      return String(v ?? '').substring(0, 19).padEnd(20);
    });
    console.log(`  R${(r+3).toString().padEnd(3)} | ${vals.join('| ')}`);
  }
}

console.log(`\n${'='.repeat(80)}`);
console.log('ANALYSIS COMPLETE');
console.log(`${'='.repeat(80)}\n`);
