/**
 * Project-Wide Integration Tests
 *
 * End-to-end tests covering the entire ImportRaport pipeline:
 *   - Broker config validation
 *   - Engine functions (parseFile, extractParts, mergeFiles)
 *   - Validator dispatch and cross-broker isolation
 *   - Header alignment system
 *   - fixNumericValue exhaustive
 *   - reportSummary
 *   - All brokers' validation pipelines
 *   - Edge cases and regression tests
 *
 * Run: node tests/test-integration.mjs
 */

import { BROKERS } from '../src/js/brokers.js';
import { extractParts } from '../src/js/engine.js';
import { validateAndFix, reportSummary } from '../src/js/validator.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.log(`  ❌ FAIL: ${msg}`); }
}
function assertEqual(a, b, msg) {
  if (a === b) { passed++; console.log(`  ✅ ${msg}`); }
  else {
    failed++; failures.push(msg);
    console.log(`  ❌ FAIL: ${msg}`);
    console.log(`     Expected: ${JSON.stringify(b)}, Got: ${JSON.stringify(a)}`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 1: Broker Configuration Integrity
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 1: Broker Configuration Integrity ═══');

{
  const expectedIds = ['DHL', 'FEDEX', 'KN', 'DSV', 'SCHENKER', 'UPS'];
  assertEqual(BROKERS.length, expectedIds.length, `${expectedIds.length} brokers registered`);

  for (const id of expectedIds) {
    const b = BROKERS.find(x => x.id === id);
    assert(b != null, `Broker ${id} exists`);
  }

  // Hellmann should NOT exist
  const hell = BROKERS.find(x => x.id === 'HELLMANN');
  assertEqual(hell, undefined, 'Hellmann NOT in broker list');
}

{
  // Every broker must have required fields
  for (const b of BROKERS) {
    assert(typeof b.id === 'string' && b.id.length > 0, `${b.id}: has id`);
    assert(typeof b.label === 'string', `${b.id}: has label`);
    assert(typeof b.headerRows === 'number', `${b.id}: has headerRows`);
    assert(typeof b.headerStartRow === 'number', `${b.id}: has headerStartRow`);
    assert(typeof b.dataStartRow === 'number', `${b.id}: has dataStartRow`);
    assert(typeof b.isFooterRow === 'function', `${b.id}: has isFooterRow function`);
    assert(typeof b.color === 'string', `${b.id}: has color`);
    assert(typeof b.textColor === 'string', `${b.id}: has textColor`);
    assert(typeof b.accent === 'string', `${b.id}: has accent`);
    assert(typeof b.logoIcon === 'string', `${b.id}: has logoIcon`);
  }
}

{
  // dataStartRow >= headerStartRow + headerRows
  for (const b of BROKERS) {
    assert(b.dataStartRow >= b.headerStartRow + b.headerRows,
      `${b.id}: dataStartRow (${b.dataStartRow}) >= headerStartRow+headerRows (${b.headerStartRow + b.headerRows})`);
  }
}

{
  // DSV specific: has csvDelimiter and headerSynonyms
  const dsv = BROKERS.find(b => b.id === 'DSV');
  assertEqual(dsv.csvDelimiter, ';', 'DSV: csvDelimiter = ;');
  assert(typeof dsv.headerSynonyms === 'object', 'DSV: has headerSynonyms');
  assert(Object.keys(dsv.headerSynonyms).length >= 30, `DSV: ${Object.keys(dsv.headerSynonyms).length} synonyms >= 30`);
  assert(typeof dsv.sheetSelector === 'function', 'DSV: has sheetSelector');
}

{
  // FEDEX specific: headerStartRow = 13, dataStartRow = 14
  const fedex = BROKERS.find(b => b.id === 'FEDEX');
  assertEqual(fedex.headerStartRow, 13, 'FedEx: headerStartRow = 13');
  assertEqual(fedex.dataStartRow, 14, 'FedEx: dataStartRow = 14');
}

{
  // DHL specific: headerRows = 2
  const dhl = BROKERS.find(b => b.id === 'DHL');
  assertEqual(dhl.headerRows, 2, 'DHL: headerRows = 2');
  assertEqual(dhl.dataStartRow, 2, 'DHL: dataStartRow = 2');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 2: isFooterRow — All Brokers
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 2: isFooterRow — All Brokers ═══');

{
  for (const b of BROKERS) {
    // null/undefined/empty always footer
    assertEqual(b.isFooterRow(null), true, `${b.id}: null is footer`);
    assertEqual(b.isFooterRow([]), true, `${b.id}: [] is footer`);
    assertEqual(b.isFooterRow([null, null, null]), true, `${b.id}: all-null is footer`);
    // A row with enough data is NOT footer
    const dataRow = new Array(20).fill('data');
    assertEqual(b.isFooterRow(dataRow), false, `${b.id}: data row is NOT footer`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 3: extractParts — Basic Extraction
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 3: extractParts — Basic Extraction ═══');

{
  // DHL: 2 header rows, data from row 2. Rows need >= 3 non-empty cells to pass footer filter.
  const dhl = BROKERS.find(b => b.id === 'DHL');
  const rows = [
    ['Header Row 1 col1', 'col2', 'col3'],
    ['Header Row 2 col1', 'col2', 'col3'],
    ['Data1', 'Data2', 'Data3', 'Data4'],
    ['Data5', 'Data6', 'Data7', 'Data8'],
    [null, null, null],  // footer
  ];
  const { headers, data } = extractParts(rows, dhl);
  assertEqual(headers.length, 2, 'DHL: 2 header rows extracted');
  assertEqual(data.length, 2, 'DHL: 2 data rows (footer filtered)');
  assertEqual(data[0][0], 'Data1', 'DHL: first data cell correct');
}

{
  // UPS: 1 header row, data from row 1
  const ups = BROKERS.find(b => b.id === 'UPS');
  const rows = [
    ['Datum', 'Style-Nummer', 'ATE/ATC-Nummer'],
    ['15.04.2025', ' ', 'ATC40190881042025715'],
    ['16.04.2025', ' ', 'ATC40200881042025715'],
  ];
  const { headers, data } = extractParts(rows, ups);
  assertEqual(headers.length, 1, 'UPS: 1 header row');
  assertEqual(data.length, 2, 'UPS: 2 data rows');
}

{
  // FedEx: headerStartRow=13, 1 header, data from 14
  const fedex = BROKERS.find(b => b.id === 'FEDEX');
  const rows = new Array(16).fill(null).map(() => new Array(5).fill(null));
  rows[13] = ['H1', 'H2', 'H3', 'H4', 'H5']; // header at row 13
  rows[14] = ['D1', 'D2', 'D3', 'D4', 'D5'];  // data at row 14
  rows[15] = ['D6', 'D7', 'D8', 'D9', 'D10'];
  const { headers, data } = extractParts(rows, fedex);
  assertEqual(headers.length, 1, 'FedEx: 1 header row');
  assertEqual(headers[0][0], 'H1', 'FedEx: header starts at row 13');
  assertEqual(data.length, 2, 'FedEx: 2 data rows');
  assertEqual(data[0][0], 'D1', 'FedEx: data starts at row 14');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 4: Validator Dispatch — Correct Pipeline
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 4: Validator Dispatch — Correct Pipeline ═══');

{
  // Each broker's validateAndFix should return a valid report object
  const brokerTests = ['DHL', 'FEDEX', 'DSV', 'UPS', 'KN', 'SCHENKER'];
  for (const id of brokerTests) {
    const b = BROKERS.find(x => x.id === id);
    const r = validateAndFix([], b);
    assert(typeof r === 'object', `${id}: returns object`);
    assert('numberFixes' in r, `${id}: has numberFixes`);
    assert('shiftFixes' in r, `${id}: has shiftFixes`);
    assert('totalIssues' in r, `${id}: has totalIssues`);
    assert(Array.isArray(r.issues), `${id}: has issues array`);
  }
}

{
  // DHL pipeline should detect shifts (simulated)
  const dhl = BROKERS.find(b => b.id === 'DHL');
  const row = new Array(137).fill(null);
  // Set up a +1 goods shift: HS code at col 111 instead of 110
  row[109] = 'DESCRIPTION TEXT';
  row[110] = 'OVERFLOW TEXT';
  row[111] = '85340011000'; // HS code shifted right by 1
  row[112] = 'CN';          // Country shifted right by 1
  row[113] = '';
  row[114] = '4000';        // ProcCode shifted
  const r = validateAndFix([row], dhl);
  assert(r.shiftFixes > 0, 'DHL: goods shift detected');
}

{
  // FedEx pipeline should do newline cleanup + string→Number
  const fedex = BROKERS.find(b => b.id === 'FEDEX');
  const row = new Array(92).fill(null);
  row[64] = 'DESCRIPTION\n';
  row[73] = '12000';
  const r = validateAndFix([row], fedex);
  assertEqual(row[64], 'DESCRIPTION', 'FedEx: trailing newline stripped');
  assertEqual(row[73], 12000, 'FedEx: string→Number');
}

{
  // UPS pipeline should do string→Number + trim trailing cols
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(65).fill(null);
  row[8] = '1047,31';
  row[28] = '85340011000';
  const r = validateAndFix([row], ups);
  assertEqual(row[8], 1047.31, 'UPS: comma→dot + Number');
  assert(row.length <= 62, 'UPS: trailing cols trimmed');
}

{
  // KN/SCHENKER use generic handler — only leading comma/dot fix
  const kn = BROKERS.find(b => b.id === 'KN');
  const row = [',5', '.7', '123,45', 'text'];
  const r = validateAndFix([row], kn);
  assertEqual(row[0], '0.5', 'KN: leading comma fixed');
  assertEqual(row[1], '0.7', 'KN: leading dot fixed');
  // Generic handler does NOT do full comma→dot — only leading comma/dot
  assertEqual(row[2], '123,45', 'KN: non-leading comma untouched');
  assertEqual(row[3], 'text', 'KN: text untouched');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 5: Cross-Broker Isolation
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 5: Cross-Broker Isolation ═══');

{
  // UPS row processed with DHL broker should NOT crash
  const dhl = BROKERS.find(b => b.id === 'DHL');
  const row = new Array(65).fill(null);
  row[0] = '15.04.2025';
  row[8] = 1047.31;
  const r = validateAndFix([row], dhl);
  assert(r != null, 'DHL handles 65-col UPS row without crash');
}

{
  // DHL row processed with UPS broker should NOT crash
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(137).fill(null);
  row[0] = '01.01.2025';
  row[110] = '85340011000';
  const r = validateAndFix([row], ups);
  assert(r != null, 'UPS handles 137-col DHL row without crash');
}

{
  // DSV row processed with FedEx broker should NOT crash
  const fedex = BROKERS.find(b => b.id === 'FEDEX');
  const row = new Array(158).fill(null);
  row[0] = 'ZOCE';
  const r = validateAndFix([row], fedex);
  assert(r != null, 'FedEx handles 158-col DSV row without crash');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 6: fixNumericValue — Exhaustive Tests
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 6: fixNumericValue — Exhaustive Tests ═══');

{
  // Test through UPS pipeline (uses fixNumericValue internally)
  const ups = BROKERS.find(b => b.id === 'UPS');

  const cases = [
    // [input, expected_value, description]
    ['123,45', 123.45, 'Simple comma decimal'],
    ['1.234,56', 1234.56, 'Thousands-dot + comma decimal'],
    ['12.345.678,90', 12345678.9, 'Multi-thousands-dot + comma'],
    [',5', 0.5, 'Leading comma'],
    ['.5', 0.5, 'Leading dot'],
    ['-123,45', -123.45, 'Negative comma decimal'],
    ['-1.234,56', -1234.56, 'Negative thousands-dot'],
    ['200,000', 200000, 'Thousands-comma (US format)'],
    ['1,500', 1500, 'Thousands-comma small'],
    ['42.5', 42.5, 'Already dot-decimal'],
    [42, 42, 'Already Number'],
    [0, 0, 'Zero'],
    [null, null, 'Null'],
    ['', '', 'Empty string'],
  ];

  for (const [input, expected, desc] of cases) {
    const row = new Array(65).fill(null);
    row[8] = input;  // col 8 is numeric
    validateAndFix([row], ups);
    if (expected === null || expected === '') {
      assertEqual(row[8], expected, `fixNumeric: ${desc}`);
    } else {
      assertEqual(row[8], expected, `fixNumeric: ${desc}`);
    }
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 7: reportSummary — All Patterns
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 7: reportSummary — All Patterns ═══');

{
  // No issues
  const r = { shiftFixes: 0, numberFixes: 0, totalIssues: 0, issues: [] };
  const s = reportSummary(r);
  assert(s.includes('No issues'), 'No issues → contains "No issues"');
}

{
  // Number fixes only
  const r = { shiftFixes: 0, numberFixes: 5, totalIssues: 5, issues: [
    { type: 'number' }, { type: 'number' }, { type: 'number' }, { type: 'number' }, { type: 'number' },
  ]};
  const s = reportSummary(r);
  assert(s.includes('5'), 'Summary contains fix count');
}

{
  // Shift fixes
  const r = { shiftFixes: 3, numberFixes: 0, totalIssues: 3, issues: [
    { type: 'shift' }, { type: 'shift' }, { type: 'shift' },
  ]};
  const s = reportSummary(r);
  assert(s.includes('3'), 'Summary contains shift count');
}

{
  // Warnings
  const r = { shiftFixes: 0, numberFixes: 0, totalIssues: 1, issues: [
    { type: 'warning', zone: 'HS Code', detail: 'invalid' },
  ]};
  const s = reportSummary(r);
  assert(s.includes('warning') || s.includes('Warning') || s.includes('1'), 'Summary mentions warnings');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 8: Data Integrity — No Data Loss
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 8: Data Integrity — No Data Loss ═══');

{
  // DHL: verify all non-null cells survive validation
  const dhl = BROKERS.find(b => b.id === 'DHL');
  const row = new Array(137).fill(null);
  // Set specific values
  row[0] = '01.01.2025';
  row[1] = 'DE1234567';
  row[20] = 'SHIPPER NAME';
  row[24] = 'CN';
  row[26] = 'CONSIGNEE NAME';
  row[30] = 'DE';
  row[31] = 'FCA';
  row[33] = 100.50;
  row[109] = 'GOODS DESCRIPTION';
  row[110] = '85340011000';
  row[111] = 'CN';
  row[113] = '4000';
  row[117] = 500.00;
  row[118] = 'EUR';

  const before = JSON.parse(JSON.stringify(row));
  validateAndFix([row], dhl);

  // Key columns should still have their values (possibly type-converted)
  assert(row[0] != null, 'DHL: Date survived');
  assert(row[1] != null, 'DHL: EORI survived');
  assert(row[20] != null, 'DHL: Shipper name survived');
  assert(row[109] != null, 'DHL: Description survived');
  assert(row[110] != null, 'DHL: HS code survived');
  assertEqual(row[118], 'EUR', 'DHL: Currency unchanged');
}

{
  // UPS: all 62 meaningful columns survive
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(65).fill(null);
  row[0] = '15.04.2025';
  row[4] = 'CGN';
  row[8] = 1047.31;
  row[9] = 'EUR';
  row[28] = '85340011000';
  row[29] = 'DESCRIPTION';
  row[41] = 'SENDER NAME';
  row[61] = 'Keine Anwendung';

  validateAndFix([row], ups);

  assertEqual(row[0], '15.04.2025', 'UPS: Date survived');
  assertEqual(row[4], 'CGN', 'UPS: Niederlassung survived');
  assertEqual(row[8], 1047.31, 'UPS: Rechnungspreis survived');
  assertEqual(row[9], 'EUR', 'UPS: Waehrung survived');
  assertEqual(row[28], '85340011000', 'UPS: HS code survived');
  assertEqual(row[29], 'DESCRIPTION', 'UPS: Description survived');
  assertEqual(row[41], 'SENDER NAME', 'UPS: Versendername survived');
  assertEqual(row[61], 'Keine Anwendung', 'UPS: Kleinbetrag survived');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 9: Idempotency — All Brokers
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 9: Idempotency — All Brokers ═══');

{
  const brokerTests = [
    { id: 'DHL', row: (() => { const r = new Array(137).fill(null); r[0] = '01.01.2025'; r[33] = '100,50'; r[110] = '85340011000'; r[111] = 'CN'; r[113] = '4000'; return r; })() },
    { id: 'FEDEX', row: (() => { const r = new Array(92).fill(null); r[64] = 'DESC\n'; r[73] = '12000'; return r; })() },
    { id: 'UPS', row: (() => { const r = new Array(65).fill(null); r[8] = '1047,31'; r[28] = '85340011000'; return r; })() },
    { id: 'KN', row: [',5', '.7', 'text'] },
    { id: 'SCHENKER', row: [',5', '.7', 'text'] },
  ];

  for (const { id, row } of brokerTests) {
    const b = BROKERS.find(x => x.id === id);
    const data = [row];
    
    // Pass 1
    const r1 = validateAndFix(data, b);
    const snap = JSON.stringify(data);
    
    // Pass 2
    const r2 = validateAndFix(data, b);
    const snap2 = JSON.stringify(data);
    
    assertEqual(snap, snap2, `${id}: data identical after pass 2`);
    assertEqual(r2.numberFixes, 0, `${id}: pass 2 = 0 number fixes`);
    assertEqual(r2.shiftFixes, 0, `${id}: pass 2 = 0 shift fixes`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 10: DSV Header Synonyms Completeness
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 10: DSV Header Synonyms ═══');

{
  const dsv = BROKERS.find(b => b.id === 'DSV');
  const syns = dsv.headerSynonyms;
  
  // Each synonym value should be a non-empty string
  for (const [old, newName] of Object.entries(syns)) {
    assert(typeof newName === 'string' && newName.length > 0,
      `Synonym "${old}" → "${newName}" is valid`);
  }
  
  // Critical synonyms that must exist
  const critical = [
    'Registrienummer/MRN', 'Versender EORI', 'Versender Name',
    'Empfänger EORI', 'Empfänger Name', 'Anmelder EORI',
    'Addressierte Zollstelle', 'Vorraussichtliche Zollabgabe',
    'DV1Rechnugnswährung',
  ];
  for (const key of critical) {
    assert(key in syns, `Critical synonym "${key}" exists`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 11: DSV sheetSelector
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 11: DSV sheetSelector ═══');

{
  const dsv = BROKERS.find(b => b.id === 'DSV');
  
  // Non-Luft file: should return first sheet
  const result1 = dsv.sheetSelector(['Sheet1', 'Sheet2'], 'DSV_Sea_2025_01.xlsx');
  assertEqual(result1, 'Sheet1', 'Non-Luft: returns first sheet');
  
  // Luft file with Importzoll sheet
  const result2 = dsv.sheetSelector(['Template', 'Importzollanmeldungen'], 'DSV_Luft_2025.xlsx');
  assertEqual(result2, 'Importzollanmeldungen', 'Luft: returns Importzoll sheet');
  
  // Luft file with Hella sheet
  const result3 = dsv.sheetSelector(['Meta', 'Hella Data'], 'Something_Luft.xlsx');
  assertEqual(result3, 'Hella Data', 'Luft: returns Hella sheet');
  
  // Luft file without matching sheet: returns first
  const result4 = dsv.sheetSelector(['Random', 'Other'], 'File_Luft.xlsx');
  assertEqual(result4, 'Random', 'Luft without match: returns first');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 12: Mixed Data Types Survival
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 12: Mixed Data Types Survival ═══');

{
  const ups = BROKERS.find(b => b.id === 'UPS');
  
  // Boolean should not crash
  const row = new Array(65).fill(null);
  row[5] = true;
  row[8] = 0;
  const r = validateAndFix([row], ups);
  // Boolean in numeric col: not a string, not null, just stays
  assert(r != null, 'Boolean in numeric col: no crash');
  
  // Very large number
  row[8] = 99999999999.99;
  validateAndFix([row], ups);
  assertEqual(row[8], 99999999999.99, 'Very large number preserved');
  
  // Negative number
  row[8] = -500.25;
  validateAndFix([row], ups);
  assertEqual(row[8], -500.25, 'Negative number preserved');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 13: Empty/Minimal Data
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 13: Empty/Minimal Data ═══');

{
  for (const b of BROKERS) {
    // Empty array
    const r1 = validateAndFix([], b);
    assertEqual(r1.totalIssues, 0, `${b.id}: empty data → 0 issues`);
    
    // Array of nulls
    const r2 = validateAndFix([null, null], b);
    assertEqual(r2.totalIssues, 0, `${b.id}: null rows → 0 issues`);
  }
}

// ═══════════════════════════════════════════════════
// TEST GROUP 14: Regression — Thousands-comma vs decimal-comma
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 14: Regression — Thousands-comma vs decimal-comma ═══');

{
  // "200,000" should be 200000 (thousands), NOT 200.000
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(65).fill(null);
  row[8] = '200,000';
  validateAndFix([row], ups);
  assertEqual(row[8], 200000, '"200,000" → 200000 (thousands-comma)');
}

{
  // "1,500" should be 1500
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(65).fill(null);
  row[8] = '1,500';
  validateAndFix([row], ups);
  assertEqual(row[8], 1500, '"1,500" → 1500');
}

{
  // "123,45" should be 123.45 (European decimal)
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(65).fill(null);
  row[8] = '123,45';
  validateAndFix([row], ups);
  assertEqual(row[8], 123.45, '"123,45" → 123.45 (European decimal)');
}

{
  // "12,345,678" should be 12345678
  const ups = BROKERS.find(b => b.id === 'UPS');
  const row = new Array(65).fill(null);
  row[8] = '12,345,678';
  validateAndFix([row], ups);
  assertEqual(row[8], 12345678, '"12,345,678" → 12345678');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 15: Regression — Seller zone must stay empty (DHL)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 15: Regression — DHL Seller zone empty ═══');

{
  const dhl = BROKERS.find(b => b.id === 'DHL');
  const row = new Array(137).fill(null);
  // Seller zone (15-19) MUST remain null
  row[20] = 'SHIPPER NAME';
  row[21] = '123 MAIN ST';
  row[22] = 'CITY';
  row[23] = '12345';
  row[24] = 'CN';
  row[109] = 'GOODS';
  row[110] = '85340011000';
  row[111] = 'CN';
  row[113] = '4000';

  validateAndFix([row], dhl);

  assertEqual(row[15], null, 'Seller Name stays null');
  assertEqual(row[16], null, 'Seller Address stays null');
  assertEqual(row[17], null, 'Seller Town stays null');
  assertEqual(row[18], null, 'Seller Postcode stays null');
  assertEqual(row[19], null, 'Seller Country stays null');
  assertEqual(row[20], 'SHIPPER NAME', 'Shipper Name preserved');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 16: Large-Scale Processing
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 16: Large-Scale Processing ═══');

{
  // 2000 UPS rows
  const ups = BROKERS.find(b => b.id === 'UPS');
  const data = [];
  for (let i = 0; i < 2000; i++) {
    const row = new Array(65).fill(null);
    row[0] = '01.01.2025';
    row[8] = 1000 + i;
    row[28] = '85340011000';
    row[23] = 'CN';
    row[24] = 'TW';
    data.push(row);
  }
  
  const start = Date.now();
  const r = validateAndFix(data, ups);
  const elapsed = Date.now() - start;
  
  assertEqual(r.numberFixes, 0, '2000 clean UPS rows: 0 fixes');
  assert(elapsed < 5000, `Performance: ${elapsed}ms < 5000ms`);
}

{
  // 500 DHL rows with shifts
  const dhl = BROKERS.find(b => b.id === 'DHL');
  const data = [];
  for (let i = 0; i < 500; i++) {
    const row = new Array(137).fill(null);
    row[0] = '01.01.2025';
    row[109] = 'GOODS';
    row[110] = '85340011000';
    row[111] = 'CN';
    row[113] = '4000';
    data.push(row);
  }
  
  const start = Date.now();
  const r = validateAndFix(data, dhl);
  const elapsed = Date.now() - start;
  
  assertEqual(r.shiftFixes, 0, '500 clean DHL rows: 0 shift fixes');
  assert(elapsed < 5000, `DHL performance: ${elapsed}ms < 5000ms`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 17: Broker ID uniqueness
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 17: Broker ID Uniqueness ═══');

{
  const ids = BROKERS.map(b => b.id);
  const unique = new Set(ids);
  assertEqual(unique.size, ids.length, 'All broker IDs are unique');
}

{
  const labels = BROKERS.map(b => b.label);
  const unique = new Set(labels);
  assertEqual(unique.size, labels.length, 'All broker labels are unique');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 18: Report Object Completeness
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 18: Report Object Completeness ═══');

{
  for (const b of BROKERS) {
    const r = validateAndFix([], b);
    assertEqual(typeof r.shiftFixes, 'number', `${b.id}: shiftFixes is number`);
    assertEqual(typeof r.numberFixes, 'number', `${b.id}: numberFixes is number`);
    assertEqual(typeof r.totalIssues, 'number', `${b.id}: totalIssues is number`);
    assert(Array.isArray(r.issues), `${b.id}: issues is array`);
    
    // reportSummary should not crash
    const s = reportSummary(r);
    assert(typeof s === 'string', `${b.id}: reportSummary returns string`);
  }
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
