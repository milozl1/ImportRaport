/**
 * End-to-end alignment audit: simulates the full merge pipeline for DSV CSV files
 * and verifies that the consolidated output has correct column alignment.
 * 
 * This script:
 * 1. Loads all 9 CSV files
 * 2. Runs the merge pipeline (with header alignment)
 * 3. Verifies that key columns contain the correct data type/values
 * 4. Cross-checks a few rows against source files
 */
import fs from 'fs';
import path from 'path';

const DSV_DIR = path.resolve('excel/DSV');

// ── Re-implement core functions from engine.js for Node testing ──

const synonyms = {
  'Registrienummer/MRN':               'Registriernummer/MRN',
  'Versender EORI':                    'Versender CZ EORI',
  'Versender Name':                    'CZ Name',
  'Versender Ländercode':              'CZ Ländercode',
  'Empfänger EORI':                    'Empfänger CN EORI',
  'Empfänger Name':                    'CN Name',
  'Empfänger Ländercode':              'CN Ländercode',
  'Anmelder EORI':                     'Anmelder DT EORI',
  'Anmelder Name':                     'DT Name',
  'Anmelder Ländercode':               'DT Ländercode',
  'Addressierte Zollstelle':           'Zollstelle',
  'AufschubHZAZoll':                   'HZAZoll',
  'AufschubkontoZoll':                 'KontoZoll',
  'AufschubTextZoll':                  'TextZoll',
  'AufschubEORIZoll':                  'EORIZoll',
  'AufschubKennzeichenEigenZoll':      'KennzeichenEigenZoll',
  'AufschubArtEust':                   'ArtEust',
  'AufschubHZAEust':                   'HZAEust',
  'AufschubKontoEusT':                 'KontoEusT',
  'AufschubTextEust':                  'TextEust',
  'AufschubEORIEust':                  'EORIEust',
  'AufschubKennzeichenEigenEust':      'KennzeichenEigenEust',
  'Vorraussichtliche Zollabgabe':      'Vorausstl. Zollabgabe',
  'Vorraussichtliche Zollsatzabgabe':  'Vorausstl. Zollsatzabgabe',
  'Vorraussichtliche Eustabgabe':      'Vorausstl. Eustabgabe',
  'Vorraussichtliche Eustsatzabgabe':  'Vorausstl. Eustsatzabgabe',
  'DV1Rechnugnswährung':               'Währung',
  'DV1UmrechnungsWährung':             'Währung',
  'DV1Versicherungswährung':            'Währung',
  'DV1Luftfrachtkostenwährung':         'Währung',
  'DV1Frachtkostenwährung':             'Währung',
  'DV1MaterialienWährung':              'Währung',
  'Vorpapiere Registriernummer':       'Vorpapiere Reg.nummer',
};

function parseCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  return lines.map(l => l.split(';').map(c => c.replace(/^"|"$/g, '')));
}

function buildUnifiedHeader(fileParts) {
  let widest = fileParts[0];
  for (const fp of fileParts) {
    if (fp.hRow.length > widest.hRow.length) widest = fp;
  }
  const unified = [...widest.hRow];
  for (const fp of fileParts) {
    if (fp === widest) continue;
    for (let i = 0; i < fp.hRow.length; i++) {
      const name = fp.hRow[i];
      if (!name) continue;
      const canonical = synonyms[name] || name;
      if (unified.includes(canonical)) continue;
      if (unified.includes(name)) continue;
      unified.push(name);
    }
  }
  return unified;
}

function buildColumnMapping(fileHeader, unified) {
  const mapping = new Array(fileHeader.length).fill(-1);
  const used = new Set();
  for (let fi = 0; fi < fileHeader.length; fi++) {
    const name = fileHeader[fi];
    if (!name) continue;
    for (let ui = 0; ui < unified.length; ui++) {
      if (!used.has(ui) && unified[ui] === name) {
        mapping[fi] = ui;
        used.add(ui);
        break;
      }
    }
  }
  for (let fi = 0; fi < fileHeader.length; fi++) {
    if (mapping[fi] !== -1) continue;
    const name = fileHeader[fi];
    if (!name) continue;
    const canonical = synonyms[name];
    if (!canonical) continue;
    for (let ui = 0; ui < unified.length; ui++) {
      if (!used.has(ui) && unified[ui] === canonical) {
        mapping[fi] = ui;
        used.add(ui);
        break;
      }
    }
  }
  return mapping;
}

