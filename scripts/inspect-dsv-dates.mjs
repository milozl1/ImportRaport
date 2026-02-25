import XLSX from 'xlsx';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DSV_DIR = join(new URL('..', import.meta.url).pathname, 'excel', 'DSV');
const files = readdirSync(DSV_DIR).filter(f => f.endsWith('.xlsx') && !f.startsWith('DSV_Consolidated'));

for (const f of files) {
  const path = join(DSV_DIR, f);
  let wb;
  try { wb = XLSX.readFile(path, { raw: true }); } catch (e) { console.log('SKIP:', f, e.message); continue; }
  
  console.log('\n═══', f, '═══');
  console.log('Sheets:', wb.SheetNames);
  
  const dataSheet = wb.SheetNames.find(n => /^(importzoll|hella|import report)/i.test(n)) || wb.SheetNames[0];
  console.log('Using sheet:', dataSheet);
  
  const ws = wb.Sheets[dataSheet];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  
  console.log('Total rows:', rows.length);
  
  const header = rows[0] || [];
  
  // Find date column(s)
  const dateCols = [];
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (h && (String(h).toLowerCase().includes('datum') || String(h).toLowerCase().includes('date') || String(h).toLowerCase().includes('anlage'))) {
      dateCols.push({ idx: i, name: String(h) });
    }
  }
  console.log('Date columns:', dateCols);
  
  // Count all-zero rows
  let zeroCount = 0;
  const zeroRowIndices = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const allZeroOrEmpty = row.every(c => c == null || c === '' || c === 0);
    if (allZeroOrEmpty) {
      zeroCount++;
      if (zeroRowIndices.length < 5) zeroRowIndices.push(i);
    }
  }
  console.log('All-zero rows:', zeroCount, 'at indices:', zeroRowIndices);
  
  // Show first 10 data rows with date values
  let shown = 0;
  for (let i = 1; i < rows.length && shown < 10; i++) {
    const row = rows[i];
    if (!row) continue;
    const allZeroOrEmpty = row.every(c => c == null || c === '' || c === 0);
    if (allZeroOrEmpty) continue;
    
    const dateVals = dateCols.map(dc => ({
      col: dc.name,
      val: row[dc.idx],
      type: typeof row[dc.idx]
    }));
    
    console.log(`  Row ${i}:`, JSON.stringify(dateVals), '| col0:', row[0], '| col1:', row[1]);
    shown++;
  }
}
