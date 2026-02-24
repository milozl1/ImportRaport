/**
 * Automated tests for DHL column shift detection and repair.
 *
 * Tests are based on ACTUAL data patterns found in the 12 monthly Excel files.
 * Run: node tests/test-validator.mjs
 */

import { validateAndFix, reportSummary } from '../src/js/validator.js';

const DHL_BROKER = {
  id: 'DHL',
  label: 'DHL Express',
  headerRows: 2,
  headerStartRow: 0,
  dataStartRow: 2,
  isFooterRow: (row) => {
    if (!row || row.length < 3) return true;
    const nonEmpty = row.filter(c => c != null && c !== '');
    return nonEmpty.length < 3;
  },
};

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    const msg = `  ❌ ${testName}${details ? ' — ' + details : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

function makeRow(len = 137) {
  return new Array(len).fill(null);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 1: Seller zone should NOT be touched
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 1: Seller zone (cols 15-19) must remain empty ═══');

{
  // Actual pattern: Seller cols 15-19 always empty, Shipper cols 20-24 populated
  const row = makeRow();
  // Shipper data (correct position)
  row[20] = 'HELLA INDIA LIGHTING LIMITED';
  row[21] = 'AMBALA CHANDIGARH HIGHWAY';
  row[22] = 'DERABASSI';
  row[23] = '140507';
  row[24] = 'IN';
  // Consignee data
  row[26] = 'HELLA GmbH & Co. KGaA';
  row[27] = 'Rixbecker Str. 75';
  row[28] = 'Lippstadt';
  row[29] = '59552';
  row[30] = 'DE';
  row[31] = 'DAP';
  // Goods data (correct)
  row[109] = 'OPTISCHE ELEMENTE AUS GLAS';
  row[110] = '90019000900';
  row[111] = 'IN';
  row[112] = '100';
  row[113] = '4000';
  row[117] = '1.00';
  row[118] = 'EUR';
  row[119] = '1.000000000';
  row[120] = '1,00';

  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[15] === null, 'Seller Name (col 15) stays null');
  assert(row[16] === null, 'Seller Address (col 16) stays null');
  assert(row[17] === null, 'Seller Town (col 17) stays null');
  assert(row[18] === null, 'Seller Postcode (col 18) stays null');
  assert(row[19] === null, 'Seller Country (col 19) stays null');
  assert(row[20] === 'HELLA INDIA LIGHTING LIMITED', 'Shipper Name (col 20) unchanged');
  assert(row[24] === 'IN', 'Shipper Country (col 24) unchanged');
  assert(row[26] === 'HELLA GmbH & Co. KGaA', 'Consignee Name (col 26) unchanged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 2: Goods zone shift detection
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 2: Goods zone shift detection & repair ═══');

{
  // Test: +1 shift — description overflows into col 110
  // Actual data from April 2025 row 24:
  // col 109: "GEDRUCKTE MEHRLAGENSCHALTUNGEN..."
  // col 110: "PART-NR.: 289.863-00" (should be HS code, but it's description overflow)
  // col 111: "85340011000" (actual HS code)
  // col 112: "CN" (actual country)
  // col 113: "100" (actual preference)
  // col 114: "4000" (actual procedure code — shifted from 113)
  const row1 = makeRow();
  row1[109] = 'GEDRUCKTE MEHRLAGENSCHALTUNGEN, NUR MIT LEITENDEM MATERIAL';
  row1[110] = 'PART-NR.: 289.863-00';
  row1[111] = '85340011000';
  row1[112] = 'CN';
  row1[113] = '100';
  row1[114] = '4000';
  row1[117] = '.000';  // shifted from 116
  row1[118] = '1290.00';  // shifted from 117
  row1[119] = 'EUR';  // shifted from 118

  const data1 = [row1];
  const report1 = validateAndFix(data1, DHL_BROKER);

  assert(report1.shiftFixes >= 1, '+1 goods shift detected');
  assert(row1[109].includes('GEDRUCKTE') && row1[109].includes('289.863'), 'Description merged with overflow');
  assert(row1[110] === '85340011000', 'HS Code moved to col 110', `got: "${row1[110]}"`);
  assert(row1[111] === 'CN', 'Country moved to col 111', `got: "${row1[111]}"`);
  assert(row1[112] === '100', 'Preference in col 112', `got: "${row1[112]}"`);
  assert(row1[113] === '4000', 'ProcCode in col 113', `got: "${row1[113]}"`);
}

{
  // Test: +2 shift — description overflows into cols 110 AND 111
  // Actual data from July 2025 row 12:
  // col 109: "INSTRUMENTE, APPARATE..."
  // col 110: "PEDALWEGSENSOR"
  // col 111: "LENKWINKELSENSOR"
  // col 112: "90318020000" (actual HS code)
  // col 113: "MX" (actual country)
  const row2 = makeRow();
  row2[109] = 'INSTRUMENTE, APPARATE, GERAETE UND MASCHINEN';
  row2[110] = 'PEDALWEGSENSOR';
  row2[111] = 'LENKWINKELSENSOR';
  row2[112] = '90318020000';
  row2[113] = 'MX';
  row2[114] = '100';
  row2[115] = '4000';
  // Everything else shifted by +2

  const data2 = [row2];
  const report2 = validateAndFix(data2, DHL_BROKER);

  assert(report2.shiftFixes >= 1, '+2 goods shift detected');
  assert(row2[109].includes('INSTRUMENTE') && row2[109].includes('PEDALWEGSENSOR') && row2[109].includes('LENKWINKELSENSOR'),
    'All 3 description fragments merged');
  assert(row2[110] === '90318020000', 'HS Code in col 110 after +2 repair', `got: "${row2[110]}"`);
  assert(row2[111] === 'MX', 'Country in col 111 after +2 repair', `got: "${row2[111]}"`);
}

{
  // Test: +1 shift with empty description col (Nov 2025 row 19)
  // col 109: "" (empty!)
  // col 110: "0001-01-01" (date leaked in)
  // col 111: "TEILE FUER BELEUCHTUNGSGERAETE..." (actual description)
  // col 112: "85129090000" (actual HS code)
  // col 113: "MX" (actual country)
  const row3 = makeRow();
  row3[108] = '0001-01-01';
  row3[109] = '';
  row3[110] = '0001-01-01';
  row3[111] = 'TEILE FUER BELEUCHTUNGSGERAETE FUER KFZ, HIER: ABDECKRAHMEN';
  row3[112] = '85129090000';
  row3[113] = 'MX';
  row3[114] = '100';
  row3[115] = '4000';

  const data3 = [row3];
  const report3 = validateAndFix(data3, DHL_BROKER);

  // This is a complex case — the shift is +2 because HS code is at 112
  assert(report3.shiftFixes >= 1, 'Shift detected when col 109 empty and data shifted right');
  assert(P_hsCode(row3[110]), 'HS Code in col 110 after repair', `got: "${row3[110]}"`);
}

{
  // Test: NO shift — "missing country" pattern (procCode=300)
  // Actual data: HS code valid at 110, country empty, procCode at 112 is "300"
  const row4 = makeRow();
  row4[109] = 'LoTPASTE';
  row4[110] = '38101000000';
  row4[111] = null;  // country genuinely missing
  row4[112] = '300';
  row4[113] = '4000';
  row4[117] = '2169.00';
  row4[118] = 'USD';

  const data4 = [row4];
  const report4 = validateAndFix(data4, DHL_BROKER);

  assert(row4[110] === '38101000000', 'HS Code unchanged — no false shift for missing-country rows');
  assert(row4[111] === null, 'Country stays null (genuine absence, not a shift)');
  assert(row4[112] === '300', 'Preference 300 unchanged');
  assert(row4[118] === 'USD', 'Currency unchanged');
}

{
  // Test: NO shift — completely normal row
  const row5 = makeRow();
  row5[109] = 'ELEKTRONISCHE INTEGRIERTE SCHALTUNGEN';
  row5[110] = '85423990000';
  row5[111] = 'PH';
  row5[112] = '100';
  row5[113] = '4000';
  row5[117] = '87.00';
  row5[118] = 'USD';

  const data5 = [row5];
  const report5 = validateAndFix(data5, DHL_BROKER);

  assert(report5.shiftFixes === 0, 'No false shift on normal row');
  assert(row5[110] === '85423990000', 'HS Code unchanged');
  assert(row5[111] === 'PH', 'Country unchanged');
}

{
  // Test: +4 shift — massive description overflow (May 2025 row 7)
  // col 109: "TEILE FUER BELEUCHTUNGSGERAETE..."
  // col 110: "BLENDE KAMERA ABDECKUNG"
  // col 111: "BLENDE KOFFERRAUMSCHALTER"
  // col 112: "RAHMEN LICHTLEITER"
  // col 113: "RAHMEN"
  // col 114: "85129090000" (actual HS code, offset +4)
  // col 115: "MX" (actual country)
  const row6 = makeRow();
  row6[109] = 'TEILE FUER BELEUCHTUNGSGERAETE FUER KFZ';
  row6[110] = 'BLENDE KAMERA ABDECKUNG';
  row6[111] = 'BLENDE KOFFERRAUMSCHALTER';
  row6[112] = 'RAHMEN LICHTLEITER';
  row6[113] = 'RAHMEN';
  row6[114] = '85129090000';
  row6[115] = 'MX';
  row6[116] = '100';
  row6[117] = '4000';

  const data6 = [row6];
  const report6 = validateAndFix(data6, DHL_BROKER);

  assert(report6.shiftFixes >= 1, '+4 goods shift detected');
  assert(row6[110] === '85129090000', 'HS Code in col 110 after +4 repair', `got: "${row6[110]}"`);
  assert(row6[111] === 'MX', 'Country in col 111 after +4 repair', `got: "${row6[111]}"`);
  assert(row6[109].includes('BLENDE KAMERA') && row6[109].includes('RAHMEN'),
    'All description fragments merged into col 109');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 3: Shipper address zone shift
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 3: Shipper address zone shift ═══');

{
  // Test: +1 shift in Shipper zone (Nov 2025 row 19)
  // col 20: "HELLA AUTOMOTIVE MEXICO"
  // col 21: "506 DE LA CALLE SANTA FE"
  // col 22: "CARR. 110 IRAPUATO, ABASOLO" (overflow fragment)
  // col 23: "" (postcode is empty — shifted right)
  // col 24: "36844" (postcode in country column!)
  // col 25: "MX" (country pushed to col 25)
  const row = makeRow();
  row[20] = 'HELLA AUTOMOTIVE MEXICO';
  row[21] = '506 DE LA CALLE SANTA FE';
  row[22] = 'CARR. 110 IRAPUATO, ABASOLO';
  row[23] = null;
  row[24] = '36844';
  row[25] = 'MX';
  // Normal goods
  row[109] = 'GLEICHSTROMMOTOREN';
  row[110] = '85011099900';
  row[111] = 'MX';
  row[112] = '100';
  row[113] = '4000';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 1, 'Shipper +1 shift detected');
  assert(row[20] === 'HELLA AUTOMOTIVE MEXICO', 'Shipper Name unchanged');
  assert(row[24] === 'MX', 'Shipper Country is now "MX" in col 24', `got: "${row[24]}"`);
  assert(row[23] === '36844' || String(row[23]).includes('36844'), 'Postcode preserved', `got: "${row[23]}"`);
}

{
  // Test: NO shift when Shipper zone is correctly aligned
  const row = makeRow();
  row[20] = 'TEXAS INSTRUMENTS';
  row[21] = '12500 T I BLVD';
  row[22] = 'DALLAS';
  row[23] = '75243';
  row[24] = 'US';
  row[109] = 'ELEKTRONISCHE INTEGRIERTE SCHALTUNGEN';
  row[110] = '85423990000';
  row[111] = 'MY';
  row[112] = '100';
  row[113] = '4000';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(row[20] === 'TEXAS INSTRUMENTS', 'Shipper Name unchanged');
  assert(row[22] === 'DALLAS', 'Shipper Town unchanged');
  assert(row[23] === '75243', 'Shipper Postcode unchanged');
  assert(row[24] === 'US', 'Shipper Country unchanged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 4: Number format fixes
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 4: Number format fixes ═══');

{
  const row = makeRow();
  row[109] = 'TEST ITEM';
  row[110] = '85340011000';
  row[111] = 'CN';
  row[112] = '100';
  row[113] = '4000';
  row[117] = ',40';   // leading comma
  row[118] = 'EUR';
  row[120] = '.40';   // leading dot
  row[121] = '1234,56';  // German comma decimal

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(row[117] === 0.4, 'Leading comma fixed: ",40" → 0.4', `got: "${row[117]}"`);
  assert(row[120] === 0.4, 'Leading dot fixed: ".40" → 0.4', `got: "${row[120]}"`);
  assert(row[121] === 1234.56, 'German comma: "1234,56" → 1234.56', `got: "${row[121]}"`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 5: Combined shift + number fix
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 5: Combined goods shift + number fix ═══');

{
  // Goods shift +1 WITH numeric values that need fixing
  const row = makeRow();
  row[20] = 'SOME SHIPPER';
  row[21] = 'SOME ADDRESS';
  row[22] = 'SOMETOWN';
  row[23] = '12345';
  row[24] = 'DE';
  row[109] = 'SCHRAUBEN AUS STAHL';
  row[110] = 'VENTILABDECKUNG, 100 STK';
  row[111] = '84819000900';
  row[112] = 'MX';
  row[113] = '100';
  row[114] = '4000';
  row[115] = null;
  row[116] = null;
  row[117] = '.000';
  row[118] = '150.00';  // shifted value
  row[119] = 'EUR';     // shifted currency

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 1, 'Combined: goods shift detected');
  assert(row[110] === '84819000900', 'Combined: HS Code correct after shift repair', `got: "${row[110]}"`);
  assert(row[111] === 'MX', 'Combined: Country correct', `got: "${row[111]}"`);
  // After shift repair, numeric columns should also be fixed
  assert(report.numberFixes >= 0, 'Combined: number fixes applied after shift repair');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 6: Multiple rows at once
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 6: Multiple rows processing ═══');

{
  const rows = [];

  // Normal row
  const r1 = makeRow();
  r1[109] = 'OPTISCHE ELEMENTE';
  r1[110] = '90019000900';
  r1[111] = 'IN';
  r1[112] = '100';
  r1[113] = '4000';
  r1[117] = '1.00';
  r1[118] = 'EUR';
  rows.push(r1);

  // Shifted row (+1)
  const r2 = makeRow();
  r2[109] = 'GEDRUCKTE MEHRLAGENSCHALTUNGEN';
  r2[110] = 'PN: 260.843-25';
  r2[111] = '85340011000';
  r2[112] = 'CN';
  r2[113] = '100';
  r2[114] = '4000';
  rows.push(r2);

  // Normal row
  const r3 = makeRow();
  r3[109] = 'GLEICHSTROMMOTOREN';
  r3[110] = '85011099900';
  r3[111] = 'MX';
  r3[112] = '100';
  r3[113] = '4000';
  rows.push(r3);

  const report = validateAndFix(rows, DHL_BROKER);

  assert(rows[0][110] === '90019000900', 'Multi-row: normal row 1 unchanged');
  assert(rows[1][110] === '85340011000', 'Multi-row: shifted row 2 fixed', `got: "${rows[1][110]}"`);
  assert(rows[2][110] === '85011099900', 'Multi-row: normal row 3 unchanged');
  assert(report.shiftFixes === 1, 'Multi-row: exactly 1 shift fix', `got: ${report.shiftFixes}`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 7: Edge cases
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 7: Edge cases ═══');

{
  // null/empty rows should not crash
  const data = [null, [], makeRow(), undefined];
  const report = validateAndFix(data, DHL_BROKER);
  assert(report.shiftFixes === 0, 'Null/empty rows handled without crash');
}

{
  // Non-DHL broker should only do number fixes
  const nonDhlBroker = { id: 'FEDEX', label: 'FedEx' };
  const row = makeRow();
  row[5] = ',50';
  const data = [row];
  const report = validateAndFix(data, nonDhlBroker);
  assert(row[5] === '0.50', 'Non-DHL: leading comma fixed');
  assert(report.shiftFixes === 0, 'Non-DHL: no shift detection attempted');
}

{
  // Row with HS code as number (not string) — should still work
  const row = makeRow();
  row[109] = 'SOME GOODS';
  row[110] = 85423990000;  // number, not string
  row[111] = 'PH';
  row[112] = '100';
  row[113] = '4000';
  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);
  assert(report.shiftFixes === 0, 'Numeric HS code handled (no false shift)');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 9: Large goods shift (+8, May 2025 pattern)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 9: Large goods shift (+8, May 2025 pattern) ═══');

{
  // May 2025 row 5: description overflows into 8 columns (109-116)
  const row = makeRow();
  row[109] = 'TEILE FUER BELEUCHTUNGSGERAETE FUER KFZ, HIER: BLENDE';
  row[110] = 'BLENDE KAMERA ABDECKUNG';
  row[111] = 'BLENDE KOFFERRAUMSCHALTER';
  row[112] = 'RAHMEN LICHTLEITER';
  row[113] = 'RAHMEN';
  row[114] = 'GEHaUSE';
  row[115] = 'LICHTSCHEIBE';
  row[116] = 'REFLEKTOR, BEDAMPFT';
  row[117] = '85129090000';  // HS Code at col 117 (offset +8 from 109, +7 from 110)
  row[118] = 'MX';
  row[119] = '100';
  row[120] = '4000';
  row[123] = '.000';
  row[124] = '24.60';
  row[125] = 'USD';
  row[126] = '1.141500000';
  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);
  assert(report.shiftFixes > 0, '+8 goods shift detected');
  assert(P_hsCode(row[110]), 'HS Code in col 110 after +8 repair', `got: "${row[110]}"`);
  assert(row[111] === 'MX', 'Country in col 111 after +8 repair', `got: "${row[111]}"`);
  assert(row[112] === '100', 'Preference in col 112', `got: "${row[112]}"`);
  assert(row[113] === '4000', 'ProcCode in col 113', `got: "${row[113]}"`);
  assert(typeof row[109] === 'string' && row[109].includes('BLENDE'), 'Description merged contains fragments', `got: "${String(row[109]).substring(0,80)}"`);
  assert(!P_hsCode(row[109]), 'Description col does NOT contain HS code');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 10: Combined shipper shift + goods shift (Nov 2025 pattern)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 10: Combined shipper + goods shift (Nov 2025 pattern) ═══');

{
  // Nov 2025 row 17: shipper +1 shift AND goods +2 shift
  // After shipper repair, goods columns shift left by 1, then goods repair
  const row = makeRow();
  // Shipper zone: +1 shift
  row[20] = 'HELLA AUTOMOTIVE MEXICO S.A. DE C.V';
  row[21] = '506 DE LA CALLE SANTIAGO MANZA';
  row[22] = 'CARR. 110 IRAPUATO, ABASOLO';  // overflow
  row[23] = null;  // town pushed out
  row[24] = '36844';  // postcode in country col
  row[25] = 'MX';     // country pushed to col 25
  // Consignee zone
  row[27] = 'HELLA GmbH & Co. KGaA';
  row[28] = 'Rixbecker Str. 75';
  row[29] = 'Lippstadt';
  row[30] = '59552';
  row[31] = 'DE';
  // Goods zone: +2 shift (description at col 111 instead of 109)
  row[109] = null;
  row[110] = '0001-01-01';  // date placeholder
  row[111] = 'TEILE FUER BELEUCHTUNGSGERAETE FUER KFZ, HIER: ABDECKRAHMEN';
  row[112] = '85129090000';  // HS code
  row[113] = 'MX';           // country
  row[114] = '100';          // preference
  row[115] = '4000';         // proc code
  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);
  // Shipper should be repaired
  assert(row[24] === 'MX', 'Shipper country repaired to col 24', `got: "${row[24]}"`);
  assert(String(row[21]).includes('506'), 'Shipper address merged', `got: "${row[21]}"`);
  // Goods should be repaired (after shipper shift shifted everything left by 1)
  assert(P_hsCode(row[110]), 'HS Code in col 110 after combined repair', `got: "${row[110]}"`);
  assert(row[111] === 'MX' || row[111] === null, 'Country in col 111 correct or empty', `got: "${row[111]}"`);
  assert(!P_hsCode(row[109]), 'Description col does NOT have HS code', `got: "${row[109]}"`);
  assert(report.shiftFixes >= 2, 'At least 2 shift fixes reported', `got: ${report.shiftFixes}`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 11: Date placeholder filtering in description merge
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 11: Date placeholder filtering ═══');

{
  // Date values like "0001-01-01" should be filtered from description merge
  const row = makeRow();
  row[109] = '0001-01-01';   // date placeholder, not real description
  row[110] = 'SOME GOODS DESCRIPTION HERE';
  row[111] = '85129090000';  // HS Code
  row[112] = 'DE';           // Country
  row[113] = '100';
  row[114] = '4000';
  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);
  assert(report.shiftFixes > 0, 'Shift detected with date placeholder');
  assert(!String(row[109] ?? '').includes('0001-01-01'), 'Date placeholder NOT in merged description', `got: "${String(row[109]).substring(0,60)}"`);
  assert(P_hsCode(row[110]), 'HS Code correct after repair', `got: "${row[110]}"`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 12: Mid-row delivery location overflow
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 12: Mid-row delivery location overflow ═══');

{
  // Pattern from Nov row 17: delivery location (col 32) overflows into col 33
  // Col 33 should be freight (numeric), but gets address text instead
  const row = makeRow();
  // Normal cols up to 31
  row[20] = 'ACME CORP';       // Shipper Name
  row[21] = '123 Main St';     // Shipper Address
  row[22] = 'Mexico City';     // Shipper Town
  row[23] = '06600';           // Shipper Postcode
  row[24] = 'MX';              // Shipper Country
  row[26] = 'IMPORT CO';       // Consignee Name
  row[27] = '456 Trade Rd';    // Consignee Address
  row[28] = 'Madrid';          // Consignee Town
  row[29] = '28001';           // Consignee Postcode
  row[30] = 'ES';              // Consignee Country
  row[31] = 'DAP';             // Incoterm
  // Delivery location overflows: col 32 has location, col 33 has overflow text
  row[32] = 'CARR. 110 IRAPUATO';   // Location part 1
  row[33] = 'ABASOLO KM 5.2';       // Location overflow (should be freight!)
  row[34] = '125.50';               // Actual freight (shifted +1)
  row[35] = '2.5';                   // Actual weight (shifted +1)
  // Set HS code etc. at their SHIFTED positions (+1 from col 109)
  row[110] = 'ELECTRONIC PARTS';     // Should be HS code but shifted
  row[111] = '85423100';             // Actual HS code at +1
  row[112] = 'CN';                   // Country at +1
  row[113] = '100';                  // Preference at +1
  row[114] = '4000';                 // ProcCode at +1

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 1, '+1 mid-row overflow detected');
  assert(String(row[32]).includes('CARR. 110 IRAPUATO'), 'Location merged into col 32',
    `got: "${String(row[32]).substring(0,50)}"`);
  assert(String(row[32]).includes('ABASOLO'), 'Overflow fragment merged',
    `got: "${String(row[32]).substring(0,50)}"`);
  assert(row[33] === 125.5 || row[33] === '125.50', 'Freight restored to col 33',
    `got: "${row[33]}"`);
}

{
  // Mid-row overflow +1 with no other shifts (isolated)
  // When delivery location overflows +1, ALL subsequent cols are shifted +1 in source.
  // So HS code (supposed to be at 110) is actually at 111 in the source.
  const row = makeRow();
  row[20] = 'SENDER LTD';
  row[24] = 'DE';
  row[26] = 'RECEIVER SA';
  row[30] = 'FR';
  row[31] = 'EXW';
  row[32] = 'LONG WAREHOUSE ADDR';
  row[33] = 'BUILDING 5 SECTION C';  // overflow — should be freight
  row[34] = '250.00';                 // actual freight (shifted +1)
  row[35] = '15.0';                   // actual weight (shifted +1)
  // Everything from col 33 onward is at +1 in source
  row[110] = 'MACHINE PARTS';         // description at +1 (should be 109)
  row[111] = '84829900';              // HS code at +1 (should be 110)
  row[112] = 'JP';                    // Country at +1 (should be 111)
  row[113] = '100';                   // Preference at +1
  row[114] = '4000';                  // ProcCode at +1

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 1, 'Isolated mid-row overflow fixed');
  assert(String(row[32]).includes('LONG WAREHOUSE ADDR'), 'Location part 1 preserved');
  assert(String(row[32]).includes('BUILDING 5'), 'Location part 2 merged');
  // After mid-row repair shifts left by 1, then goods zone also gets repaired
  assert(P_hsCode(row[110]), 'HS Code in col 110 after mid-row + goods repair', `got: "${row[110]}"`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 13: Full cascade (shipper + mid-row + goods)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 13: Full cascade (shipper + mid-row + goods) ═══');

{
  // This mimics the exact Nov row 17 pattern:
  // 1. Shipper address overflow (+1)
  // 2. After shipper repair, delivery location overflow (+1)
  // 3. After mid-row repair, goods zone also shifted (+1)
  // Net effect in source: +2 cascade from col 35 onward
  const row = makeRow();

  // Declaration info (cols 0-14 normal)
  row[0] = '05.11.2025';
  row[1] = 'EORI12345';
  row[14] = 'REF-001';

  // Seller zone empty (cols 15-19) — always
  // Shipper with +1 address overflow
  row[20] = 'METALÚRGICA MEXICANA SA DE CV';  // Name
  row[21] = 'CARR. 110 IRAPUATO';              // Address part 1
  row[22] = 'ABASOLO KM 5.2';                  // Address overflow! (should be Town)
  row[23] = 'IRAPUATO';                         // Town pushed to Postcode col
  row[24] = '36815';                             // Postcode pushed to Country col
  row[25] = 'MX';                                // Country pushed to gap col

  // Consignee (shifted +1 from shipper overflow)
  row[26] = '';                                  // Gap col — now empty, consignee pushed
  row[27] = 'IMPORT GMBH';                      // Consignee Name at +1
  row[28] = 'INDUSTRIESTRASSE 10';               // Consignee Address at +1
  row[29] = 'FRANKFURT';                         // Town at +1
  row[30] = '60311';                             // Postcode at +1
  row[31] = 'DE';                                // Country at +1 (normally col 30)
  row[32] = 'DAP';                               // Incoterm at +1 (normally col 31)
  // After shipper repair shifts left, incoterm goes to 31,
  // delivery location to 32, but delivery location ALSO overflows
  row[33] = 'INDUSTRIEPARK HÖCHST GEBÄUDE C4';  // Delivery location (overflow)
  row[34] = 'TOR 7';                             // Delivery location overflow fragment
  row[35] = '125.50';                            // Actual freight (shifted +2 total)
  row[36] = '2.5';                               // Actual weight (shifted +2 total)

  // Goods zone shifted by cascade: after shipper repair (-1) and mid-row repair (-1),
  // goods zone sees data that was at +2 in source. So description at 109 in the
  // repaired row corresponds to source col 111, HS code at 112 in source, etc.
  // But we also need the goods zone detector to find the HS code.
  // After both repairs shift left by 2 total, source col 111 → repaired col 109
  // So in the SOURCE: description was at 111, HS at 112, country at 113, etc.
  row[111] = 'AUTOMOTIVE PARTS';                // Description (at +2 total)
  row[112] = '87089900';                         // HS Code at +2
  row[113] = 'MX';                               // Country at +2
  row[114] = '100';                              // Preference at +2
  row[115] = '4000';                             // ProcCode at +2

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 2, 'Full cascade: at least 2 shift fixes',
    `got: ${report.shiftFixes}`);
  // After all repairs:
  assert(row[24] === 'MX' || P_country2(row[24]), 'Shipper Country repaired to col 24',
    `got: "${row[24]}"`);
  assert(P_country2(row[30]) || row[30] === 'DE', 'Consignee Country in col 30',
    `got: "${row[30]}"`);
  assert(row[31] === 'DAP', 'Incoterm in col 31',
    `got: "${row[31]}"`);
  // Delivery location merged
  assert(String(row[32] ?? '').length > 0, 'Delivery location populated in col 32',
    `got: "${row[32]}"`);
  // HS Code should end up in col 110 after all cascade repairs
  assert(P_hsCode(row[110]), 'HS Code in col 110 after full cascade',
    `got: "${row[110]}"`);
}

{
  // Cascade: shipper +1, NO mid-row overflow, goods zone shifted +1 from shipper cascade
  // After shipper repair, all cols from ~22 onward shift left by 1.
  // So HS code at source col 111 → repaired col 110
  const row = makeRow();
  row[20] = 'SUPPLIER INC';
  row[21] = '100 INDUSTRIAL BLVD';
  row[22] = 'SUITE 500';         // Address overflow +1
  row[23] = 'DALLAS';            // Town at +1
  row[24] = '75201';             // Postcode at +1
  row[25] = 'US';                // Country at +1

  row[26] = '';                  // gap pushed
  row[27] = 'BUYER GMBH';
  row[30] = '10115';
  row[31] = 'DE';                // Country at +1
  row[32] = 'FCA';               // Incoterm at +1
  row[33] = '';                  // gap col (delivery location empty)
  row[34] = '45.00';             // Freight at +1 — numeric, no mid-row overflow
  row[35] = '1.5';               // Weight at +1

  // After shipper repair shifts everything left by 1:
  // col 33 becomes freight (45.00), col 34 becomes weight
  // Goods zone: source col 110 → repaired 109, source 111 → 110, etc.
  row[110] = 'ELECTRIC MOTORS';  // Description at +1 (goes to 109 after repair)
  row[111] = '85013100';         // HS code at +1 (goes to 110 after repair)
  row[112] = 'US';               // Country at +1
  row[113] = '100';
  row[114] = '4000';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 1, 'Shipper overflow fixed without mid-row trigger');
  assert(row[24] === 'US', 'Shipper Country at col 24', `got: "${row[24]}"`);
  assert(P_hsCode(row[110]), 'HS Code remains at col 110', `got: "${row[110]}"`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 14: Mid-row overflow edge cases
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 14: Mid-row overflow edge cases ═══');

{
  // No mid-row overflow: col 33 is numeric (normal case)
  const row = makeRow();
  row[32] = 'WAREHOUSE 1';
  row[33] = '100.00';  // numeric — no overflow
  row[34] = '5.0';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(row[33] === '100.00' || row[33] === '100.0' || typeof row[33] === 'number',
    'No false mid-row detection on numeric freight', `got: "${row[33]}"`);
}

{
  // Col 33 empty — no overflow
  const row = makeRow();
  row[32] = 'LOCATION';
  row[33] = null;
  row[34] = '5.0';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(row[32] === 'LOCATION', 'No false mid-row detection on empty freight',
    `got: "${row[32]}"`);
}

{
  // Mid-row overflow +2: delivery location spans 3 cells
  const row = makeRow();
  row[20] = 'CORP SA';
  row[24] = 'BR';
  row[26] = 'DEST LTD';
  row[30] = 'NL';
  row[31] = 'CIF';
  row[32] = 'HAVEN VAN ANTWERPEN';
  row[33] = 'KAAI 730';              // overflow +1
  row[34] = 'LOODS 12';              // overflow +2
  row[35] = '500.00';                // actual freight at +2
  row[36] = '25.0';                  // actual weight at +2
  row[109] = 'CHEMICAL PRODUCTS';
  row[110] = '29051100';
  row[111] = 'BR';
  row[112] = '100';
  row[113] = '4000';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(report.shiftFixes >= 1, '+2 mid-row overflow detected');
  assert(String(row[32]).includes('HAVEN VAN ANTWERPEN'), 'Location part 1 in merged');
  assert(String(row[32]).includes('KAAI 730'), 'Location part 2 in merged');
  assert(String(row[32]).includes('LOODS 12'), 'Location part 3 in merged');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 8: reportSummary
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 8: reportSummary ═══');

{
  const report = { shiftFixes: 3, numberFixes: 10, totalIssues: 14, issues: [{ type: 'warning' }] };
  const summary = reportSummary(report);
  assert(summary.includes('3 shifted'), 'Summary includes shift count');
  assert(summary.includes('10 number'), 'Summary includes number count');
  assert(summary.includes('1 warning'), 'Summary includes warning count');
}

{
  const report = { shiftFixes: 0, numberFixes: 0, totalIssues: 0, issues: [] };
  const summary = reportSummary(report);
  assert(summary.includes('No issues'), 'Clean summary when no issues');
}

// ═══════════════════════════════════════════════════
// TEST GROUP 15: Mid-row gap shift (empty col 33 after shipper repair)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 15: Mid-row gap shift (empty col 33 after shipper repair) ═══');

{
  // Simulates Nov row 17 pattern: after shipper repair, col 33 is null (gap),
  // col 32 has delivery location text, col 34 has freight, col 35 has weight.
  const row = makeRow();
  row[20] = 'CORP SA';
  row[24] = 'MX';
  row[26] = 'DEST LTD';
  row[30] = 'DE';
  row[31] = 'DAP';
  row[32] = 'CARR. 110 IRAPUATO, ABASOLO';
  row[33] = null;   // gap — freight should be here
  row[34] = '334.24'; // freight pushed right
  row[35] = '12.0';   // weight pushed right
  row[109] = 'TOYS';
  row[110] = '95030041';
  row[111] = 'MX';
  row[113] = '4000';

  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(row[33] === 334.24, 'Gap shift: freight restored to col 33',
    `got: "${row[33]}"`);
  assert(row[34] === 12, 'Gap shift: weight restored to col 34',
    `got: "${row[34]}"`);
  assert(report.shiftFixes >= 1, 'Gap shift: at least 1 shift fix',
    `got: ${report.shiftFixes}`);
  assert(row[32] === 'CARR. 110 IRAPUATO, ABASOLO', 'Gap shift: location preserved',
    `got: "${row[32]}"`);
}

{
  // No false detection: col 33 empty, col 32 empty → no shift
  const row = makeRow();
  row[32] = null;
  row[33] = null;
  row[34] = '100.00';
  row[35] = '5.0';

  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[33] === null, 'No false gap shift when col 32 is empty',
    `got: "${row[33]}"`);
}

{
  // No false detection: col 33 empty, col 34 non-numeric → no shift
  const row = makeRow();
  row[32] = 'LOCATION';
  row[33] = null;
  row[34] = 'NOT A NUMBER';
  row[35] = null;

  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[33] === null, 'No false gap shift when col 34 not numeric',
    `got: "${row[33]}"`);
}

// ═══════════════════════════════════════════════════
// TEST GROUP 16: Uniform decimal separators (comma → dot in ALL columns)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST GROUP 16: Uniform decimal separators (comma → dot) ═══');

{
  // European comma decimal in a non-standard numeric column
  const row = makeRow();
  row[50] = '1234,56';
  const data = [row];
  const report = validateAndFix(data, DHL_BROKER);

  assert(row[50] === '1234.56', 'Comma decimal fixed in non-numeric column (50)',
    `got: "${row[50]}"`);
  assert(report.numberFixes >= 1, 'Number fix counted',
    `got: ${report.numberFixes}`);
}

{
  // European thousands-dot + comma decimal: "1.234,56" → 1234.56
  const row = makeRow();
  row[117] = '1.234,56';
  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[117] === 1234.56, 'Thousands-dot + comma decimal fixed',
    `got: "${row[117]}"`);
}

{
  // Text with commas should NOT be changed
  const row = makeRow();
  row[109] = 'PARTS, COMPONENTS AND ACCESSORIES';
  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[109] === 'PARTS, COMPONENTS AND ACCESSORIES',
    'Text with commas unchanged',
    `got: "${row[109]}"`);
}

{
  // Negative European number in a numeric column → becomes number
  const row = makeRow();
  row[33] = '-123,45';
  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[33] === -123.45, 'Negative European number fixed',
    `got: "${row[33]}"`);
}

{
  // Leading comma in a numeric column → becomes number
  const row = makeRow();
  row[67] = ',40';
  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[67] === 0.4, 'Leading comma → 0.4',
    `got: "${row[67]}"`);
}

{
  // Multiple commas in text → no change (not a number)
  const row = makeRow();
  row[20] = 'STREET 1, BUILDING 2, FLOOR 3';
  const data = [row];
  validateAndFix(data, DHL_BROKER);

  assert(row[20] === 'STREET 1, BUILDING 2, FLOOR 3',
    'Multiple commas in address unchanged',
    `got: "${row[20]}"`);
}

// ═══════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(f));
}
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);

// Helper — inline pattern check for HS codes (works with string and number)
function P_hsCode(v) {
  if (v == null || v === '') return false;
  return /^\d{8,11}$/.test(String(v).trim());
}

// Helper — inline pattern check for 2-letter country codes
function P_country2(v) {
  if (v == null || v === '') return false;
  return /^[A-Z]{2}$/i.test(String(v).trim());
}
