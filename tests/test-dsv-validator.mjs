/**
 * DSV Validator Tests — comprehensive automated tests
 *
 * Tests the DSV-specific validation pipeline in validator.js:
 *   - European comma→dot number format correction (CSV files)
 *   - String-to-Number conversion for known numeric columns
 *   - Excel serial date → DD.MM.YYYY conversion (XLSX files)
 *   - Excel serial datetime → DD.MM.YYYY HH:MM conversion
 *   - Excel time fraction → HH:MM conversion
 *   - Header-based column mapping (variable column counts 92–162)
 *   - Edge cases: null rows, empty data, mixed types
 *   - Idempotency: second pass produces 0 fixes
 *   - Broker routing: only DSV broker activates DSV pipeline
 *
 * Run: node tests/test-dsv-validator.mjs
 */

import { validateAndFix, reportSummary } from '../src/js/validator.js';

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

const DSV = {
  id: 'DSV',
  label: 'DSV',
  headerRows: 1,
  headerStartRow: 0,
  dataStartRow: 1,
  csvDelimiter: ';',
  isFooterRow: (row) => {
    if (!row || row.length < 2) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 2;
  },
};

/**
 * Build DSV headers + data row. Pass headerNames (array of strings) to
 * define columns, then overrides as { colIndex: value }.
 */
function makeDSVHeaders(headerNames) {
  return [headerNames];
}

function makeDSVRow(len, overrides = {}) {
  const row = new Array(len).fill(null);
  for (const [col, val] of Object.entries(overrides)) {
    row[Number(col)] = val;
  }
  return row;
}

// ═══════════════════════════════════════════════════
// TEST GROUP 1: European comma→dot conversion
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 1: European comma→dot conversion ═══');

{
  const headers = makeDSVHeaders(['Sendungsnummer', 'Rechnungsbetrag', 'Zollwert', 'Warenbezeichnung']);
  const row = makeDSVRow(4, {
    0: 'SEND001',
    1: '8458,56',     // European comma decimal
    2: '1.234,56',    // Thousands-dot + comma decimal
    3: 'AUTOMOBILE PARTS',
  });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);

  assertEqual(row[1], 8458.56, 'Simple comma decimal: "8458,56" → 8458.56 (number)');
  assertEqual(row[2], 1234.56, 'Thousands-dot + comma: "1.234,56" → 1234.56 (number)');
  assertEqual(row[3], 'AUTOMOBILE PARTS', 'Text column stays unchanged');
  assert(report.numberFixes > 0, 'Number fixes counted');
}

