import fs from 'fs';
const DSV_DIR = 'excel/DSV';

function parseCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  return lines.map(l => l.split(';').map(c => c.replace(/^"|"$/g, '')));
}

// Deep-dive into position rows (empty Teilnehmer) in 92-col files
const file = 'IMP-HELLA-03-2025 DSV Sea.csv';
const rows = parseCSV(DSV_DIR + '/' + file);
const hdr = rows[0];
const data = rows.slice(1);

console.log('Header (92 cols):');
hdr.forEach((h, i) => console.log('  [' + String(i).padStart(2) + '] ' + h));

console.log('\n\nSample NORMAL row (Teilnehmer non-empty):');
const normalRow = data.find(r => r[0] && r[0].trim() !== '');
if (normalRow) {
  for (let i = 0; i < hdr.length; i++) {
    if (normalRow[i] && normalRow[i] !== '') {
      console.log('  [' + String(i).padStart(2) + '] ' + hdr[i].padEnd(40) + ' = "' + normalRow[i] + '"');
    }
  }
}

console.log('\n\nSample POSITION row (Teilnehmer empty):');
const posRow = data.find(r => !r[0] || r[0].trim() === '');
if (posRow) {
  for (let i = 0; i < posRow.length; i++) {
    if (posRow[i] && posRow[i] !== '') {
      console.log('  [' + String(i).padStart(2) + '] ' + (hdr[i] || '???').padEnd(40) + ' = "' + posRow[i] + '"');
    }
  }
}

// Check: are all position rows shifted in the same way?
const posRows = data.filter(r => !r[0] || r[0].trim() === '');
console.log('\n\nAll position rows Rechnungsbetrag (col 23) values:');
const rbValues = new Set();
posRows.forEach(r => {
  if (r[23]) rbValues.add(r[23].substring(0, 30));
});
console.log('  Unique values:', [...rbValues].slice(0, 20).join(', '));

console.log('\nAll position rows Rechnungswährung (col 24) values:');
const rwValues = new Set();
posRows.forEach(r => {
  if (r[24]) rwValues.add(r[24].substring(0, 30));
});
console.log('  Unique values:', [...rwValues].slice(0, 20).join(', '));

// Compare with a 158-col position row
console.log('\n\n═══ 158-col file position row ═══');
const file158 = 'IMP-HELLA-06-2025 DSV Sea.csv';
const rows158 = parseCSV(DSV_DIR + '/' + file158);
const hdr158 = rows158[0];
const data158 = rows158.slice(1);
const posRow158 = data158.find(r => !r[0] || r[0].trim() === '');
if (posRow158) {
  for (let i = 0; i < posRow158.length; i++) {
    if (posRow158[i] && posRow158[i] !== '') {
      console.log('  [' + String(i).padStart(3) + '] ' + (hdr158[i] || '???').padEnd(40) + ' = "' + posRow158[i] + '"');
    }
  }
}
