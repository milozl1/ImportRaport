/**
 * Check what the DSV unified header looks like after mergeFiles.
 * This simulates the buildUnifiedHeader logic from engine.js.
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

const headerSynonyms = {
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

// Collect all unique header names across all files
const allHeaders = new Map();  // headerName → [file, col]

for (const file of files) {
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
      // Use sheetSelector logic
      let sheetName = wb.SheetNames[0];
      if (file.toLowerCase().includes('luft')) {
        const dataSheet = wb.SheetNames.find(n => /^(importzoll|hella)/i.test(n));
        if (dataSheet) sheetName = dataSheet;
      }
      const ws = wb.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    }

    const headers = (rows[0] || []).map(h => h != null ? String(h).trim() : '');
    
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;
      // Apply synonym
      const canonical = headerSynonyms[h] || h;
      if (!allHeaders.has(canonical)) {
        allHeaders.set(canonical, []);
      }
      allHeaders.get(canonical).push({ file: file.substring(0, 30), col: i });
    }
  } catch (e) {
    // skip
  }
}

// Now find the key analytics fields
const analyticsFields = {
  date:            ['Anlagedatum', 'Ãberlassungsdatum', 'Überlassungsdatum', 'Entry Date'],
  declarationNo:   ['Registriernummer/MRN', 'Registrienummer/MRN', 'Formal Entry Number'],
  shipperName:     ['CZ Name', 'Versender Name', 'Supplier Name / Shipper Name'],
  shipperCountry:  ['CZ Ländercode', 'Versender Ländercode', 'Shipping Country'],
  consigneeName:   ['CN Name', 'Empfänger Name', 'Importer Name'],
  consigneeCountry:['CN Ländercode', 'Empfänger Ländercode'],
  incoterm:        ['Liefercode', 'Incoterms'],
  invoiceValue:    ['Rechnungsbetrag', 'Invoice value'],
  currency:        ['Rechnungswährung', 'Invoice currency'],
  hsCode:          ['Warentarifnummer', 'HTS Code (Tariff Number)'],
  description:     ['Warenbezeichnung', 'Item Description'],
  countryOfOrigin: ['Ursprung', 'Country of Origin'],
  procedureCode:   ['Verfahren'],
  customsDuty:     ['AbgabeZoll', 'Vorausstl. Zollabgabe', 'Vorraussichtliche Zollabgabe', 'Duty Paid'],
  eustAmount:      ['AbgabeEust', 'Vorausstl. Eustabgabe', 'Vorraussichtliche Eustabgabe', 'VAT Paid'],
  grossWeight:     ['Rohmasse', 'Gross Mass (in kg)', 'Gesamtgewicht'],
  netWeight:       ['Eigenmasse', 'Net Mass (in kg)'],
  freightCost:     ['DV1Frachtkosten', 'DV1Luftfrachtkosten'],
};

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  DSV ANALYTICS FIELD RESOLUTION                             ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

for (const [field, candidates] of Object.entries(analyticsFields)) {
  console.log(`  ${field}:`);
  for (const c of candidates) {
    const canonical = headerSynonyms[c] || c;
    if (allHeaders.has(canonical)) {
      const locations = allHeaders.get(canonical);
      console.log(`    ✅ "${canonical}" → found in ${locations.length} files (cols: ${[...new Set(locations.map(l => l.col))].join(', ')})`);
    } else if (allHeaders.has(c)) {
      const locations = allHeaders.get(c);
      console.log(`    ✅ "${c}" → found in ${locations.length} files (cols: ${[...new Set(locations.map(l => l.col))].join(', ')})`);
    } else {
      console.log(`    ❌ "${c}" not found`);
    }
  }
}

// Show the Luftfracht headers that DON'T match any DSV headerMap
console.log('\n  ══════════════════════════════════════════════════');
console.log('  Luftfracht unique headers (not in Sea files):');
console.log('  ══════════════════════════════════════════════════');
for (const [header, locations] of allHeaders) {
  const isLuftOnly = locations.every(l => l.file.includes('Luft'));
  if (isLuftOnly) {
    console.log(`    "${header}" → cols: ${[...new Set(locations.map(l => l.col))].join(', ')} [${locations.map(l=>l.file.substring(0,25)).join(', ')}]`);
  }
}
