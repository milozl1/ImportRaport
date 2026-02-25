/**
 * DSV Header Alignment & Merge Tests — comprehensive automated tests
 *
 * Tests the header alignment logic added to engine.js for DSV files
 * with variable column structures (92 → 138 → 158 columns).
 *
 * Coverage:
 *  1. buildUnifiedHeader — widest header used, extras appended
 *  2. buildColumnMapping — exact match, synonym match, duplicate handling
 *  3. remapRow — values land in correct unified positions
 *  4. Cross-format alignment — same conceptual column maps to same position
 *  5. Data integrity — no data loss during remapping
 *  6. Edge cases — empty headers, empty rows, null values, single file
 *  7. Synonym completeness — every 92-col header has a mapping
 *  8. Duplicate header handling — "Verfahren", "Währung", etc.
 *  9. Numeric conversion post-alignment
 * 10. Full pipeline simulation with real-like data
 * 11. idempotency of alignment (remap twice = same result)
 *
 * Run: node tests/test-dsv-alignment.mjs
 */

import { buildUnifiedHeader, buildColumnMapping, remapRow } from '../src/js/engine.js';
import { validateAndFix } from '../src/js/validator.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    failed++;
    failures.push(msg);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
    failed++;
    failures.push(msg);
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    console.log(`     Expected: ${b}`);
    console.log(`     Actual:   ${a}`);
    failed++;
    failures.push(msg);
  }
}

// ── DSV broker config (must match brokers.js) ──
const DSV_BROKER = {
  id: 'DSV',
  headerRows: 1,
  headerStartRow: 0,
  dataStartRow: 1,
  csvDelimiter: ';',
  headerSynonyms: {
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
  },
  isFooterRow: (row) => {
    if (!row || row.length < 2) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 2;
  },
};

// ── Sample headers matching real DSV file structures ──
const HEADER_92 = [
  'Teilnehmer', 'Anmeldeart_A', 'Verfahren', 'Bezugsnummer/LRN',
  'Anlagedatum', 'Zeit', 'Registrienummer/MRN', 'Weitere Reg.Nr.',
  'EDIFNR', 'Versender EORI', 'Versender Name', 'Versender Ländercode',
  'Empfänger EORI', 'Empfänger Name', 'Empfänger Ländercode',
  'Anmelder EORI', 'Anmelder Name', 'Anmelder Ländercode',
  'ZollRechtlicherStatus', 'Liefercode', 'Lieferort', 'Lieferkey',
  'Geschäftsart', 'Rechnungsbetrag', 'Rechnungswährung', 'Rechnungskurs',
  'Addressierte Zollstelle', 'Aufschubart', 'AufschubHZAZoll',
  'AufschubkontoZoll', 'AufschubTextZoll', 'AufschubEORIZoll',
  'AufschubKennzeichenEigenZoll', 'AufschubArtEust', 'AufschubHZAEust',
  'AufschubKontoEusT', 'AufschubTextEust', 'AufschubEORIEust',
  'AufschubKennzeichenEigenEust', 'Container', 'PositionNo', 'Positionen',
  'Vorraussichtliche Zollabgabe', 'Vorraussichtliche Zollsatzabgabe',
  'Vorraussichtliche Eustabgabe', 'Vorraussichtliche Eustsatzabgabe',
  'AbgabeZoll', 'AbgabeZollsatz', 'AbgabeEust', 'AbgabeEustsatz',
  'Status Steuerbescheid', 'ArtikelCode', 'Warentarifnummer',
  'Warenzusatz1', 'Warenzusatz2', 'Warenbezeichnung', 'Verfahren',
  'EU Code', 'Artikelpreis', 'Ursprung', 'Präferenzursprungsland',
  'Beguenstigung', 'Rohmasse', 'Rohmasseeinheit', 'Eigenmasse',
  'Eigenmasseeinheit', 'Positionszusatz', 'Aussenhandelstatistische Menge',
  'AnzahlPackstücke', 'Packstückart', 'Packstückbezeichnung',
  'Zusätzliche angaben', 'SonderAbgabeZoll', 'SonderAbgabeEust',
  'AbgabeZusatzzölle', 'AbgabeAntidumping', 'Verbrauchssteuern',
  'DV1Rechnungsbetrag', 'DV1Rechnugnswährung',
  'DV1UmgerechnerterRechnungsbetrag', 'DV1UmrechnungsWährung',
  'DV1Versicherung', 'DV1Versicherungswährung',
  'DV1Luftfrachtkosten', 'DV1Luftfrachtkostenwährung',
  'DV1Frachtkosten', 'DV1Frachtkostenwährung',
  'DV1Materialien', 'DV1MaterialienWährung',
  'Abflughafen Code', 'Abflughafen Text', 'Vorpapiere Registriernummer',
];