function remapRow(row, mapping, width) {
  const out = new Array(width).fill(null);
  for (let fi = 0; fi < row.length && fi < mapping.length; fi++) {
    const ui = mapping[fi];
    if (ui >= 0) out[ui] = row[fi];
  }
  return out;
}

// ── Parse all CSV files ──
const csvFiles = fs.readdirSync(DSV_DIR)
  .filter(f => f.endsWith('.csv'))
  .sort();

const fileParts = [];
for (const f of csvFiles) {
  const rows = parseCSV(path.join(DSV_DIR, f));
  const hRow = rows[0].map(h => h.trim());
  const data = rows.slice(1).filter(r => {
    const nonEmpty = r.filter(c => c != null && c !== '');
    return nonEmpty.length >= 2;
  });
  fileParts.push({ name: f, hRow, data });
}

// ── Build unified header and merge ──
const unified = buildUnifiedHeader(fileParts);
const allData = [];
const fileRanges = []; // track which rows came from which file

for (const fp of fileParts) {
  const mapping = buildColumnMapping(fp.hRow, unified);
  const startIdx = allData.length;
  for (const row of fp.data) {
    allData.push(remapRow(row, mapping, unified.length));
  }
  fileRanges.push({ name: fp.name, start: startIdx, end: allData.length, colCount: fp.hRow.length });
}

console.log(`Unified header: ${unified.length} columns`);
console.log(`Total data rows: ${allData.length}`);
console.log(`Files: ${fileParts.map(f => `${f.name} (${f.hRow.length} cols, ${f.data.length} rows)`).join(', ')}`);

// ── Verification checks ──
let errors = 0;
let checks = 0;

function check(label, condition) {
  checks++;
  if (!condition) {
    console.log(`❌ ${label}`);
    errors++;
  } else {
    console.log(`✅ ${label}`);
  }
}

// Build header index lookup
const hIdx = {};
unified.forEach((h, i) => { if (h && !hIdx[h]) hIdx[h] = i; });

// Check 1: Every row should have a non-empty Teilnehmer (col 0)
const teilnehmerCol = hIdx['Teilnehmer'];
const emptyTeilnehmer = allData.filter(r => !r[teilnehmerCol] || r[teilnehmerCol] === '');
check(`All ${allData.length} rows have Teilnehmer value`, emptyTeilnehmer.length === 0);

// Check 2: Rechnungswährung should be a 3-letter currency code or empty
const rwCol = hIdx['Rechnungswährung'];
const badCurrency = allData.filter(r => {
  const v = r[rwCol];
  if (!v || v === '') return false;
  return !/^[A-Z]{3}$/.test(String(v).trim());
});
check(`Rechnungswährung always 3-letter code (or empty): ${badCurrency.length} violations`, badCurrency.length === 0);

// Check 3: Warentarifnummer should be numeric-ish (8-11 digits) or empty
const wtnCol = hIdx['Warentarifnummer'];
const badWTN = allData.filter(r => {
  const v = r[wtnCol];
  if (!v || v === '') return false;
  return !/^\d{8,11}$/.test(String(v).trim().replace(/\s/g, ''));
});
check(`Warentarifnummer valid (8-11 digits or empty): ${badWTN.length} violations`, badWTN.length === 0);

// Check 4: For 92-col files, verify renamed columns have correct data
// "Versender EORI" (92-col) should map to "Versender CZ EORI" column
// The 92-col file has data in its col 9 which should appear at unified "Versender CZ EORI"
const czEoriCol = hIdx['Versender CZ EORI'];
const cnEoriCol = hIdx['Empfänger CN EORI'];

