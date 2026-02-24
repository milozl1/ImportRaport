/**
 * Dump DSV headers from every DSV file to understand the column layout
 * and find the correct columns for currency, country, incoterms, etc.
 */
import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const BASE = join(import.meta.dirname, '..', 'excel', 'DSV');
const files = readdirSync(BASE).filter(f => 
  (f.endsWith('.xlsx') || f.endsWith('.csv')) && !f.startsWith('DSV_Consolidated')
);

console.log(`Found ${files.length} DSV files\n`);

for (const file of files) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`FILE: ${file}`);
  console.log('═'.repeat(80));

  let rows;
  try {
    if (file.endsWith('.csv')) {
      const content = readFileSync(join(BASE, file), 'utf-8');
      const sep = content.split('\n')[0].includes(';') ? ';' : ',';
      rows = content.split('\n').map(line => 
        line.split(sep).map(cell => cell.replace(/^"|"$/g, '').trim())
      );
    } else {
      const wb = XLSX.readFile(join(BASE, file));
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      console.log(`  Sheets: ${wb.SheetNames.join(', ')}`);
    }

    // Headers (row 0)
    const headers = rows[0] || [];
    console.log(`  Total columns: ${headers.length}`);
    console.log('  ┌─── ALL HEADERS ───');
    for (let i = 0; i < headers.length; i++) {
      console.log(`  │ [${String(i).padStart(3)}] ${headers[i]}`);
    }

    // Sample first data row
    const dataRow = rows[1];
    if (dataRow) {
      console.log('  ┌─── FIRST DATA ROW ───');
      for (let i = 0; i < Math.max(headers.length, dataRow.length); i++) {
        const h = headers[i] || '???';
        const v = dataRow[i];
        if (v != null && String(v).trim() !== '') {
          console.log(`  │ [${String(i).padStart(3)}] ${String(h).substring(0, 30).padEnd(32)} = ${String(v).substring(0, 60)}`);
        }
      }
    }

    // Search for specific keywords in headers
    const searchTerms = ['Währung', 'Currency', 'Waehrung', 'Incoterm', 'Lieferbedingung', 
      'Ursprungsland', 'Origin', 'Land', 'Verfahren', 'Procedure', 'Gewicht', 'Weight',
      'Masse', 'Fracht', 'Freight', 'EUSt', 'Einfuhrumsatz', 'Zoll', 'Duty', 'Rechnung',
      'Invoice', 'Statistischer', 'Statist'];
    console.log('  ┌─── KEYWORD MATCHES ───');
    for (const term of searchTerms) {
      for (let i = 0; i < headers.length; i++) {
        if (headers[i] && String(headers[i]).toLowerCase().includes(term.toLowerCase())) {
          const val = dataRow ? dataRow[i] : null;
          console.log(`  │ "${term}" → col [${i}] "${headers[i]}" = ${val != null ? String(val).substring(0, 60) : '(empty)'}`);
        }
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}