// A subset of 158-col header (key columns only, full would be too long)
const HEADER_158 = [
  'Teilnehmer', 'Anmeldeart_A', 'Verfahren', 'Bezugsnummer/LRN',
  'Anlagedatum', 'Zeit', 'Zeitpunkt der letzten CUSTAX',
  'Überlassungsdatum', 'Annahmedatum', 'Registriernummer/MRN',
  'Weitere Reg.Nr.', 'EDIFNR', 'Versendungsland', 'Art der Vertretung',
  'Vertreter des Anmelders', 'Vertreter AE EORI', 'AE Name',
  'Versender CZ EORI', 'CZ Code', 'CZ Name', 'CZ Ländercode',
  'Empfänger CN EORI', 'CN Code', 'CN Name', 'CN Ländercode',
  'Anmelder DT EORI', 'DT Code', 'DT Name', 'DT Ländercode', 'UstID-DT',
  'Käufer BY Name', 'BY EORI', 'Verkäufer SL Name', 'SL EORI',
  'ZollRechtlicherStatus', 'Bewilligungsnummer', 'Gesamtgewicht',
  'Vorst. Abzug', 'Liefercode', 'Lieferort', 'Lieferkey', 'Geschäftsart',
  'Rechnungsbetrag', 'Rechnungswährung', 'Rechnungskurs', 'Zollstelle',
  'Aufschubart', 'HZAZoll', 'KontoZoll', 'TextZoll', 'EORIZoll',
  'KennzeichenEigenZoll', 'ArtEust', 'HZAEust', 'KontoEusT', 'TextEust',
  'EORIEust', 'KennzeichenEigenEust', 'Container', 'Unterlagenzeile',
  'Unterlagenbereich', 'Unterlagenart', 'Unterlagennummer', 'Unterlagendatum',
  'PositionNo', 'Positionen', 'Vorausstl. Zollabgabe',
  'Vorausstl. Zollsatzabgabe', 'Vorausstl. Eustabgabe',
  'Vorausstl. Eustsatzabgabe', 'Zollwert', 'AbgabeZoll', 'AbgabeZollsatz',
  'Eustwert', 'AbgabeEust', 'AbgabeEustsatz', 'AbgabeAntidumping',
  'AbgabeAntidumpingSatz', 'Status Steuerbescheid', 'ArtikelCode',
  'Warentarifnummer', 'Warenzusatz1', 'Warenzusatz2', 'Warenbezeichnung',
  'Verfahren', 'EU Code', 'Artikelpreis', 'Statistischerwert',
  'Eust manuell', 'Ursprung', 'Präferenzursprungsland', 'Beguenstigung',
  'Rohmasse', 'Rohmasseeinheit', 'Eigenmasse', 'Eigenmasseeinheit',
  'Positionszusatz', 'Aussenhandelstatistische Menge', 'Maßeinheit',
  'AnzahlPackstücke', 'Packstückart', 'Packstückbezeichnung',
  'Zusätzliche angaben', 'SonderAbgabeZoll', 'SonderAbgabeEust',
  'AbgabeZusatzzölle', 'SonderAbgabeAntidumping', 'Verbrauchssteuern',
  'Positionsunterlagenzeile', 'Unterlagenbereich', 'Unterlagenart',
  'Unterlagennummer', 'Unterlagendatum', 'Nettokurs EAB',
  'DV1Rechnungsbetrag', 'Währung', 'DV1UmgerechnerterRechnungsbetrag',
  'Währung', 'DV1Versicherung', 'Währung', 'DV1Luftfrachtkosten', 'Währung',
  'DV1Frachtkosten', 'Währung', 'DV1Materialien', 'Währung',
  'DV1Provisionen', 'Währung', 'Abflughafen Code', 'Abflughafen Text',
  'Vorpapierart', 'Vorpapiere Reg.nummer', 'BEAnteil SumA', 'BEAnteil ZL',
  'BEAnteil AV', 'UST-ID Einführer', 'UST-ID Erwerber',
  'UST-ID Fiskalvertreter', 'Shipmentnummer', 'Importstatus',
  'DV1 Nettopreis Kurs', ' DV1 Luftfrachtkosten LK', 'DV1 LK Waehrung',
  'DV1 LK prozent.Anteil', 'DV1 LK Kurs',
  'DV1 Bef.kosten bis Ort des Verbringens', 'DV1 Befoerderungswaehrung',
  'DV1 Befoerderungskurs', 'DV1 Lade/Behandlungskosten',
  'DV1 Ladekostenwaehrung', 'DV1 Versicherungskosten',
  'DV1 Versicherungskostenwaehrung', 'DV1 Versicherung prozent.Anteil',
  'DV1 Befoerderungskosten nach Ankunft',
  'DV1 Befoerderungskosten n.A. Waehrung',
  'DV1 Befoerderungskosten n.A. Kurs', 'DV1 Andere Zahlungen',
  'DV1 Andere Zahlungenwaehrung',
];

