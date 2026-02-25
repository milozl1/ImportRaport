import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DSV_DIR = join(new URL('..', import.meta.url).pathname, 'excel', 'DSV');
const csvFiles = readdirSync(DSV_DIR).filter(f => f.endsWith('.csv'));

for (const f of csvFiles) {
  const path = join(DSV_DIR, f);
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n');
  const header = lines[0].split(';');
  
  console.log('\n===', f, '===');
  console.log('Total lines:', lines.length, '| Columns:', header.length);
  
  // Find date column
  const dateIdx = header.findIndex(h => h && h.toLowerCase().includes('anlagedatum'));
  console.log('Date col:', dateIdx, '->', header[dateIdx]);
  
  // Count all-zero rows and look at dates
  let zeroCount = 0;
  let dateExamples = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(';');
    
    // Check if all cells are 0 or empty
    const allZeroOrEmpty = cells.every(c => c === '' || c === '0' || c === '0,00' || c === '0,000000');
    if (allZeroOrEmpty) {
      zeroCount++;
      if (zeroCount <= 3) console.log('  ZERO row', i, ':', cells.slice(0, 8).join(' | '));
      continue;
    }
    
    if (dateIdx >= 0 && dateExamples.length < 5) {
      dateExamples.push({ row: i, date: cells[dateIdx], verfahren: cells[2], col3: cells[3] });
    }
  }
  
  console.log('All-zero rows:', zeroCount);
  console.log('Date examples:', dateExamples);
}
