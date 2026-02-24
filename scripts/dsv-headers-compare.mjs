/**
 * Compare headers across CSV files with different column counts
 * to understand exactly which columns are added/inserted.
 */
import fs from 'fs';
import path from 'path';

const DSV_DIR = path.resolve('excel/DSV');

function parseCSVHeaders(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  // BOM strip
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const firstLine = raw.split(/\r?\n/)[0];
  return firstLine.split(';').map(h => h.replace(/^"|"$/g, ''));
}

const csvFiles = fs.readdirSync(DSV_DIR)
  .filter(f => f.endsWith('.csv'))
  .sort();

// Group by column count
const groups = {};
for (const f of csvFiles) {
  const headers = parseCSVHeaders(path.join(DSV_DIR, f));
  const count = headers.length;
  if (!groups[count]) groups[count] = { files: [], headers };
  groups[count].files.push(f);
}

const counts = Object.keys(groups).map(Number).sort((a, b) => a - b);
console.log('Column count groups:', counts.join(', '));
for (const c of counts) {
  console.log(`\n${c} columns: ${groups[c].files.join(', ')}`);
}

// Compare headers side by side
if (counts.length >= 2) {
  const small = groups[counts[0]].headers;
  const large = groups[counts[counts.length - 1]].headers;
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`HEADER COMPARISON: ${counts[0]}-col vs ${counts[counts.length - 1]}-col`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Find where they diverge
  let si = 0, li = 0;
  while (si < small.length || li < large.length) {
    if (si < small.length && li < large.length && small[si] === large[li]) {
      // Match
      si++; li++;
    } else if (li < large.length) {
      // Check if the small header appears later in large
      const futureIdx = large.indexOf(small[si], li);
      if (futureIdx !== -1 && futureIdx - li < 10) {
        // Extra columns in large before the match
        while (li < futureIdx) {
          console.log(`  EXTRA in ${counts[counts.length - 1]}-col at idx ${li}: "${large[li]}"`);
          li++;
        }
      } else {
        // Different header
        console.log(`  DIFF at small[${si}]="${small[si] || '(end)'}" vs large[${li}]="${large[li]}"`);
        si++; li++;
      }
    } else {
      console.log(`  ONLY in ${counts[0]}-col at idx ${si}: "${small[si]}"`);
      si++;
    }
  }
}

// Also compare 92 vs 138
if (counts.length >= 3) {
  const h92 = groups[counts[0]].headers;
  const h138 = groups[counts[1]].headers;
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`HEADER COMPARISON: ${counts[0]}-col vs ${counts[1]}-col`);
  console.log(`${'='.repeat(80)}\n`);
  
  let si = 0, li = 0;
  while (si < h92.length || li < h138.length) {
    if (si < h92.length && li < h138.length && h92[si] === h138[li]) {
      si++; li++;
    } else if (li < h138.length) {
      const futureIdx = h138.indexOf(h92[si], li);
      if (futureIdx !== -1 && futureIdx - li < 15) {
        while (li < futureIdx) {
          console.log(`  EXTRA in ${counts[1]}-col at idx ${li}: "${h138[li]}"`);
          li++;
        }
      } else {
        console.log(`  DIFF at 92[${si}]="${h92[si] || '(end)'}" vs 138[${li}]="${h138[li]}"`);
        si++; li++;
      }
    } else {
      console.log(`  ONLY in ${counts[0]}-col at idx ${si}: "${h92[si]}"`);
      si++;
    }
  }
  
  // Show remaining in 138
  while (li < h138.length) {
    console.log(`  EXTRA in ${counts[1]}-col at idx ${li}: "${h138[li]}"`);
    li++;
  }
}

// Now compare 138 vs 158
if (counts.length >= 3) {
  const h138 = groups[counts[1]].headers;
  const h158 = groups[counts[2]].headers;
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`HEADER COMPARISON: ${counts[1]}-col vs ${counts[2]}-col`);
  console.log(`${'='.repeat(80)}\n`);
  
  let si = 0, li = 0;
  while (si < h138.length || li < h158.length) {
    if (si < h138.length && li < h158.length && h138[si] === h158[li]) {
      si++; li++;
    } else if (li < h158.length && si < h138.length) {
      const futureIdx = h158.indexOf(h138[si], li);
      if (futureIdx !== -1 && futureIdx - li < 15) {
        while (li < futureIdx) {
          console.log(`  EXTRA in ${counts[2]}-col at idx ${li}: "${h158[li]}"`);
          li++;
        }
      } else {
        console.log(`  DIFF at 138[${si}]="${h138[si]}" vs 158[${li}]="${h158[li]}"`);
        si++; li++;
      }
    } else if (li < h158.length) {
      console.log(`  EXTRA in ${counts[2]}-col at idx ${li}: "${h158[li]}"`);
      li++;
    } else {
      console.log(`  ONLY in ${counts[1]}-col at idx ${si}: "${h138[si]}"`);
      si++;
    }
  }
}

// Print ALL headers for each group 
for (const c of counts) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`ALL HEADERS FOR ${c}-col files:`);
  console.log(`${'='.repeat(80)}`);
  groups[c].headers.forEach((h, i) => console.log(`  [${String(i).padStart(3)}] ${h}`));
}
