/**
 * UPS Deep File Analysis
 * Parses all 12 UPS Excel files and reports:
 *  - Sheet names, row/col counts
 *  - Header rows
 *  - Data types per column
 *  - Footer patterns
 *  - Numeric formats (comma vs dot decimal)
 *  - Null/empty distribution
 *  - Sample values per column
 */

import { readFileSync } from 'fs';
import { readdirSync } from 'fs';
import * as XLSX from 'xlsx';

const DIR = 'excel/UPS';
const files = readdirSync(DIR)
  .filter(f => f.endsWith('.xlsx'))
  .sort();

console.log(`Found ${files.length} UPS files\n`);

// ── Analyze each file ──
const fileInfos = [];

for (const fname of files) {
  const buf = readFileSync(`${DIR}/${fname}`);
  const wb = XLSX.read(buf, { raw: true, cellDates: false });
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`FILE: ${fname}`);
  console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    
    if (rows.length === 0) {
      console.log(`  Sheet "${sheetName}": EMPTY`);
      continue;
    }

    const maxCols = Math.max(...rows.map(r => r ? r.length : 0));
    console.log(`  Sheet "${sheetName}": ${rows.length} rows × ${maxCols} cols`);

    // Print first 5 rows
    console.log(`\n  First 5 rows:`);
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      const vals = [];
      for (let j = 0; j < Math.min(maxCols, 30); j++) {
        const v = row && row[j] != null ? String(row[j]).substring(0, 20) : '·';
        vals.push(v);
      }
      console.log(`    R${i}: [${vals.join(' | ')}]`);
      if (maxCols > 30) console.log(`         ... +${maxCols - 30} more cols`);
    }

    // Print last 5 rows
    console.log(`\n  Last 5 rows:`);
    for (let i = Math.max(0, rows.length - 5); i < rows.length; i++) {
      const row = rows[i];
      const vals = [];
      for (let j = 0; j < Math.min(maxCols, 30); j++) {
        const v = row && row[j] != null ? String(row[j]).substring(0, 20) : '·';
        vals.push(v);
      }
      console.log(`    R${i}: [${vals.join(' | ')}]`);
    }

    // Detect header row
    let headerRow = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      const nonEmpty = row.filter(c => c != null && c !== '');
      if (nonEmpty.length > maxCols * 0.3) {
        // Check if mostly strings
        const strings = nonEmpty.filter(c => typeof c === 'string');
        if (strings.length > nonEmpty.length * 0.8) {
          headerRow = i;
          break;
        }
      }
    }

    if (headerRow >= 0) {
      console.log(`\n  Header at row ${headerRow}:`);
      const hdr = rows[headerRow];
      for (let j = 0; j < maxCols; j++) {
        const h = hdr && hdr[j] != null ? hdr[j] : '';
        console.log(`    Col ${j}: "${h}"`);
      }
    }

    // Analyze data types per column (first 50 data rows)
    const dataStart = headerRow >= 0 ? headerRow + 1 : 1;
    const dataEnd = Math.min(dataStart + 50, rows.length);
    
    console.log(`\n  Column type analysis (rows ${dataStart}-${dataEnd - 1}):`);
    for (let j = 0; j < maxCols; j++) {
      const types = { string: 0, number: 0, boolean: 0, null: 0, empty: 0 };
      const samples = [];
      let hasCommaDecimal = false;
      let hasDotDecimal = false;
      
      for (let i = dataStart; i < dataEnd; i++) {
        const row = rows[i];
        const v = row && row[j] != null ? row[j] : null;
        
        if (v === null) { types.null++; continue; }
        if (v === '') { types.empty++; continue; }
        
        const t = typeof v;
        types[t] = (types[t] || 0) + 1;
        
        if (samples.length < 3 && v !== '' && v != null) {
          samples.push(String(v).substring(0, 30));
        }
        
        // Check numeric format
        if (t === 'string') {
          if (/^\d+,\d+$/.test(v)) hasCommaDecimal = true;
          if (/^\d+\.\d+$/.test(v)) hasDotDecimal = true;
        }
      }
      
      const hdr = headerRow >= 0 ? rows[headerRow][j] : `Col${j}`;
      const dominant = Object.entries(types)
        .filter(([_, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `${t}:${c}`)
        .join(', ');
      
      const fmt = hasCommaDecimal ? ' [COMMA-DEC]' : (hasDotDecimal ? ' [DOT-DEC]' : '');
      console.log(`    Col ${j} (${hdr}): ${dominant}${fmt}  samples: ${samples.join(', ')}`);
    }

    // Footer detection
    console.log(`\n  Footer analysis (last 10 rows):`);
    for (let i = Math.max(dataStart, rows.length - 10); i < rows.length; i++) {
      const row = rows[i];
      const nonEmpty = row ? row.filter(c => c != null && c !== '').length : 0;
      const first = row && row[0] != null ? String(row[0]).substring(0, 30) : '·';
      console.log(`    R${i}: ${nonEmpty} non-empty cells. First: "${first}"`);
    }

    fileInfos.push({
      file: fname,
      sheet: sheetName,
      rows: rows.length,
      cols: maxCols,
      headerRow,
      dataStart,
    });
  }
}

// ── Summary ──
console.log(`\n\n${'═'.repeat(70)}`);
console.log('SUMMARY');
console.log(`${'═'.repeat(70)}`);
console.log(`Files: ${files.length}`);

const colCounts = [...new Set(fileInfos.map(f => f.cols))].sort((a, b) => a - b);
console.log(`Column counts: ${colCounts.join(', ')}`);

const rowCounts = fileInfos.map(f => f.rows);
console.log(`Row counts: min=${Math.min(...rowCounts)}, max=${Math.max(...rowCounts)}, total=${rowCounts.reduce((a, b) => a + b, 0)}`);

const headerRows = [...new Set(fileInfos.map(f => f.headerRow))];
console.log(`Header rows: ${headerRows.join(', ')}`);