// Sample from 92-col file (month 03, first data row)
const file92Range = fileRanges.find(fr => fr.colCount === 92);
if (file92Range) {
  const row = allData[file92Range.start];
  // Verify the row's MRN is in the correct place
  const mrnCol = hIdx['Registriernummer/MRN'];
  const mrnVal = row[mrnCol];
  check(`92-col file: MRN at correct position (non-empty)`, !!mrnVal && String(mrnVal).length > 5);
  
  // Verify Zollstelle has location-like text
  const zsCol = hIdx['Zollstelle'];
  const zsVal = row[zsCol];
  check(`92-col file: Zollstelle at correct position`, !!zsVal && String(zsVal).includes('DE'));
  
  // Cross-check: read original source and verify match
  const srcFile = fileParts.find(fp => fp.hRow.length === 92);
  const srcRow = srcFile.data[0];
  const srcMRNidx = srcFile.hRow.indexOf('Registrienummer/MRN'); // note: old spelling
  check(`92-col: original MRN value matches unified`, String(row[mrnCol]) === srcRow[srcMRNidx]);
  
  const srcRBidx = srcFile.hRow.indexOf('Rechnungsbetrag');
  const rbCol = hIdx['Rechnungsbetrag'];
  check(`92-col: original Rechnungsbetrag matches unified`, String(row[rbCol]) === srcRow[srcRBidx]);
}

// Check 5: For 158-col files, verify data in new columns
const file158Range = fileRanges.find(fr => fr.colCount === 158);
if (file158Range) {
  const row = allData[file158Range.start];
  
  // These columns only exist in 158-col format
  const ubCol = hIdx['Überlassungsdatum'];
  check(`158-col file: Überlassungsdatum column exists`, ubCol !== undefined);
  
  const anCol = hIdx['Annahmedatum'];
  check(`158-col file: Annahmedatum column exists`, anCol !== undefined);
  
  // Verify data from 92-col files has nulls in 158-only columns
  const row92 = allData[file92Range.start];
  check(`92-col data: Überlassungsdatum is null (column not in source)`, row92[ubCol] == null);
  check(`92-col data: Annahmedatum is null (column not in source)`, row92[anCol] == null);
}

// Check 6: No row should have data in the wrong column type
// Rechnungsbetrag should look numeric (European or dot-decimal)
const rbCol = hIdx['Rechnungsbetrag'];
const badRB = allData.filter(r => {
  const v = r[rbCol];
  if (!v || v === '') return false;
  const s = String(v).trim();
  // Should be numeric: digits with optional comma or dot decimal
  return !/^-?\d[\d.,]*$/.test(s);
});
check(`Rechnungsbetrag always numeric-like: ${badRB.length} violations`, badRB.length === 0);

// Check 7: AbgabeZollsatz should be numeric or empty
const azsCol = hIdx['AbgabeZollsatz'];
const badAZS = allData.filter(r => {
  const v = r[azsCol];
  if (!v || v === '') return false;
  const s = String(v).trim();
  return !/^-?\d[\d.,]*$/.test(s);
});
check(`AbgabeZollsatz always numeric-like: ${badAZS.length} violations`, badAZS.length === 0);

// Check 8: Container column should not have numeric data (it's a text field)
const contCol = hIdx['Container'];
// Actually containers can be alphanumeric, so just check it's not a currency/number
// that would indicate misalignment
const suspiciousContainer = allData.filter(r => {
  const v = r[contCol];
  if (!v || v === '') return false;
  const s = String(v).trim();
  // If Container contains something like "93,69" (a duty value), it's misaligned
  return /^\d+,\d{2}$/.test(s) && s.length < 10;
});
check(`Container has no duty-like values (misalignment indicator): ${suspiciousContainer.length}`, suspiciousContainer.length === 0);

console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${checks} checks, ${errors} errors`);
console.log(`  ${errors === 0 ? '✅ ALL ALIGNMENT CHECKS PASSED' : '❌ ERRORS FOUND'}`);
console.log(`${'═'.repeat(60)}`);