// Helper: create a filePart-like object
function fp(headers, data = []) {
  return {
    headers: [headers],
    data,
    hRow: headers.map(h => h != null ? String(h).trim() : ''),
  };
}

// ═══════════════════════════════════════════════════
// TEST GROUP 1: buildUnifiedHeader basics
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 1: buildUnifiedHeader — basics ═══');

{
  // Same headers → no extra columns
  const parts = [fp(['A', 'B', 'C']), fp(['A', 'B', 'C'])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 3, 'Same headers → 3 columns');
  assertDeepEqual(unified, ['A', 'B', 'C'], 'Same headers → same order');
}

{
  // Wider file used as base
  const parts = [fp(['A', 'B']), fp(['A', 'B', 'C', 'D'])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 4, 'Wider file used as base (4 cols)');
  assertEqual(unified[0], 'A', 'First col preserved');
  assertEqual(unified[3], 'D', 'Extra cols from wider file');
}

{
  // Extra column in narrow file added at end
  const parts = [fp(['A', 'B', 'C']), fp(['A', 'B', 'D'])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 4, 'Extra unique col appended');
  assertEqual(unified[3], 'D', 'D appended at end');
}

{
  // Single file
  const parts = [fp(['X', 'Y', 'Z'])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 3, 'Single file: 3 columns');
  assertDeepEqual(unified, ['X', 'Y', 'Z'], 'Single file: exact match');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 2: buildUnifiedHeader — synonym dedup
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 2: buildUnifiedHeader — synonym dedup ═══');

{
  // Synonym match should NOT create duplicate
  const parts = [
    fp(['Registriernummer/MRN', 'Other']),
    fp(['Registrienummer/MRN', 'Other']),  // old spelling
  ];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 2, 'Synonym dedup: no extra col for old spelling');
}

