/**
 * Test script: verify that DSV header alignment works correctly.
 * Simulates what mergeFiles does — parses all DSV CSV files,
 * builds unified header, remaps data, and checks alignment.
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const DSV_DIR = path.resolve('excel/DSV');

function parseCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  return lines.map(l => {
    // Simple semicolon split (no quoted-field handling needed for headers)
    return l.split(';').map(c => c.replace(/^"|"$/g, ''));
  });
}

// Import the synonym map from brokers config
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

// Re-implement the alignment functions for testing
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
  
  // Pass 1: exact match
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
  
  // Pass 2: synonym match
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

// Parse CSV files
const csvFiles = fs.readdirSync(DSV_DIR)
  .filter(f => f.endsWith('.csv'))
  .sort();

const fileParts = [];
for (const f of csvFiles) {
  const rows = parseCSV(path.join(DSV_DIR, f));
  const hRow = rows[0].map(h => h.trim());
  const data = rows.slice(1);
  fileParts.push({ name: f, hRow, data, headers: [hRow] });
}

// Build unified header
const unified = buildUnifiedHeader(fileParts);
console.log(`Unified header: ${unified.length} columns`);

// For each file, build mapping and check
let errors = 0;
for (const fp of fileParts) {
  const mapping = buildColumnMapping(fp.hRow, unified);
  const unmapped = [];
  for (let i = 0; i < fp.hRow.length; i++) {
    if (fp.hRow[i] && mapping[i] === -1) {
      unmapped.push(`[${i}] "${fp.hRow[i]}"`);
    }
  }
  
  if (unmapped.length > 0) {
    console.log(`\n❌ ${fp.name} (${fp.hRow.length} cols): ${unmapped.length} UNMAPPED columns:`);
    unmapped.forEach(u => console.log(`   ${u}`));
    errors += unmapped.length;
  } else {
    console.log(`✅ ${fp.name} (${fp.hRow.length} cols): all columns mapped`);
  }
  
  // Verify specific columns are correctly mapped
  // For a 92-col file, check that "Rechnungsbetrag" maps to the same unified position
  // as "Rechnungsbetrag" in a 158-col file
  const rbIdx92 = fp.hRow.indexOf('Rechnungsbetrag');
  if (rbIdx92 !== -1) {
    const unifiedIdx = mapping[rbIdx92];
    const unifiedName = unified[unifiedIdx];
    if (unifiedName !== 'Rechnungsbetrag') {
      console.log(`   ❌ Rechnungsbetrag at file[${rbIdx92}] maps to unified[${unifiedIdx}]="${unifiedName}" (expected "Rechnungsbetrag")`);
      errors++;
    }
  }
}

// Check that all files' "Rechnungsbetrag" maps to the same unified column
const rbPositions = new Set();
for (const fp of fileParts) {
  const mapping = buildColumnMapping(fp.hRow, unified);
  const rbIdx = fp.hRow.indexOf('Rechnungsbetrag');
  if (rbIdx !== -1) rbPositions.add(mapping[rbIdx]);
}
console.log(`\nRechnungsbetrag maps to unified position(s): ${[...rbPositions].join(', ')}`);
if (rbPositions.size !== 1) {
  console.log('❌ ERROR: Rechnungsbetrag maps to different positions!');
  errors++;
} else {
  console.log('✅ All files map Rechnungsbetrag to the same position');
}

// Check a renamed column: "Versender EORI" (92-col) should map to same as "Versender CZ EORI" (158-col)
const vsPositions = new Set();
for (const fp of fileParts) {
  const mapping = buildColumnMapping(fp.hRow, unified);
  let idx = fp.hRow.indexOf('Versender CZ EORI');
  if (idx === -1) idx = fp.hRow.indexOf('Versender EORI');
  if (idx !== -1) vsPositions.add(mapping[idx]);
}
console.log(`\nVersender EORI/CZ maps to unified position(s): ${[...vsPositions].join(', ')}`);
if (vsPositions.size !== 1) {
  console.log('❌ ERROR: Versender EORI maps to different positions!');
  errors++;
} else {
  console.log('✅ All files map Versender EORI to the same position');
}

// Verify data alignment with a sample row
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('DATA ALIGNMENT CHECK: Row 1 from a 92-col file vs a 158-col file');
console.log('═══════════════════════════════════════════════════════════════');

const file92 = fileParts.find(fp => fp.hRow.length === 92);
const file158 = fileParts.find(fp => fp.hRow.length === 158);

if (file92 && file158) {
  const map92 = buildColumnMapping(file92.hRow, unified);
  const map158 = buildColumnMapping(file158.hRow, unified);
  
  const row92 = new Array(unified.length).fill(null);
  const row158 = new Array(unified.length).fill(null);
  
  for (let i = 0; i < file92.data[0].length && i < map92.length; i++) {
    if (map92[i] >= 0) row92[map92[i]] = file92.data[0][i];
  }
  for (let i = 0; i < file158.data[0].length && i < map158.length; i++) {
    if (map158[i] >= 0) row158[map158[i]] = file158.data[0][i];
  }
  
  // Show a few key columns side by side
  const checkCols = ['Teilnehmer', 'Rechnungsbetrag', 'Rechnungswährung', 'Zollstelle', 
    'Container', 'AbgabeZoll', 'Warentarifnummer', 'Warenbezeichnung',
    'DV1Rechnungsbetrag', 'Versender CZ EORI', 'Empfänger CN EORI',
    'Registriernummer/MRN'];
  
  for (const col of checkCols) {
    const ui = unified.indexOf(col);
    if (ui === -1) { console.log(`   "${col}" not in unified header`); continue; }
    console.log(`  [${String(ui).padStart(3)}] ${col.padEnd(30)} 92-col: "${row92[ui] || ''}"  |  158-col: "${row158[ui] || ''}"`);
  }
}

console.log(`\n${errors === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${errors} ERRORS FOUND`}`);