{
  const headers = makeDSVHeaders(['X', 'Rechnungsbetrag']);
  const row = makeDSVRow(2, { 0: 'ABC', 1: '0,5' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[1], 0.5, 'Small comma decimal: "0,5" → 0.5');
}

{
  const headers = makeDSVHeaders(['X', 'Rechnungsbetrag']);
  const row = makeDSVRow(2, { 0: 'ABC', 1: '-123,45' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[1], -123.45, 'Negative comma decimal: "-123,45" → -123.45');
}

{
  const headers = makeDSVHeaders(['X', 'Rechnungsbetrag']);
  const row = makeDSVRow(2, { 0: 'ABC', 1: '12.345.678,90' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[1], 12345678.9, 'Multi-thousands-dot: "12.345.678,90" → 12345678.9');
}

{
  const headers = makeDSVHeaders(['X', 'Rechnungsbetrag']);
  const row = makeDSVRow(2, { 0: 'ABC', 1: ',7' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[1], 0.7, 'Leading comma: ",7" → 0.7');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 2: String→Number conversion for numeric columns
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 2: String→Number conversion for numeric columns ═══');

{
  const headers = makeDSVHeaders(['Sendungsnummer', 'Rechnungsbetrag', 'Zollwert', 'Eigenmasse']);
  const row = makeDSVRow(4, {
    0: 'SEND001',
    1: '1234.56',  // Already dot-decimal string (from XLSX)
    2: '0',
    3: '5.07',
  });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);

  assertEqual(typeof row[1], 'number', 'Rechnungsbetrag string→number conversion');
  assertEqual(row[1], 1234.56, 'Rechnungsbetrag value correct');
  assertEqual(typeof row[2], 'number', 'Zollwert "0" → number');
  assertEqual(row[2], 0, 'Zollwert value correct');
  assertEqual(typeof row[3], 'number', 'Eigenmasse string→number');
  assertEqual(row[3], 5.07, 'Eigenmasse value correct');
}

{
  // Non-numeric column should stay as string
  const headers = makeDSVHeaders(['Warenbezeichnung', 'Rechnungsbetrag']);
  const row = makeDSVRow(2, { 0: 'TEILE FUER SCHEINWERFER', 1: '100' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(typeof row[0], 'string', 'Non-numeric column stays string');
  assertEqual(typeof row[1], 'number', 'Numeric column → number');
}

{
  // Already numeric values should not be double-converted
  const headers = makeDSVHeaders(['Rechnungsbetrag']);
  const row = makeDSVRow(1, { 0: 1207.71 });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);
  assertEqual(row[0], 1207.71, 'Already-number stays unchanged');
  // fixNumericValue doesn't fire on numbers, but string→Number doesn't either
}

{
  // Empty and null in numeric columns should stay as-is
  const headers = makeDSVHeaders(['Rechnungsbetrag', 'Zollwert']);
  const row = makeDSVRow(2, { 0: '', 1: null });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '', 'Empty string in numeric col stays empty');
  assertEqual(row[1], null, 'Null in numeric col stays null');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 3: Excel serial date → DD.MM.YYYY
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 3: Excel serial date → DD.MM.YYYY ═══');

{
  // 45950 = 20.10.2025 (Excel serial from epoch Dec 30, 1899)
  const headers = makeDSVHeaders(['Anlagedatum', 'Überlassungsdatum', 'Annahmedatum']);
  const row = makeDSVRow(3, { 0: 45950, 1: 45951, 2: 45952 });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);

  assertEqual(row[0], '20.10.2025', 'Anlagedatum: 45950 → 20.10.2025');
  assertEqual(row[1], '21.10.2025', 'Überlassungsdatum: 45951 → 21.10.2025');
  assertEqual(row[2], '22.10.2025', 'Annahmedatum: 45952 → 22.10.2025');
  assert(report.numberFixes >= 3, 'Date conversions counted as fixes');
}

{
  // 45658 = 01.01.2025
  const headers = makeDSVHeaders(['Anlagedatum']);
  const row = makeDSVRow(1, { 0: 45658 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '01.01.2025', 'Anlagedatum: 45658 → 01.01.2025');
}

{
  // Non-serial (already string date) should not be converted
  const headers = makeDSVHeaders(['Anlagedatum']);
  const row = makeDSVRow(1, { 0: '27.10.2025' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '27.10.2025', 'Already-formatted date stays unchanged');
}

{
  // Null/empty in date column should not crash
  const headers = makeDSVHeaders(['Anlagedatum', 'Überlassungsdatum']);
  const row = makeDSVRow(2, { 0: null, 1: '' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], null, 'Null date stays null');
  assertEqual(row[1], '', 'Empty date stays empty');
}

{
  // Value outside serial range should not be converted
  const headers = makeDSVHeaders(['Anlagedatum']);
  const row = makeDSVRow(1, { 0: 100 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  // 100 is below 40000, should not trigger serial→date
  assertEqual(typeof row[0], 'number', 'Small number not treated as date serial');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 4: Excel serial datetime → DD.MM.YYYY HH:MM
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 4: Excel serial datetime → DD.MM.YYYY HH:MM ═══');

{
  // 45950.658333 ≈ 20.10.2025 15:48
  const headers = makeDSVHeaders(['Zeitpunkt der letzten CUSTAX']);
  const row = makeDSVRow(1, { 0: 45950.658333 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  // Check that it converted to a datetime string
  assert(typeof row[0] === 'string', 'DateTime serial converted to string');
  assert(row[0].startsWith('20.10.2025'), 'DateTime date part correct');
  assert(row[0].includes(':'), 'DateTime has time part');
}

{
  const headers = makeDSVHeaders(['Zeitpunkt der letzten CUSTAX']);
  const row = makeDSVRow(1, { 0: 45950.0 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '20.10.2025 00:00', 'DateTime at midnight');
}

{
  // Null should not crash
  const headers = makeDSVHeaders(['Zeitpunkt der letzten CUSTAX']);
  const row = makeDSVRow(1, { 0: null });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], null, 'Null datetime stays null');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 5: Excel time fraction → HH:MM
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 5: Excel time fraction → HH:MM ═══');

{
  // 0.658333 = 15:48 (approx)
  const headers = makeDSVHeaders(['Zeit']);
  const row = makeDSVRow(1, { 0: 0.658333 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assert(typeof row[0] === 'string', 'Time serial converted to string');
  assertEqual(row[0], '15:48', 'Time fraction 0.658333 → 15:48');
}

{
  const headers = makeDSVHeaders(['Zeit']);
  const row = makeDSVRow(1, { 0: 0.0 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '00:00', 'Time 0.0 → 00:00');
}

{
  const headers = makeDSVHeaders(['Zeit']);
  const row = makeDSVRow(1, { 0: 0.5 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '12:00', 'Time 0.5 → 12:00');
}

{
  const headers = makeDSVHeaders(['Zeit']);
  const row = makeDSVRow(1, { 0: 0.999306 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '23:59', 'Time 0.999306 → 23:59');
}

{
  // Null and non-number should not crash
  const headers = makeDSVHeaders(['Zeit']);
  const row = makeDSVRow(1, { 0: null });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], null, 'Null time stays null');
}

{
  const headers = makeDSVHeaders(['Zeit']);
  const row = makeDSVRow(1, { 0: '15:48' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '15:48', 'Already-formatted time stays unchanged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 6: Header-based column mapping
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 6: Header-based column mapping ═══');

{
  // Headers in different positions (simulating 92-col file vs 162-col file)
  const headers92 = makeDSVHeaders([
    'Sendungsnummer', 'Anlagedatum', 'Zeit', 'Rechnungsbetrag',
    'Warenbezeichnung', 'Zollwert', 'Eigenmasse',
  ]);
  const row = makeDSVRow(7, {
    1: 45950,         // Anlagedatum
    2: 0.5,           // Zeit
    3: '1234,56',     // Rechnungsbetrag
    5: '999,00',      // Zollwert
    6: '5,07',        // Eigenmasse
  });
  const data = [row];
  validateAndFix(data, DSV, headers92);

  assertEqual(row[1], '20.10.2025', 'Date at col 1 (92-col layout)');
  assertEqual(row[2], '12:00', 'Time at col 2 (92-col layout)');
  assertEqual(typeof row[3], 'number', 'Rechnungsbetrag → number at col 3');
  assertEqual(row[3], 1234.56, 'Rechnungsbetrag value correct');
}

{
  // Shifted layout — same headers at different column positions
  const headers162 = makeDSVHeaders([
    'Col0', 'Col1', 'Col2', 'Col3', 'Sendungsnummer',
    'Anlagedatum', 'Zeit', 'Col7', 'Rechnungsbetrag',
    'Warenbezeichnung', 'Zollwert',
  ]);
  const row = makeDSVRow(11, {
    5: 45658,         // Anlagedatum at col 5
    6: 0.25,          // Zeit at col 6
    8: '500,00',      // Rechnungsbetrag at col 8
    10: '100,00',     // Zollwert at col 10
  });
  const data = [row];
  validateAndFix(data, DSV, headers162);

  assertEqual(row[5], '01.01.2025', 'Date at col 5 (162-col layout)');
  assertEqual(row[6], '06:00', 'Time at col 6 (162-col layout)');
  assertEqual(row[8], 500, 'Rechnungsbetrag at col 8 → 500');
  assertEqual(row[10], 100, 'Zollwert at col 10 → 100');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 7: Missing/unknown headers
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 7: Missing/unknown headers ═══');

{
  // Headers don't contain any known numeric/date headers
  const headers = makeDSVHeaders(['Unknown1', 'Unknown2', 'Unknown3']);
  const row = makeDSVRow(3, { 0: '100,00', 1: '200,00', 2: 'text' });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);

  // comma→dot should still run (it runs on ALL cells)
  assertEqual(row[0], '100.00', 'comma→dot still runs for unknown headers');
  assertEqual(row[1], '200.00', 'comma→dot runs on col 1');
  // But no string→Number because headers aren't recognized
  assertEqual(typeof row[0], 'string', 'No string→Number without known header');
}

{
  // Empty headers array
  const headers = [[]];
  const row = makeDSVRow(3, { 0: '100,00', 1: 45950, 2: 'text' });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);
  assertEqual(row[0], '100.00', 'comma→dot works even with empty headers');
  assert(report.numberFixes >= 1, 'At least 1 fix counted');
}

{
  // No headers at all (null)
  const row = makeDSVRow(3, { 0: '100,00', 1: '200', 2: 'text' });
  const data = [row];
  const report = validateAndFix(data, DSV, null);
  assertEqual(row[0], '100.00', 'comma→dot works with null headers');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 8: Edge cases — null rows, empty data
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 8: Edge cases — null rows, empty data ═══');

{
  // Empty data array
  const headers = makeDSVHeaders(['Rechnungsbetrag']);
  const data = [];
  const report = validateAndFix(data, DSV, headers);
  assertEqual(report.numberFixes, 0, 'Empty data: 0 fixes');
  assertEqual(report.totalIssues, 0, 'Empty data: 0 total issues');
}

{
  // Data with null rows
  const headers = makeDSVHeaders(['Rechnungsbetrag']);
  const data = [null, makeDSVRow(1, { 0: '100,00' }), null];
  const report = validateAndFix(data, DSV, headers);
  assertEqual(data[1][0], 100, 'Non-null row processed correctly');
  assert(report.numberFixes >= 1, 'Fixes counted despite null rows');
}

{
  // Row shorter than header — numeric col beyond row length
  const headers = makeDSVHeaders(['Col0', 'Rechnungsbetrag', 'Zollwert']);
  const row = makeDSVRow(1, { 0: 'text' }); // only 1 col, but headers define 3
  const data = [row];
  const report = validateAndFix(data, DSV, headers);
  // Should not crash
  assertEqual(row[0], 'text', 'Short row: col 0 unchanged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 9: Mixed CSV + XLSX patterns
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 9: Mixed CSV + XLSX patterns ═══');

{
  // CSV pattern: all values are strings with European comma decimals
  const headers = makeDSVHeaders([
    'Sendungsnummer', 'Rechnungsbetrag', 'Anlagedatum', 'Zeit',
    'Zollwert', 'AbgabeZoll', 'AbgabeEust',
  ]);
  const row = makeDSVRow(7, {
    0: 'SEND001',
    1: '8458,56',
    2: '08.01.2025',  // Already formatted date (CSV)
    3: '15:48',       // Already formatted time (CSV)
    4: '1.234,56',
    5: '100,00',
    6: '200,50',
  });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);

  assertEqual(row[0], 'SEND001', 'Sendungsnummer unchanged');
  assertEqual(row[1], 8458.56, 'Rechnungsbetrag CSV → number');
  assertEqual(row[2], '08.01.2025', 'Already-formatted date unchanged');
  assertEqual(row[3], '15:48', 'Already-formatted time unchanged');
  assertEqual(row[4], 1234.56, 'Zollwert: thousands+comma → number');
  assertEqual(row[5], 100, 'AbgabeZoll → number');
  assertEqual(row[6], 200.5, 'AbgabeEust → number');
}

{
  // XLSX pattern: numbers are already numeric, dates are serial
  const headers = makeDSVHeaders([
    'Sendungsnummer', 'Rechnungsbetrag', 'Anlagedatum', 'Zeit',
    'Zollwert', 'AbgabeZoll',
  ]);
  const row = makeDSVRow(6, {
    0: 'SEND002',
    1: 1207.71,       // Already a number (XLSX)
    2: 45950,         // Serial date
    3: 0.658333,      // Time fraction
    4: 500.00,        // Already a number
    5: 50.00,         // Already a number
  });
  const data = [row];
  const report = validateAndFix(data, DSV, headers);

  assertEqual(row[0], 'SEND002', 'Sendungsnummer unchanged');
  assertEqual(row[1], 1207.71, 'Already-number Rechnungsbetrag unchanged');
  assertEqual(row[2], '20.10.2025', 'Serial date → DD.MM.YYYY');
  assertEqual(row[3], '15:48', 'Time fraction → HH:MM');
  assertEqual(row[4], 500, 'Already-number Zollwert unchanged');
  assertEqual(row[5], 50, 'Already-number AbgabeZoll unchanged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 10: All DSV numeric headers recognized
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 10: All DSV numeric headers recognized ═══');

{
  // Test a selection of numeric headers
  const numericHeaders = [
    'Rechnungsbetrag', 'Rechnungskurs', 'Gesamtgewicht', 'Zollwert',
    'AbgabeZoll', 'AbgabeEust', 'Eigenmasse', 'Rohmasse',
    'Artikelpreis', 'Statistischerwert',
    'DV1Rechnungsbetrag', 'DV1Frachtkosten', 'DV1Luftfrachtkosten',
  ];
  const allHeaders = ['ID', ...numericHeaders];
  const headers = makeDSVHeaders(allHeaders);
  const overrides = { 0: 'ROW1' };
  for (let i = 1; i < allHeaders.length; i++) {
    overrides[i] = '99,99';
  }
  const row = makeDSVRow(allHeaders.length, overrides);
  const data = [row];
  validateAndFix(data, DSV, headers);

  for (let i = 1; i < allHeaders.length; i++) {
    assertEqual(typeof row[i], 'number', `${allHeaders[i]} → number`);
    assertEqual(row[i], 99.99, `${allHeaders[i]} value = 99.99`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 11: Date header variants
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 11: Date header variants ═══');

{
  // Test all date header variants
  const headers = makeDSVHeaders([
    'Anlagedatum', 'Überlassungsdatum', 'Annahmedatum', 'UstID-DT', 'Unterlagendatum',
  ]);
  const row = makeDSVRow(5, {
    0: 45950,
    1: 45951,
    2: 45952,
    3: 45953,
    4: 45954,
  });
  const data = [row];
  validateAndFix(data, DSV, headers);

  assertEqual(row[0], '20.10.2025', 'Anlagedatum converted');
  assertEqual(row[1], '21.10.2025', 'Überlassungsdatum converted');
  assertEqual(row[2], '22.10.2025', 'Annahmedatum converted');
  assertEqual(row[3], '23.10.2025', 'UstID-DT converted');
  assertEqual(row[4], '24.10.2025', 'Unterlagendatum converted');
}

{
  // UTF-8 encoding variant of Überlassungsdatum
  const headers = makeDSVHeaders(['Ãberlassungsdatum']);
  const row = makeDSVRow(1, { 0: 45950 });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '20.10.2025', 'Ãberlassungsdatum (latin1 encoded) converted');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 12: Numeric header UTF-8 variants
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 12: Numeric header UTF-8 variants ═══');

{
  // Geschäftsart vs Geschã¤ftsart
  const headers1 = makeDSVHeaders(['Geschäftsart']);
  const row1 = makeDSVRow(1, { 0: '10' });
  validateAndFix([row1], DSV, headers1);
  assertEqual(typeof row1[0], 'number', 'Geschäftsart → number');
  assertEqual(row1[0], 10, 'Geschäftsart value');

  const headers2 = makeDSVHeaders(['Geschã¤ftsart']);
  const row2 = makeDSVRow(1, { 0: '20' });
  validateAndFix([row2], DSV, headers2);
  assertEqual(typeof row2[0], 'number', 'Geschã¤ftsart (latin1) → number');
  assertEqual(row2[0], 20, 'Geschã¤ftsart value');
}

{
  // AnzahlPackstücke vs Anzahlpackstã¼cke
  const headers1 = makeDSVHeaders(['AnzahlPackstücke']);
  const row1 = makeDSVRow(1, { 0: '5' });
  validateAndFix([row1], DSV, headers1);
  assertEqual(typeof row1[0], 'number', 'AnzahlPackstücke → number');

  const headers2 = makeDSVHeaders(['Anzahlpackstã¼cke']);
  const row2 = makeDSVRow(1, { 0: '3' });
  validateAndFix([row2], DSV, headers2);
  assertEqual(typeof row2[0], 'number', 'Anzahlpackstã¼cke (latin1) → number');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 13: Idempotency — second pass = 0 fixes
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 13: Idempotency — second pass = 0 fixes ═══');

{
  const headers = makeDSVHeaders([
    'Sendungsnummer', 'Rechnungsbetrag', 'Anlagedatum', 'Zeit',
    'Zollwert', 'Eigenmasse',
  ]);
  // First pass: CSV-style data
  const row = makeDSVRow(6, {
    0: 'SEND001',
    1: '8458,56',
    2: '08.01.2025',
    3: '15:48',
    4: '1.234,56',
    5: '5,07',
  });
  const data = [row];
  const report1 = validateAndFix(data, DSV, headers);
  assert(report1.numberFixes > 0, 'First pass: fixes applied');

  // Snapshot after first pass
  const snap = [...row];

  // Second pass
  const report2 = validateAndFix(data, DSV, headers);
  assertEqual(report2.numberFixes, 0, 'Second pass: 0 number fixes');
  assertEqual(report2.totalIssues, 0, 'Second pass: 0 total issues');

  // Data unchanged
  for (let i = 0; i < row.length; i++) {
    assertEqual(row[i], snap[i], `Col ${i} same after 2nd pass`);
  }
}

{
  // XLSX-style data idempotency
  const headers = makeDSVHeaders(['Anlagedatum', 'Zeit', 'Rechnungsbetrag']);
  const row = makeDSVRow(3, { 0: 45950, 1: 0.5, 2: 1207.71 });
  const data = [row];
  const report1 = validateAndFix(data, DSV, headers);
  assert(report1.numberFixes >= 2, 'XLSX first pass: date+time converted');

  const snap = [...row];
  const report2 = validateAndFix(data, DSV, headers);
  assertEqual(report2.numberFixes, 0, 'XLSX second pass: 0 fixes');
  for (let i = 0; i < row.length; i++) {
    assertEqual(row[i], snap[i], `XLSX col ${i} same after 2nd pass`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 14: Broker routing — only DSV activates DSV pipeline
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 14: Broker routing ═══');

{
  const headers = makeDSVHeaders(['Rechnungsbetrag', 'Anlagedatum']);
  const row1 = makeDSVRow(2, { 0: '100,00', 1: 45950 });
  const data1 = [row1];
  validateAndFix(data1, DSV, headers);
  assertEqual(row1[0], 100, 'DSV broker: comma→dot + string→Number');
  assertEqual(row1[1], '20.10.2025', 'DSV broker: serial→date');
}

{
  // KN broker should NOT activate DSV pipeline
  const KN = { id: 'KN' };
  const headers = makeDSVHeaders(['Rechnungsbetrag', 'Anlagedatum']);
  const row2 = makeDSVRow(2, { 0: '100,00', 1: 45950 });
  const data2 = [row2];
  validateAndFix(data2, KN, headers);
  // KN uses generic pipeline which does leading comma/dot fix only
  // comma→dot happens but no serial→date and no string→Number for named cols
  assertEqual(typeof row2[1], 'number', 'KN broker: serial NOT converted to date');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 15: reportSummary for DSV
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 15: reportSummary ═══');

{
  const headers = makeDSVHeaders(['Rechnungsbetrag', 'Zollwert']);
  const data = [makeDSVRow(2, { 0: '100,00', 1: '200,00' })];
  const report = validateAndFix(data, DSV, headers);
  const summary = reportSummary(report);
  assert(summary.includes('number format'), 'Summary mentions number fixes');
  assert(!summary.includes('shifted'), 'Summary does not mention shifts (none in DSV)');
}

{
  const report = validateAndFix([], DSV, [[]]);
  const summary = reportSummary(report);
  assert(summary.includes('No issues') || summary.includes('clean'), 'Empty data summary: clean');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 16: Large row count performance
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 16: Large dataset ═══');

{
  const headers = makeDSVHeaders([
    'Sendungsnummer', 'Rechnungsbetrag', 'Anlagedatum', 'Zeit',
    'Zollwert', 'Eigenmasse', 'AbgabeZoll', 'AbgabeEust',
  ]);
  const data = [];
  for (let i = 0; i < 500; i++) {
    data.push(makeDSVRow(8, {
      0: `SEND${String(i).padStart(4, '0')}`,
      1: `${1000 + i},${String(i % 100).padStart(2, '0')}`,
      2: 45658 + i,
      3: (i % 24) / 24,
      4: `${500 + i},00`,
      5: `${10 + i},50`,
      6: `${20 + i},00`,
      7: `${30 + i},00`,
    }));
  }
  const t0 = Date.now();
  const report = validateAndFix(data, DSV, headers);
  const elapsed = Date.now() - t0;

  assert(report.numberFixes > 0, `500 rows: ${report.numberFixes} total fixes`);
  assert(elapsed < 5000, `Performance: ${elapsed}ms < 5000ms`);
  // Verify first and last row
  assertEqual(typeof data[0][1], 'number', 'First row Rechnungsbetrag is number');
  assertEqual(typeof data[499][1], 'number', 'Last row Rechnungsbetrag is number');
  assertEqual(typeof data[0][2], 'string', 'First row Anlagedatum is date string');
  assertEqual(typeof data[499][2], 'string', 'Last row Anlagedatum is date string');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 17: Comma→dot on non-numeric columns too
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 17: Comma→dot on ALL cells (step 1) ═══');

{
  // A cell in a non-numeric column that happens to look like a European number
  const headers = makeDSVHeaders(['Warenbezeichnung', 'SomeOtherCol']);
  const row = makeDSVRow(2, { 0: 'Teile fuer PKW', 1: '50,00' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  // fixNumericValue should convert "50,00" → "50.00" even in unknown column
  assertEqual(row[1], '50.00', 'Unknown col with numeric pattern: comma→dot');
  // But text with comma stays unchanged
  assertEqual(row[0], 'Teile fuer PKW', 'Text without numeric pattern unchanged');
}

{
  // Address text with commas should NOT be altered
  const headers = makeDSVHeaders(['Adresse']);
  const row = makeDSVRow(1, { 0: 'Hauptstrasse 10, Lippstadt, DE' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], 'Hauptstrasse 10, Lippstadt, DE', 'Address with commas unchanged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 18: Abbreviated header variants
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 18: Abbreviated header variants ═══');

{
  // "Vorausstl. Zollabgabe" vs "Vorraussichtliche Zollabgabe"
  const h1 = makeDSVHeaders(['Vorausstl. Zollabgabe']);
  const r1 = makeDSVRow(1, { 0: '100,00' });
  validateAndFix([r1], DSV, h1);
  assertEqual(typeof r1[0], 'number', 'Vorausstl. Zollabgabe → number');

  const h2 = makeDSVHeaders(['Vorraussichtliche Zollabgabe']);
  const r2 = makeDSVRow(1, { 0: '200,00' });
  validateAndFix([r2], DSV, h2);
  assertEqual(typeof r2[0], 'number', 'Vorraussichtliche Zollabgabe → number');
}

{
  // "KontoZoll" vs "AufschubkontoZoll"
  const h1 = makeDSVHeaders(['KontoZoll']);
  const r1 = makeDSVRow(1, { 0: '300,00' });
  validateAndFix([r1], DSV, h1);
  assertEqual(typeof r1[0], 'number', 'KontoZoll → number');

  const h2 = makeDSVHeaders(['AufschubkontoZoll']);
  const r2 = makeDSVRow(1, { 0: '400,00' });
  validateAndFix([r2], DSV, h2);
  assertEqual(typeof r2[0], 'number', 'AufschubkontoZoll → number');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 19: Thousands-comma handling (idempotency fix)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 19: Thousands-comma handling ═══');

{
  // "200,000" = 200000 (thousands separator), NOT 200.000 (decimal)
  const headers = makeDSVHeaders(['Aussenhandelstatistische Menge']);
  const row = makeDSVRow(1, { 0: '200,000' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], 200000, 'Thousands-comma: "200,000" → 200000 (number)');
}

{
  // "1,500" = 1500 (thousands separator)
  const headers = makeDSVHeaders(['X']);
  const row = makeDSVRow(1, { 0: '1,500' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '1500', 'Thousands-comma: "1,500" → "1500"');
}

{
  // "12,345,678" = 12345678 (multi-thousands)
  const headers = makeDSVHeaders(['X']);
  const row = makeDSVRow(1, { 0: '12,345,678' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '12345678', 'Multi-thousands: "12,345,678" → "12345678"');
}

{
  // "123,45" = 123.45 (European decimal, 2 digits after comma — NOT thousands)
  const headers = makeDSVHeaders(['X']);
  const row = makeDSVRow(1, { 0: '123,45' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], '123.45', 'European decimal: "123,45" → "123.45"');
}

{
  // Idempotency: "200,000" → "200000" on pass 1, stays "200000" on pass 2
  const headers = makeDSVHeaders(['Aussenhandelstatistische Menge']);
  const row = makeDSVRow(1, { 0: '200,000' });
  const data = [row];
  validateAndFix(data, DSV, headers);
  const after1 = row[0];
  validateAndFix(data, DSV, headers);
  assertEqual(row[0], after1, 'Thousands-comma idempotent after 2nd pass');
}

// ═══════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(f));
}

process.exit(failed > 0 ? 1 : 0);