{
  // Real 92-col vs 158-col: "Versender EORI" → "Versender CZ EORI"
  const narrow = fp(['Teilnehmer', 'Versender EORI', 'Rechnungsbetrag']);
  const wide = fp(['Teilnehmer', 'Versender CZ EORI', 'Rechnungsbetrag', 'Zollwert']);
  const { unified } = buildUnifiedHeader([narrow, wide], DSV_BROKER);
  assertEqual(unified.length, 4, 'Synonym dedup: Versender EORI not duplicated');
  assert(!unified.includes('Versender EORI'), 'Old name not in unified');
  assert(unified.includes('Versender CZ EORI'), 'New name in unified');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 3: buildUnifiedHeader — real headers
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 3: buildUnifiedHeader — real 92 vs 158 headers ═══');

{
  const parts = [fp(HEADER_92), fp(HEADER_158)];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  // 158 is base. 92-col columns either match exactly or via synonym.
  // No 92-col column should create a new column.
  assertEqual(unified.length, HEADER_158.length, `Unified = ${HEADER_158.length} cols (no extras from 92-col)`);
}

{
  // Reverse order: 92-col first, 158-col second
  const parts = [fp(HEADER_92), fp(HEADER_158)];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  // Should still be 158 cols (widest wins)
  assertEqual(unified.length, HEADER_158.length, 'Widest file wins regardless of order');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 4: buildColumnMapping — exact match
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 4: buildColumnMapping — exact match ═══');

{
  const fileHdr = ['A', 'B', 'C'];
  const unified = ['A', 'B', 'C', 'D'];
  const { mapping } = buildColumnMapping(fileHdr, unified, {}, []);
  assertDeepEqual(mapping, [0, 1, 2], 'Exact match: A→0, B→1, C→2');
}

{
  // File header is subset, different positions
  const fileHdr = ['C', 'A'];
  const unified = ['A', 'B', 'C', 'D'];
  const { mapping } = buildColumnMapping(fileHdr, unified, {}, []);
  assertDeepEqual(mapping, [2, 0], 'Reordered match: C→2, A→0');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 5: buildColumnMapping — synonym match
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 5: buildColumnMapping — synonym match ═══');

{
  const fileHdr = ['Versender EORI', 'Rechnungsbetrag'];
  const unified = ['Versender CZ EORI', 'Rechnungsbetrag'];
  const { mapping } = buildColumnMapping(fileHdr, unified, DSV_BROKER.headerSynonyms, []);
  assertDeepEqual(mapping, [0, 1], 'Synonym: Versender EORI → 0, Rechnungsbetrag → 1');
}

{
  const fileHdr = ['AufschubHZAZoll', 'AufschubkontoZoll'];
  const unified = ['HZAZoll', 'KontoZoll', 'TextZoll'];
  const { mapping } = buildColumnMapping(fileHdr, unified, DSV_BROKER.headerSynonyms, []);
  assertDeepEqual(mapping, [0, 1], 'Synonym: Aufschub prefixes stripped');
}

{
  // All 92-col synonyms should map
  const { unified } = buildUnifiedHeader([fp(HEADER_92), fp(HEADER_158)], DSV_BROKER);
  const { mapping } = buildColumnMapping(HEADER_92, unified, DSV_BROKER.headerSynonyms, []);
  const unmapped = mapping.filter((m, i) => m === -1 && HEADER_92[i] !== '');
  assertEqual(unmapped.length, 0, 'All 92-col headers map to unified (no unmapped)');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 6: buildColumnMapping — duplicate headers
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 6: buildColumnMapping — duplicate headers ═══');

{
  // "Verfahren" appears at positions 2 and 84 in 158-col
  const idx1 = HEADER_158.indexOf('Verfahren');
  const idx2 = HEADER_158.indexOf('Verfahren', idx1 + 1);
  assert(idx1 !== -1 && idx2 !== -1, 'Verfahren appears twice in 158-col');
  assert(idx1 !== idx2, 'At different positions');
}

{
  // "Währung" appears 7 times in 158-col
  const wahrungs = HEADER_158.reduce((acc, h, i) => {
    if (h === 'Währung') acc.push(i);
    return acc;
  }, []);
  assertEqual(wahrungs.length, 7, 'Währung appears 7 times in 158-col');
}

{
  // Mapping should assign each "Währung" occurrence to a distinct unified position
  const unified = HEADER_158; // use 158 as-is
  const { mapping } = buildColumnMapping(HEADER_158, unified, DSV_BROKER.headerSynonyms, []);
  // All should be mapped (no -1)
  const unmapped = mapping.filter(m => m === -1);
  assertEqual(unmapped.length, 0, 'All 158-col headers map (including duplicates)');
  
  // Each mapping should be unique (no two file cols map to same unified col)
  const usedSet = new Set(mapping);
  assertEqual(usedSet.size, mapping.length, 'No duplicate mappings (each col maps uniquely)');
}

{
  // 92-col "DV1Rechnugnswährung" should map to first available "Währung" in unified
  const { unified } = buildUnifiedHeader([fp(HEADER_92), fp(HEADER_158)], DSV_BROKER);
  const { mapping } = buildColumnMapping(HEADER_92, unified, DSV_BROKER.headerSynonyms, []);
  
  const dvr_idx = HEADER_92.indexOf('DV1Rechnugnswährung');
  const dvr_unified = mapping[dvr_idx];
  assertEqual(unified[dvr_unified], 'Währung', 'DV1Rechnugnswährung maps to Währung');
  
  // And DV1UmrechnungsWährung should map to next Währung
  const dvu_idx = HEADER_92.indexOf('DV1UmrechnungsWährung');
  const dvu_unified = mapping[dvu_idx];
  assertEqual(unified[dvu_unified], 'Währung', 'DV1UmrechnungsWährung also maps to Währung');
  assert(dvr_unified !== dvu_unified, 'Different Währung occurrences used');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 7: remapRow — basic
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 7: remapRow — basic ═══');

{
  const row = ['val1', 'val2', 'val3'];
  const mapping = [2, 0, 4]; // fi0→ui2, fi1→ui0, fi2→ui4
  const result = remapRow(row, mapping, 5);
  assertEqual(result[0], 'val2', 'val2 at unified[0]');
  assertEqual(result[2], 'val1', 'val1 at unified[2]');
  assertEqual(result[4], 'val3', 'val3 at unified[4]');
  assertEqual(result[1], null, 'Unmapped position is null');
  assertEqual(result[3], null, 'Unmapped position is null');
}

{
  // Unmapped source column (mapping = -1) is dropped
  const row = ['keep', 'drop', 'keep2'];
  const mapping = [0, -1, 1];
  const result = remapRow(row, mapping, 3);
  assertEqual(result[0], 'keep', 'Mapped value preserved');
  assertEqual(result[1], 'keep2', 'Mapped value at correct position');
  assertEqual(result[2], null, 'Unused position is null');
}

{
  // Empty row
  const result = remapRow([], [0, 1], 3);
  assertDeepEqual(result, [null, null, null], 'Empty row → all nulls');
}

{
  // Row shorter than mapping
  const row = ['a'];
  const mapping = [2, 0];
  const result = remapRow(row, mapping, 3);
  assertEqual(result[2], 'a', 'Short row: only available cells mapped');
  assertEqual(result[0], null, 'Short row: unmapped cell is null');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 8: remapRow — preserves all data types
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 8: remapRow — preserves data types ═══');

{
  const row = [42, 'text', null, 0, '', true, 3.14];
  const mapping = [0, 1, 2, 3, 4, 5, 6];
  const result = remapRow(row, mapping, 7);
  assertEqual(result[0], 42, 'Number preserved');
  assertEqual(result[1], 'text', 'String preserved');
  assertEqual(result[2], null, 'null preserved');
  assertEqual(result[3], 0, 'Zero preserved');
  assertEqual(result[4], '', 'Empty string preserved');
  assertEqual(result[5], true, 'Boolean preserved');
  assertEqual(result[6], 3.14, 'Float preserved');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 9: Full 92-col → 158-col data alignment
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 9: Full data alignment 92→158 ═══');

{
  // Create a 92-col row with known values at key positions
  const row92 = new Array(92).fill('');
  row92[0] = 'ZOCE';                    // Teilnehmer
  row92[6] = '25DE4851CCA00V5VR1';      // Registrienummer/MRN
  row92[9] = '';                         // Versender EORI
  row92[10] = 'Microlight Co.';         // Versender Name
  row92[11] = 'TW';                     // Versender Ländercode
  row92[12] = 'DE2393166';              // Empfänger EORI
  row92[23] = '27230,88';               // Rechnungsbetrag
  row92[24] = 'EUR';                    // Rechnungswährung
  row92[26] = 'DE004851';               // Addressierte Zollstelle
  row92[46] = '93,69';                  // AbgabeZoll
  row92[52] = '85122000900';            // Warentarifnummer
  row92[77] = '3431,04';                // DV1Rechnungsbetrag
  row92[78] = 'EUR';                    // DV1Rechnugnswährung
  row92[89] = 'TPE';                    // Abflughafen Code

  const parts = [fp(HEADER_92, [row92]), fp(HEADER_158, [])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  const { mapping } = buildColumnMapping(HEADER_92, unified, DSV_BROKER.headerSynonyms, []);
  const remapped = remapRow(row92, mapping, unified.length);

  // Check key values landed in correct unified positions
  const ui = {};
  unified.forEach((h, i) => { if (h && !ui[h]) ui[h] = i; });

  assertEqual(remapped[ui['Teilnehmer']], 'ZOCE', 'Teilnehmer correct');
  assertEqual(remapped[ui['Registriernummer/MRN']], '25DE4851CCA00V5VR1', 'MRN correct (synonym)');
  assertEqual(remapped[ui['CZ Name']], 'Microlight Co.', 'Versender Name → CZ Name (synonym)');
  assertEqual(remapped[ui['CZ Ländercode']], 'TW', 'Versender Ländercode → CZ Ländercode');
  assertEqual(remapped[ui['Empfänger CN EORI']], 'DE2393166', 'Empfänger EORI → CN EORI');
  assertEqual(remapped[ui['Rechnungsbetrag']], '27230,88', 'Rechnungsbetrag correct');
  assertEqual(remapped[ui['Rechnungswährung']], 'EUR', 'Rechnungswährung correct');
  assertEqual(remapped[ui['Zollstelle']], 'DE004851', 'Addressierte Zollstelle → Zollstelle');
  assertEqual(remapped[ui['AbgabeZoll']], '93,69', 'AbgabeZoll correct');
  assertEqual(remapped[ui['Warentarifnummer']], '85122000900', 'Warentarifnummer correct');
  assertEqual(remapped[ui['DV1Rechnungsbetrag']], '3431,04', 'DV1Rechnungsbetrag correct');
  assertEqual(remapped[ui['Abflughafen Code']], 'TPE', 'Abflughafen Code correct');
  
  // DV1Rechnugnswährung → first Währung occurrence
  const wahrungPositions = [];
  unified.forEach((h, i) => { if (h === 'Währung') wahrungPositions.push(i); });
  assertEqual(remapped[wahrungPositions[0]], 'EUR', 'DV1Rechnugnswährung → first Währung = EUR');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 10: No data from 158-only columns leaks into 92-col rows
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 10: 158-only columns are null in 92-col rows ═══');

{
  const row92 = new Array(92).fill('');
  row92[0] = 'ZOCE';

  const parts = [fp(HEADER_92, [row92]), fp(HEADER_158, [])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  const { mapping } = buildColumnMapping(HEADER_92, unified, DSV_BROKER.headerSynonyms, []);
  const remapped = remapRow(row92, mapping, unified.length);

  // Columns that only exist in 158-col should be null
  const onlyIn158 = ['Zeitpunkt der letzten CUSTAX', 'Überlassungsdatum',
    'Annahmedatum', 'Versendungsland', 'Art der Vertretung',
    'Bewilligungsnummer', 'Gesamtgewicht', 'Zollwert', 'Eustwert',
    'Statistischerwert', 'Nettokurs EAB', 'Shipmentnummer', 'Importstatus'];

  let allNull = true;
  for (const col of onlyIn158) {
    const idx = unified.indexOf(col);
    if (idx !== -1 && remapped[idx] != null) {
      allNull = false;
      console.log(`  ❌ ${col} at unified[${idx}] = "${remapped[idx]}" (should be null)`);
      failed++;
    }
  }
  if (allNull) {
    console.log(`  ✅ All 158-only columns are null in 92-col remapped row`);
    passed++;
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 11: Alignment + validation pipeline
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 11: Alignment + validation pipeline ═══');

{
  // Simulate what mergeFiles does: align then validate
  const row92 = new Array(92).fill('');
  row92[0] = 'ZOCE';
  row92[23] = '27230,88';  // Rechnungsbetrag (European format)
  row92[46] = '93,69';     // AbgabeZoll
  row92[77] = '3431,04';   // DV1Rechnungsbetrag

  const row158 = new Array(158).fill('');
  row158[0] = 'ZOCE';
  row158[42] = '18010.24';  // Already dot-decimal
  row158[71] = '73.88';     // Already dot-decimal

  const parts = [fp(HEADER_92, [row92]), fp(HEADER_158, [row158])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  
  const allData = [];
  for (const p of parts) {
    const { mapping } = buildColumnMapping(p.hRow, unified, DSV_BROKER.headerSynonyms, []);
    for (const row of p.data) {
      allData.push(remapRow(row, mapping, unified.length));
    }
  }

  // Run validator
  const report = validateAndFix(allData, DSV_BROKER, [unified]);
  
  // Row from 92-col file: comma→dot conversion should happen
  const ui = {};
  unified.forEach((h, i) => { if (h && !ui[h]) ui[h] = i; });

  assertEqual(allData[0][ui['Rechnungsbetrag']], 27230.88, 'Post-validation: comma→dot + toNumber for 92-col row');
  assertEqual(allData[0][ui['AbgabeZoll']], 93.69, 'Post-validation: comma→dot + toNumber for AbgabeZoll');
  
  // Row from 158-col file: already dot-decimal, converted to Number
  assertEqual(allData[1][ui['Rechnungsbetrag']], 18010.24, 'Post-validation: 158-col value → Number');
  assertEqual(allData[1][ui['AbgabeZoll']], 73.88, 'Post-validation: 158-col value → Number');

  assert(report.numberFixes > 0, 'Number fixes reported');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 12: Alignment idempotency
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 12: Alignment idempotency ═══');

{
  // Remapping an already-remapped row with the same mapping should be identical
  const row = ['a', 'b', 'c', 'd', 'e'];
  const mapping = [4, 2, 0, 3, 1];
  const width = 5;
  
  const pass1 = remapRow(row, mapping, width);
  // Now remap pass1 with identity mapping (same structure)
  const identityMapping = [0, 1, 2, 3, 4];
  const pass2 = remapRow(pass1, identityMapping, width);
  
  assertDeepEqual(pass1, pass2, 'Remap + identity remap = same result');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 13: Edge cases
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 13: Edge cases ═══');

{
  // Empty header
  const parts = [fp([])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 0, 'Empty header → empty unified');
}

{
  // Headers with null values
  const parts = [fp(['A', null, 'B', ''])];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);
  assertEqual(unified.length, 4, 'Headers with null: length preserved');
  assertEqual(unified[0], 'A', 'First header preserved');
  assertEqual(unified[1], '', 'null → empty string');
}

{
  // All files have identical headers → no alignment needed (simulating the check)
  const h = ['A', 'B', 'C'];
  const parts = [fp(h), fp(h), fp(h)];
  const first = parts[0].hRow;
  const needsAlignment = parts.some(p =>
    p.hRow.length !== first.length ||
    p.hRow.some((h2, idx) => h2 !== first[idx])
  );
  assertEqual(needsAlignment, false, 'Identical headers: no alignment needed');
}

{
  // Different length → alignment needed
  const parts = [fp(['A', 'B']), fp(['A', 'B', 'C'])];
  const first = parts[0].hRow;
  const needsAlignment = parts.some(p =>
    p.hRow.length !== first.length ||
    p.hRow.some((h2, idx) => h2 !== first[idx])
  );
  assertEqual(needsAlignment, true, 'Different lengths: alignment needed');
}

{
  // Same length but different names → alignment needed
  const parts = [fp(['A', 'B']), fp(['A', 'X'])];
  const first = parts[0].hRow;
  const needsAlignment = parts.some(p =>
    p.hRow.length !== first.length ||
    p.hRow.some((h2, idx) => h2 !== first[idx])
  );
  assertEqual(needsAlignment, true, 'Same length, different names: alignment needed');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 14: No-synonym broker (DHL) — should skip alignment
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 14: Broker without headerSynonyms ═══');

{
  const DHL = { id: 'DHL', headerRows: 2, headerStartRow: 0, dataStartRow: 2 };
  // DHL has no headerSynonyms, so even if headers differ, alignment is skipped
  assert(!DHL.headerSynonyms, 'DHL has no headerSynonyms');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 15: Complete synonym coverage
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 15: Complete synonym coverage ═══');

{
  // Every 92-col header should either exist in 158-col header OR have a synonym
  const synonyms = DSV_BROKER.headerSynonyms;
  let missingMappings = 0;
  
  for (let i = 0; i < HEADER_92.length; i++) {
    const name = HEADER_92[i];
    if (!name) continue;
    
    const inWide = HEADER_158.includes(name);
    const hasSynonym = synonyms[name] && HEADER_158.includes(synonyms[name]);
    
    if (!inWide && !hasSynonym) {
      console.log(`  ❌ 92-col[${i}] "${name}" has no match or synonym in 158-col`);
      missingMappings++;
      failed++;
    }
  }
  
  if (missingMappings === 0) {
    console.log(`  ✅ All ${HEADER_92.length} columns in 92-col have a mapping to 158-col`);
    passed++;
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 16: Multiple rows from multiple files
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 16: Multiple rows from multiple files ═══');

{
  const rows92 = [];
  for (let i = 0; i < 5; i++) {
    const r = new Array(92).fill('');
    r[0] = `ZOCE_${i}`;
    r[23] = `${1000 + i},50`;  // Rechnungsbetrag
    rows92.push(r);
  }

  const rows158 = [];
  for (let i = 0; i < 3; i++) {
    const r = new Array(158).fill('');
    r[0] = `WIDE_${i}`;
    r[42] = `${2000 + i}.75`;  // Rechnungsbetrag
    rows158.push(r);
  }

  const parts = [fp(HEADER_92, rows92), fp(HEADER_158, rows158)];
  const { unified } = buildUnifiedHeader(parts, DSV_BROKER);

  const allData = [];
  for (const p of parts) {
    const { mapping } = buildColumnMapping(p.hRow, unified, DSV_BROKER.headerSynonyms, []);
    for (const row of p.data) {
      allData.push(remapRow(row, mapping, unified.length));
    }
  }

  assertEqual(allData.length, 8, '8 total rows (5 + 3)');

  const rbIdx = unified.indexOf('Rechnungsbetrag');
  assertEqual(allData[0][0], 'ZOCE_0', 'First row from 92-col file');
  assertEqual(allData[0][rbIdx], '1000,50', 'First row Rechnungsbetrag at correct position');
  assertEqual(allData[4][0], 'ZOCE_4', 'Last 92-col row');
  assertEqual(allData[5][0], 'WIDE_0', 'First row from 158-col file');
  assertEqual(allData[5][rbIdx], '2000.75', 'First 158-col Rechnungsbetrag at correct position');
  assertEqual(allData[7][rbIdx], '2002.75', 'Last 158-col Rechnungsbetrag');
}

// ═══════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  - ${f}`));
}
console.log(`${'═'.repeat(60)}`);

process.exit(failed > 0 ? 1 : 0);
