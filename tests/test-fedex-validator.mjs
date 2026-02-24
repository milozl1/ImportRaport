/**
 * FedEx Validator Tests — comprehensive automated tests
 *
 * Tests the FedEx-specific validation pipeline in validator.js:
 *   - Trailing newline cleanup (col 64 description, other cells)
 *   - String-to-Number conversion for numeric columns (especially col 73)
 *   - European number format correction (comma→dot)
 *   - HS Code validation (col 56)
 *   - Country code validation (cols 21, 57)
 *   - Footer detection robustness
 *   - Edge cases: null rows, empty data, mixed types
 *   - Integration with real FedEx data patterns
 *
 * Run: node tests/test-fedex-validator.mjs
 */

import { validateAndFix, reportSummary } from '../src/js/validator.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    failed++;
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
  }
}

const FEDEX = { id: 'FEDEX' };

/**
 * Create a FedEx-like row with 92 columns (col 0 null, cols 1-91 populated).
 * Pass overrides as { colIndex: value, ... }.
 */
function makeFedExRow(overrides = {}) {
  const row = new Array(92).fill(null);
  // Default realistic FedEx data pattern
  row[1] = 'FEDEX';
  row[2] = 'CGNR';
  row[3] = 'KOELN';
  row[4] = '7154';
  row[5] = '884502976170';
  row[6] = 'ATC402558640920257154';
  row[7] = 45923.413;       // Excel serial date
  row[8] = 'DE2393166';
  row[9] = '0000';
  row[12] = 'FLEX TECHNOLOGY CHANGSHA CO';
  row[13] = 'DE2393166';
  row[14] = '0000';
  row[15] = 'HELLA GMBH & CO. KGAA';
  row[16] = 'DE570509158641621';
  row[18] = 1;
  row[19] = 'ATNEU';
  row[21] = 'CN';           // VERSENDUNGSLAND
  row[22] = 7.93;           // RECHNUNGSPREIS
  row[23] = 'EUR';
  row[24] = 1.1645;         // KURS
  row[25] = 'USD';
  row[26] = 32;
  row[27] = 0.2;            // GESAMTROHMASSE
  row[28] = 'DE';
  row[29] = 'IM';
  row[30] = '04';
  row[31] = 'EXW';
  row[32] = 'CHANGSHA';
  row[33] = 1;
  row[34] = 'J ';           // Note trailing space
  row[35] = '7HHP';
  row[36] = 'FLEX CSH250919';
  row[37] = 'N380';
  row[43] = 'DE2393166';
  row[44] = 15;             // AUFSCHUB EF 2
  row[45] = 'M';
  row[46] = '030';
  row[48] = 'DE2393166';
  row[49] = 20;             // AUFSCHUB EF 3
  row[50] = ' ';
  row[51] = '15';
  row[53] = 1;              // POSITION NR
  row[54] = '884502976170FD09220935';
  row[56] = '85122000900';  // TARIFNUMMER (HS Code)
  row[57] = 'EU';           // URSPRUNGSLAND
  row[58] = '4000';
  row[59] = 'C07';
  row[60] = 100;            // BEANTRAGTE BEGUENSTIGUNG
  row[61] = 1;              // PACKSTUECKE ANZAHL
  row[62] = 'CT';
  row[63] = 'ADR';
  row[64] = 'LEUCHTEN FUR KFZ';  // WARENBESCHREIBUNG
  row[65] = 0.2;            // EIGENMASSE
  row[66] = 6.81;           // RECHNUNGSPREIS
  row[67] = 33;             // ZOLLWERT
  row[68] = 44.22;          // EUSTWERT
  row[69] = 'USD';
  row[70] = 6.81;           // ARTIKELPREIS
  row[71] = 'CSX';
  row[85] = 0;              // ZOLLSATZ
  row[86] = 37.41;          // FRACHTKOSTEN
  row[87] = 'EUR';
  row[88] = 70;             // PROZENTSATZ
  row[89] = 0;              // HINZURECHNUNGART
  row[90] = 0;              // HINZURECHNUNGBETRAG
  row[91] = 0;              // ZOLL

  // Apply overrides
  for (const [col, val] of Object.entries(overrides)) {
    row[Number(col)] = val;
  }
  return row;
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 1: Trailing newline cleanup
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 1: Trailing newline cleanup ═══');

{
  // Description with trailing newline
  const row = makeFedExRow({ 64: 'LEITERPLATTEN (GEDRUCKTE SCHALTUNGEN)\n' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  assertEqual(row[64], 'LEITERPLATTEN (GEDRUCKTE SCHALTUNGEN)', 'Trailing \\n stripped from description');
  assert(report.numberFixes > 0, 'Cleanup counted in numberFixes');
}

{
  // Description with trailing \r\n (Windows-style)
  const row = makeFedExRow({ 64: 'RADARSENSOREN FUER KFZ\r\n' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[64], 'RADARSENSOREN FUER KFZ', 'Trailing \\r\\n stripped from description');
}

{
  // Description with multiple trailing newlines
  const row = makeFedExRow({ 64: 'SIGNALLEUCHTEN FUR KFZ\n\n' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[64], 'SIGNALLEUCHTEN FUR KFZ', 'Multiple trailing \\n stripped');
}

{
  // Description with internal newline (should keep internal, strip trailing)
  const row = makeFedExRow({
    64: 'LEITERPLATTENBAUGRUPPEN FUR DIE ELEKTRONISCHE STEUEREINHEIT\nFUR SCHLUSSELLOSEN FAHRZEUGZUGANG'
  });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(
    row[64],
    'LEITERPLATTENBAUGRUPPEN FUR DIE ELEKTRONISCHE STEUEREINHEIT\nFUR SCHLUSSELLOSEN FAHRZEUGZUGANG',
    'Internal newline preserved, no trailing newline to strip'
  );
}

{
  // Description with leading newline
  const row = makeFedExRow({ 64: '\nSOME DESCRIPTION' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[64], 'SOME DESCRIPTION', 'Leading newline stripped');
}

{
  // Clean description — no change
  const row = makeFedExRow({ 64: 'INDUKTIONSSPULEN' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  assertEqual(row[64], 'INDUKTIONSSPULEN', 'Clean description unchanged');
  // No cleanup issues for this specific cell
  const cleanupIssues = report.issues.filter(i => i.type === 'cleanup' && i.detail.includes('Col 64'));
  assertEqual(cleanupIssues.length, 0, 'No cleanup issue for clean description');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 2: String-to-Number conversion
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 2: String-to-Number conversion ═══');

{
  // Col 73 (STATISTISCHEMENGE) as string — most common case
  const row = makeFedExRow({ 73: '12000' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  assertEqual(row[73], 12000, 'String "12000" converted to Number 12000');
  assertEqual(typeof row[73], 'number', 'Col 73 is now number type');
  assert(report.issues.some(i => i.detail.includes('Col 73')), 'Conversion reported in issues');
}

{
  // Various STATISTISCHEMENGE string values from real data
  const rows = [
    makeFedExRow({ 73: '1600' }),
    makeFedExRow({ 73: '270' }),
    makeFedExRow({ 73: '3' }),
    makeFedExRow({ 73: '100000' }),
  ];
  validateAndFix(rows, FEDEX);

  assertEqual(rows[0][73], 1600, 'String "1600" → Number 1600');
  assertEqual(rows[1][73], 270, 'String "270" → Number 270');
  assertEqual(rows[2][73], 3, 'String "3" → Number 3');
  assertEqual(rows[3][73], 100000, 'String "100000" → Number 100000');
}

{
  // Already-number values should not be changed
  const row = makeFedExRow({ 22: 7.93, 65: 0.2, 73: null });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[22], 7.93, 'Existing Number 7.93 unchanged');
  assertEqual(row[65], 0.2, 'Existing Number 0.2 unchanged');
  assertEqual(row[73], null, 'Null col 73 unchanged');
}

{
  // Empty string in numeric col — should stay empty
  const row = makeFedExRow({ 73: '' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[73], '', 'Empty string in numeric col unchanged');
}

{
  // All NUMERIC_COLUMNS_FEDEX with string values
  const numCols = [22,24,27,44,49,53,60,61,65,66,67,68,70,73,85,86,88,89,90,91];
  const row = makeFedExRow();
  // Set all numeric cols to string versions
  for (const c of numCols) {
    if (row[c] != null && typeof row[c] === 'number') {
      row[c] = String(row[c]);
    }
  }
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  let allNumbers = true;
  for (const c of numCols) {
    if (row[c] != null && row[c] !== '' && typeof row[c] !== 'number') {
      allNumbers = false;
      console.log(`    Col ${c} still string: "${row[c]}"`);
    }
  }
  assert(allNumbers, 'All numeric columns converted from string to Number');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 3: European number format correction
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 3: European number format correction ═══');

{
  // Comma as decimal separator in a FedEx numeric column
  const row = makeFedExRow({ 86: '37,41' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  // fixNumericValue converts "37,41" → "37.41", then string-to-Number converts to 37.41
  assertEqual(row[86], 37.41, 'European comma decimal "37,41" → 37.41');
  assertEqual(typeof row[86], 'number', 'Result is Number type');
}

{
  // Thousands-dot + comma-decimal
  const row = makeFedExRow({ 67: '1.234,56' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[67], 1234.56, 'European thousands "1.234,56" → 1234.56');
}

{
  // Leading comma
  const row = makeFedExRow({ 65: ',5' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[65], 0.5, 'Leading comma ",5" → 0.5');
}

{
  // Leading dot
  const row = makeFedExRow({ 65: '.5' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[65], 0.5, 'Leading dot ".5" → 0.5');
}

{
  // Text addresses with commas should NOT be changed
  const row = makeFedExRow({ 32: 'SAO BERNARDO DO CAMPO, SP' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[32], 'SAO BERNARDO DO CAMPO, SP', 'Address with comma unchanged');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 4: HS Code validation (col 56)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 4: HS Code validation (col 56) ═══');

{
  // Valid HS code — no warning
  const row = makeFedExRow({ 56: '85122000900' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const hsWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'HS Code');
  assertEqual(hsWarns.length, 0, 'Valid 11-digit HS code — no warning');
}

{
  // Valid 8-digit HS code
  const row = makeFedExRow({ 56: '85122000' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const hsWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'HS Code');
  assertEqual(hsWarns.length, 0, 'Valid 8-digit HS code — no warning');
}

{
  // Invalid HS code — should warn
  const row = makeFedExRow({ 56: 'BADCODE' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const hsWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'HS Code');
  assert(hsWarns.length > 0, 'Invalid HS code triggers warning');
}

{
  // Empty HS code — no warning (allowed)
  const row = makeFedExRow({ 56: null });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const hsWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'HS Code');
  assertEqual(hsWarns.length, 0, 'Null HS code — no warning');
}

{
  // HS code with 9 digits
  const row = makeFedExRow({ 56: '851190009' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const hsWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'HS Code');
  assertEqual(hsWarns.length, 0, 'Valid 9-digit HS code — no warning');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 5: Country code validation
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 5: Country code validation ═══');

{
  // Valid sending country
  const row = makeFedExRow({ 21: 'CN' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const countryWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'Country');
  assertEqual(countryWarns.length, 0, 'Valid VERSENDUNGSLAND "CN" — no warning');
}

{
  // Valid origin country "EU" (common in FedEx data)
  const row = makeFedExRow({ 57: 'EU' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const countryWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'Country');
  assertEqual(countryWarns.length, 0, 'Valid URSPRUNGSLAND "EU" — no warning');
}

{
  // Invalid sending country — should warn
  const row = makeFedExRow({ 21: 'GERMANY' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const countryWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'Country' && i.detail.includes('VERSENDUNGSLAND'));
  assert(countryWarns.length > 0, 'Invalid VERSENDUNGSLAND "GERMANY" triggers warning');
}

{
  // Invalid origin country — should warn
  const row = makeFedExRow({ 57: 'CHINA' });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const countryWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'Country' && i.detail.includes('URSPRUNGSLAND'));
  assert(countryWarns.length > 0, 'Invalid URSPRUNGSLAND "CHINA" triggers warning');
}

{
  // Null country codes — no warning
  const row = makeFedExRow({ 21: null, 57: null });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  const countryWarns = report.issues.filter(i => i.type === 'warning' && i.zone === 'Country');
  assertEqual(countryWarns.length, 0, 'Null country codes — no warning');
}

{
  // All real FedEx country codes from data
  const countries = ['AE','BR','CA','CH','CN','CO','GB','HK','IN','JP','KR','MA','MX','MY','SG','SK','TH','TR','TW','US','VN','ZA'];
  let allValid = true;
  for (const cc of countries) {
    const row = makeFedExRow({ 21: cc });
    const report = validateAndFix([row], FEDEX);
    const warns = report.issues.filter(i => i.type === 'warning' && i.zone === 'Country');
    if (warns.length > 0) {
      console.log(`    Unexpected warning for country "${cc}"`);
      allValid = false;
    }
  }
  assert(allValid, 'All 22 real FedEx sending countries accepted without warning');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 6: Footer detection (broker isFooterRow)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 6: Footer detection ═══');

{
  const isFooterRow = (row) => {
    if (!row || row.length < 3) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 3;
  };

  // Empty row (between data and footer text)
  assert(isFooterRow([]), 'Empty array is footer');
  assert(isFooterRow(null), 'Null is footer');
  assert(isFooterRow(new Array(92).fill(null)), 'All-null 92-col row is footer');

  // Information row: 1 non-empty cell
  const infoRow = new Array(92).fill(null);
  infoRow[8] = 'Information is for reference purposes only. \nFedEx';
  assert(isFooterRow(infoRow), 'Info disclaimer row (1 cell) is footer');

  // CONFIDENTIAL row: 2 non-empty cells
  const confRow = new Array(92).fill(null);
  confRow[2] = 'CONFIDENTIAL';
  confRow[4] = 'Page 1 of  1';
  assert(isFooterRow(confRow), 'CONFIDENTIAL row (2 cells) is footer');

  // Data row: many non-empty cells
  const dataRow = makeFedExRow();
  assert(!isFooterRow(dataRow), 'Real data row is NOT footer');

  // Sparse data row with exactly 3 non-empty cells
  const sparseRow = new Array(92).fill(null);
  sparseRow[1] = 'FEDEX';
  sparseRow[2] = 'CGNR';
  sparseRow[3] = 'KOELN';
  assert(!isFooterRow(sparseRow), 'Row with 3 non-empty cells is NOT footer');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 7: Edge cases
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 7: Edge cases ═══');

{
  // Empty data array
  const report = validateAndFix([], FEDEX);
  assertEqual(report.numberFixes, 0, 'Empty data → 0 fixes');
  assertEqual(report.totalIssues, 0, 'Empty data → 0 issues');
}

{
  // Array with null rows
  const report = validateAndFix([null, null, null], FEDEX);
  assertEqual(report.numberFixes, 0, 'Null rows → 0 fixes');
}

{
  // Short row (fewer than 92 columns)
  const row = [null, 'FEDEX', 'CGNR', 'KOELN'];
  const report = validateAndFix([row], FEDEX);
  // Should not crash
  assertEqual(report.numberFixes, 0, 'Short row handled without crash');
}

{
  // Very long row (more than 92 columns)
  const row = makeFedExRow();
  row.push('extra1', 'extra2', 123);
  const report = validateAndFix([row], FEDEX);
  // Should handle gracefully
  assert(report != null, 'Long row handled without crash');
}

{
  // Row with all null values (should not crash or generate issues)
  const row = new Array(92).fill(null);
  const report = validateAndFix([row], FEDEX);
  assertEqual(report.numberFixes, 0, 'All-null row → 0 fixes');
}

{
  // Row where col 73 has non-numeric string (should NOT convert)
  const row = makeFedExRow({ 73: 'AR' });
  const data = [row];
  validateAndFix(data, FEDEX);
  assertEqual(row[73], 'AR', 'Non-numeric string "AR" in col 73 unchanged');
}

{
  // Boolean values in numeric columns
  const row = makeFedExRow({ 73: true });
  const data = [row];
  validateAndFix(data, FEDEX);
  // Boolean true treated as number (1) by Number(), but we only convert strings
  assertEqual(row[73], true, 'Boolean in numeric col unchanged (not a string)');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 8: Whitespace in col 34 and other string cells
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 8: Whitespace handling ═══');

{
  // Col 34 with trailing space "J " — common in FedEx data
  // Note: trailing whitespace in non-newline form is NOT stripped by the cleanup
  // because the cleanup only targets newlines. This is intentional — "J " is a
  // data value, not corruption. The cleanup focuses on \n and \r.
  const row = makeFedExRow({ 34: 'J ' });
  const data = [row];
  validateAndFix(data, FEDEX);
  // "J " does not have trailing newlines, so it stays "J "
  assertEqual(row[34], 'J ', 'Trailing space preserved (not a newline issue)');
}

{
  // Col 50 with just a space " " — common in FedEx data
  const row = makeFedExRow({ 50: ' ' });
  const data = [row];
  validateAndFix(data, FEDEX);
  assertEqual(row[50], ' ', 'Single space preserved');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 9: reportSummary for FedEx
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 9: reportSummary for FedEx ═══');

{
  // Clean data — no issues
  const row = makeFedExRow();
  const report = validateAndFix([row], FEDEX);
  const summary = reportSummary(report);
  assert(summary.includes('No issues found'), 'Clean FedEx data → "No issues found"');
}

{
  // Data with string-to-number conversion
  const row = makeFedExRow({ 73: '12000' });
  const report = validateAndFix([row], FEDEX);
  const summary = reportSummary(report);
  assert(summary.includes('number format'), 'Summary mentions number fixes');
}

{
  // Data with newline + invalid HS code
  const row = makeFedExRow({ 64: 'TEST\n', 56: 'INVALID' });
  const report = validateAndFix([row], FEDEX);
  const summary = reportSummary(report);
  assert(summary.includes('number format'), 'Summary mentions number fixes (cleanup)');
  assert(summary.includes('warning'), 'Summary mentions warnings');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 10: Multiple rows — realistic batch
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 10: Multiple rows batch ═══');

{
  const rows = [
    makeFedExRow({ 64: 'LEUCHTEN FUR KFZ\n', 73: '1600' }),     // newline + string num
    makeFedExRow({ 64: 'RADARSENSOREN FUER KFZ' }),               // clean
    makeFedExRow({ 73: '270', 86: '37,41' }),                     // string num + comma
    makeFedExRow(),                                                // totally clean
    makeFedExRow({ 64: 'ELEKTRONISCHE KOMPONENTEN\n', 73: '20' }), // newline + string num
  ];

  const report = validateAndFix(rows, FEDEX);

  // Row 0: newline cleanup + string→number (73)
  assertEqual(rows[0][64], 'LEUCHTEN FUR KFZ', 'Row 0: newline stripped');
  assertEqual(rows[0][73], 1600, 'Row 0: string "1600" → Number');

  // Row 1: no changes
  assertEqual(rows[1][64], 'RADARSENSOREN FUER KFZ', 'Row 1: clean description unchanged');

  // Row 2: string→number + comma→dot
  assertEqual(rows[2][73], 270, 'Row 2: string "270" → Number');
  assertEqual(rows[2][86], 37.41, 'Row 2: comma→dot "37,41" → 37.41');

  // Row 3: no changes
  assertEqual(typeof rows[3][22], 'number', 'Row 3: already-Number cols unchanged');

  // Row 4: newline + string
  assertEqual(rows[4][64], 'ELEKTRONISCHE KOMPONENTEN', 'Row 4: newline stripped');
  assertEqual(rows[4][73], 20, 'Row 4: string "20" → Number');

  assert(report.numberFixes > 0, 'Total numberFixes > 0');
  assert(report.shiftFixes === 0, 'No shift fixes for FedEx');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 11: Real FedEx data patterns from file analysis
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 11: Real FedEx data patterns ═══');

{
  // Pattern from Brokerage file row 521: description with newline
  const row = makeFedExRow({
    64: 'INTELLIGENTE BATTERIESENSOREN (IBS)\n',
    21: 'JP',
    56: '90303100900',
    57: 'EU',
    73: null,
  });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  assertEqual(row[64], 'INTELLIGENTE BATTERIESENSOREN (IBS)', 'Real pattern: trailing \\n removed');
  assertEqual(row[21], 'JP', 'Real pattern: country preserved');
  assertEqual(row[56], '90303100900', 'Real pattern: HS code preserved as string');
  const warns = report.issues.filter(i => i.type === 'warning');
  assertEqual(warns.length, 0, 'Real pattern: no warnings');
}

{
  // Pattern from Sept-Dec file: TNT entry (col 1 = "TNT")
  const row = makeFedExRow({
    1: 'TNT',
    2: 'QKUTR',
    21: 'GB',
    56: '85011099900',
    57: 'EU',
    73: '18',
    74: 'AR',
    85: 2.7,
    91: 23.7,
  });
  const data = [row];
  const report = validateAndFix(data, FEDEX);

  assertEqual(row[73], 18, 'TNT row: string "18" → Number');
  assertEqual(row[74], 'AR', 'TNT row: AR (unit) preserved as string');
  assertEqual(row[91], 23.7, 'TNT row: ZOLL already Number, unchanged');
}

{
  // Pattern with col 73 having various string integers
  const testVals = ['1', '3', '4', '5', '10', '12', '20', '32', '100000'];
  for (const v of testVals) {
    const row = makeFedExRow({ 73: v });
    validateAndFix([row], FEDEX);
    assertEqual(row[73], Number(v), `Col 73 "${v}" → ${Number(v)}`);
  }
}

{
  // Pattern: large invoice value
  const row = makeFedExRow({ 22: 146700, 66: 139767.54, 67: 139854.9 });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[22], 146700, 'Large invoice: already Number, preserved');
  assertEqual(row[66], 139767.54, 'Large line price: already Number, preserved');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 12: Date column (col 7) — Excel serial numbers
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 12: Date column handling ═══');

{
  // Date serial number should remain as-is (Number type)
  const row = makeFedExRow({ 7: 45923.413 });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[7], 45923.413, 'Date serial number unchanged');
  assertEqual(typeof row[7], 'number', 'Date serial stays Number type');
}

{
  // Date as string (edge case) — should stay as string since col 7 is not in NUMERIC_COLUMNS_FEDEX
  const row = makeFedExRow({ 7: '45923.413' });
  const data = [row];
  validateAndFix(data, FEDEX);

  // Col 7 is NOT in NUMERIC_COLUMNS_FEDEX, so string is not converted
  // But fixNumericValue doesn't touch it either (it's a valid number but not European format)
  // It stays as string "45923.413"
  assert(row[7] != null, 'Date string not nullified');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 13: No column shift detection for FedEx
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 13: No column shift detection for FedEx ═══');

{
  // FedEx data has no column shifts — verify no shift repairs are attempted
  const rows = [];
  for (let i = 0; i < 50; i++) {
    rows.push(makeFedExRow({
      73: i % 3 === 0 ? String(i * 100) : i * 100,
      64: i % 5 === 0 ? `DESCRIPTION ${i}\n` : `DESCRIPTION ${i}`,
    }));
  }

  const report = validateAndFix(rows, FEDEX);

  assertEqual(report.shiftFixes, 0, 'No shift fixes on 50 FedEx rows');
  assert(report.numberFixes > 0, 'Number fixes applied');
  const shiftIssues = report.issues.filter(i => i.type === 'shift');
  assertEqual(shiftIssues.length, 0, 'No shift issues in report');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 14: Deterministic / idempotent
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 14: Idempotent (multiple passes) ═══');

{
  // Running validateAndFix twice should produce the same result
  const row = makeFedExRow({
    64: 'TEST DESCRIPTION\n',
    73: '500',
    86: '12,34',
  });
  const data = [row];

  const report1 = validateAndFix(data, FEDEX);

  // Capture values after first pass
  const desc1 = row[64];
  const col73_1 = row[73];
  const col86_1 = row[86];

  // Second pass
  const report2 = validateAndFix(data, FEDEX);

  assertEqual(row[64], desc1, 'Description same after 2nd pass');
  assertEqual(row[73], col73_1, 'Col 73 same after 2nd pass');
  assertEqual(row[86], col86_1, 'Col 86 same after 2nd pass');
  assertEqual(report2.numberFixes, 0, 'Second pass: 0 fixes (idempotent)');
  assertEqual(report2.totalIssues, 0, 'Second pass: 0 issues (idempotent)');
}

{
  // Three passes — same values
  const rows = [
    makeFedExRow({ 64: 'LEITERPLATTEN\n', 73: '12000', 67: '1.234,56' }),
    makeFedExRow({ 64: 'RADARSENSOREN\r\n', 73: '270' }),
  ];

  validateAndFix(rows, FEDEX); // Pass 1
  const snapshot = rows.map(r => [...r]);

  validateAndFix(rows, FEDEX); // Pass 2
  validateAndFix(rows, FEDEX); // Pass 3

  let identical = true;
  for (let i = 0; i < rows.length; i++) {
    for (let c = 0; c < rows[i].length; c++) {
      if (rows[i][c] !== snapshot[i][c]) {
        console.log(`    Row ${i}, Col ${c}: "${snapshot[i][c]}" → "${rows[i][c]}"`);
        identical = false;
      }
    }
  }
  assert(identical, 'Three passes produce identical data');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 15: FedEx broker ID routing
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 15: Broker routing ═══');

{
  // Ensure FEDEX broker goes through FedEx-specific path
  const row = makeFedExRow({ 73: '500', 64: 'TEST\n' });
  const report = validateAndFix([row], FEDEX);

  // FedEx path does string→Number AND newline cleanup
  assertEqual(row[73], 500, 'FEDEX broker: col 73 string→Number');
  assertEqual(row[64], 'TEST', 'FEDEX broker: newline cleanup applied');
}

{
  // Other broker (e.g. KN) should NOT do FedEx-specific processing
  const KN = { id: 'KN' };
  const row = makeFedExRow({ 73: '500', 64: 'TEST\n' });
  const report = validateAndFix([row], KN);

  // KN path only does leading dot/comma fix — NOT string→Number or newline cleanup
  assertEqual(row[73], '500', 'KN broker: col 73 stays string (no conversion)');
  assertEqual(row[64], 'TEST\n', 'KN broker: newline NOT stripped');
}


/* ═══════════════════════════════════════════════════════════════
   GROUP 16: HS Code as string preservation
   ═══════════════════════════════════════════════════════════════ */
console.log('\n═══ TEST GROUP 16: HS Code string preservation ═══');

{
  // HS codes should remain as strings (they are identifiers, not numbers)
  // Col 56 is NOT in NUMERIC_COLUMNS_FEDEX
  const row = makeFedExRow({ 56: '85122000900' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(typeof row[56], 'string', 'HS code stays string type');
  assertEqual(row[56], '85122000900', 'HS code value preserved');
}

{
  // HS code with leading zeros — must stay string
  const row = makeFedExRow({ 56: '00123456789' });
  const data = [row];
  validateAndFix(data, FEDEX);

  assertEqual(row[56], '00123456789', 'HS code with leading zeros preserved');
  assertEqual(typeof row[56], 'string', 'HS code with zeros stays string');
}


/* ═══════════════════════════════════════════════════════════════
   RESULTS
   ═══════════════════════════════════════════════════════════════ */
console.log(`
════════════════════════════════════════════════════════════
RESULTS: ${passed} passed, ${failed} failed
════════════════════════════════════════════════════════════`);

if (failed > 0) process.exit(1);
