import fs from 'fs';
const DSV_DIR = 'excel/DSV';

function parseCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  return lines.map(l => l.split(';').map(c => c.replace(/^"|"$/g, '')));
}

const csvFiles = fs.readdirSync(DSV_DIR).filter(f => f.endsWith('.csv')).sort();
for (const f of csvFiles) {
  const rows = parseCSV(DSV_DIR + '/' + f);
  const data = rows.slice(1);
  const empty = data.filter(r => !r[0] || r[0].trim() === '');
  if (empty.length > 0) {
    console.log(f + ': ' + empty.length + ' rows with empty Teilnehmer');
    empty.slice(0, 3).forEach((r, i) => {
      const nonEmpty = r.filter(c => c != null && c !== '').length;
      console.log('  Row ' + i + ': ' + nonEmpty + ' non-empty cells, first: "' + (r.find(c => c && c !== '') || '') + '"');
    });
  }
  
  // Also check Rechnungsbetrag (col 23 in 92-col, col 42 in 158-col)
  const hdr = rows[0];
  const rbIdx = hdr.indexOf('Rechnungsbetrag');
  const rwIdx = hdr.indexOf('Rechnungswährung');
  if (rbIdx >= 0) {
    const badRB = data.filter(r => {
      const v = r[rbIdx];
      if (!v || v === '') return false;
      return !/^-?\d[\d.,]*$/.test(v.trim());
    });
    const badRW = data.filter(r => {
      const v = r[rwIdx];
      if (!v || v === '') return false;
      return !/^[A-Z]{3}$/.test(v.trim());
    });
    if (badRB.length > 0) {
      console.log(f + ': ' + badRB.length + ' rows with non-numeric Rechnungsbetrag');
      badRB.slice(0, 3).forEach((r, i) => {
        console.log('  RB="' + r[rbIdx] + '"  RW="' + r[rwIdx] + '"');
      });
    }
    if (badRW.length > 0) {
      console.log(f + ': ' + badRW.length + ' rows with bad Rechnungswährung');
      badRW.slice(0, 3).forEach((r, i) => {
        console.log('  RW="' + r[rwIdx] + '"  RB="' + r[rbIdx] + '"');
      });
    }
  }
}
