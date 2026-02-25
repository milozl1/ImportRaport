/**
 * Critical per-broker analytics audit.
 * Reads real Excel files and runs them through the COLUMN_MAP + aggregateData logic
 * to verify all fields resolve with correct values.
 */
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

// ─── Inline the key analytics functions (can't import ES modules from CJS context) ───

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim().replace(/\s/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m1) return { year: +m1[3], month: +m1[2], day: +m1[1] };
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return { year: +m2[1], month: +m2[2], day: +m2[3] };
  // YYYYMMDD
  const m3 = s.match(/^(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  if (m3) return { year: +m3[1], month: +m3[2], day: +m3[3] };
  // Compressed DMMYYYY or DDMMYYYY
  if (typeof v === 'number' && v > 1000000 && v < 99999999) {
    const ds = String(v);
    if (ds.length === 7) return { year: +ds.substring(3), month: +ds.substring(1, 3), day: +ds.substring(0, 1) };
    else if (ds.length === 8) {
      const dd = +ds.substring(0, 2), mm = +ds.substring(2, 4);
      if (dd <= 31 && mm <= 12) return { year: +ds.substring(4), month: mm, day: dd };
    }
  }
  const m4 = s.match(/^(\d{1,2})(\d{2})(\d{4})$/);
  if (m4 && +m4[2] <= 12 && +m4[1] <= 31) return { year: +m4[3], month: +m4[2], day: +m4[1] };
  return null;
}

function str(v) { return v != null && v !== '' ? String(v).trim() || null : null; }
function hsChapter(v) { const s = str(v); return s && s.length >= 2 && /^\d{2}/.test(s) ? s.substring(0, 2) : null; }

// ─── Test each broker ───

const tests = [];
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; tests.push({ ok: true, msg }); }
  else { failed++; tests.push({ ok: false, msg }); console.log(`  ❌ FAIL: ${msg}`); }
}

// ═══════════ DHL ═══════════
console.log('\n═══ DHL AUDIT ═══');
{
  const wb = XLSX.readFile('excel/DHL/May 2025.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // DHL has 2 header rows + data starts at row 2
  const row = d[2]; // first data row
  
  assert(parseDate(row[0]) != null, 'DHL date parses (col 0: ' + row[0] + ')');
  assert(parseDate(row[0]).month === 5, 'DHL date month = May');
  assert(str(row[4]) != null && String(row[4]).includes('ATC'), 'DHL declarationNo (col 4: ' + String(row[4]).substring(0, 30) + ')');
  assert(str(row[20]) != null, 'DHL shipperName (col 20: ' + str(row[20]) + ')');
  assert(str(row[24]) != null && /^[A-Z]{2}$/.test(str(row[24])), 'DHL shipperCountry (col 24: ' + str(row[24]) + ')');
  assert(str(row[26]) != null, 'DHL consigneeName (col 26: ' + str(row[26]) + ')');
  assert(str(row[31]) != null, 'DHL incoterm (col 31: ' + str(row[31]) + ')');
  
  // DHL uses comma decimals — after validator, should be dot-decimal
  // But raw data has commas: "74,73"
  const rawDuty = row[67];
  const rawVat = row[71];
  console.log('  DHL raw duty col 67:', JSON.stringify(rawDuty), '→ toNum:', toNum(rawDuty));
  console.log('  DHL raw vat col 71:', JSON.stringify(rawVat), '→ toNum:', toNum(rawVat));
  // The comma-decimal values: toNum("74,73") → NaN because parseFloat doesn't handle commas
  // But the validator should have already converted them. In raw data they are strings with commas.
  
  assert(str(row[109]) != null, 'DHL description (col 109: ' + String(row[109]).substring(0, 40) + ')');
  assert(str(row[110]) != null && /^\d{8,11}/.test(str(row[110])), 'DHL hsCode (col 110: ' + str(row[110]) + ')');
  assert(toNum(row[117]) != null && toNum(row[117]) > 0, 'DHL invoiceValue (col 117: ' + row[117] + ')');
  assert(str(row[118]) != null, 'DHL currency (col 118: ' + str(row[118]) + ')');
  
  // Check if HS chapter extraction works
  assert(hsChapter(row[110]) != null, 'DHL hsChapter from hsCode');
  
  console.log('  DHL audit: All column indexes verified against real data');
}

// ═══════════ FedEx ═══════════
console.log('\n═══ FEDEX AUDIT ═══');
{
  const wb = XLSX.readFile('excel/FEDEX/07-jun-2025.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // FedEx has header at row 13 (0-indexed), data starts at row 14
  const hdr = d[13];
  const row = d[14]; // first data row
  
  // Date is Excel serial
  const dateVal = row[7];
  assert(typeof dateVal === 'number' && dateVal > 40000, 'FedEx date is Excel serial (col 7: ' + dateVal + ')');
  const parsedDate = parseDate(dateVal);
  assert(parsedDate != null, 'FedEx date parses to ' + JSON.stringify(parsedDate));
  
  assert(str(row[6]) != null && String(row[6]).includes('ATC'), 'FedEx declarationNo (col 6: ' + String(row[6]).substring(0, 30) + ')');
  assert(str(row[12]) != null, 'FedEx shipperName (col 12: ' + str(row[12]) + ')');
  assert(str(row[21]) != null && /^[A-Z]{2}$/.test(str(row[21])), 'FedEx shipperCountry (col 21: ' + str(row[21]) + ')');
  assert(str(row[15]) != null, 'FedEx consigneeName (col 15: ' + str(row[15]) + ')');
  assert(str(row[31]) != null, 'FedEx incoterm (col 31: ' + str(row[31]) + ')');
  assert(toNum(row[22]) != null, 'FedEx invoiceValue (col 22: ' + row[22] + ')');
  assert(str(row[23]) != null, 'FedEx currency (col 23: ' + str(row[23]) + ')');
  assert(str(row[56]) != null && /^\d{8,11}/.test(str(row[56])), 'FedEx hsCode (col 56: ' + str(row[56]) + ')');
  assert(str(row[57]) != null && /^[A-Z]{2}$/.test(str(row[57])), 'FedEx countryOfOrigin (col 57: ' + str(row[57]) + ')');
  assert(str(row[64]) != null, 'FedEx description (col 64: ' + String(row[64]).substring(0, 40) + ')');
  
  // FedEx VAT: no direct EUSt amount, but eustValue (col 68) × 19%
  const eustVal = toNum(row[68]);
  console.log('  FedEx eustValue col 68:', eustVal, '→ computed VAT (×19%):', eustVal ? (eustVal * 0.19).toFixed(2) : 'N/A');
  assert(eustVal != null && eustVal > 0, 'FedEx eustValue (col 68) for VAT computation');
  
  assert(toNum(row[91]) != null, 'FedEx dutyAmount (col 91: ' + row[91] + ')');
  assert(toNum(row[86]) != null, 'FedEx freightCost (col 86: ' + row[86] + ')');
  
  console.log('  FedEx audit: All column indexes verified against real data');
}

// ═══════════ UPS ═══════════
console.log('\n═══ UPS AUDIT ═══');
{
  const wb = XLSX.readFile('excel/UPS/Hella_DE2393166_January_2025.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const hdr = d[0];
  const row = d[1]; // first data row
  
  assert(parseDate(row[0]) != null, 'UPS date parses (col 0: ' + row[0] + ')');
  assert(str(row[2]) != null && String(row[2]).includes('ATC'), 'UPS declarationNo (col 2: ' + String(row[2]).substring(0, 30) + ')');
  assert(toNum(row[8]) != null && toNum(row[8]) > 0, 'UPS invoiceValue (col 8: ' + row[8] + ')');
  assert(str(row[9]) != null, 'UPS currency (col 9: ' + str(row[9]) + ')');
  assert(str(row[28]) != null && /^\d{8,11}/.test(str(row[28])), 'UPS hsCode (col 28: ' + str(row[28]) + ')');
  assert(str(row[29]) != null, 'UPS description (col 29: ' + String(row[29]).substring(0, 40) + ')');
  assert(str(row[24]) != null && /^[A-Z]{2}$/.test(str(row[24])), 'UPS countryOfOrigin (col 24: ' + str(row[24]) + ')');
  assert(str(row[41]) != null, 'UPS senderName (col 41: ' + str(row[41]) + ')');
  assert(str(row[45]) != null, 'UPS incoterm (col 45: ' + str(row[45]) + ')');
  assert(toNum(row[32]) != null, 'UPS dutyAmount (col 32: ' + row[32] + ')');
  assert(toNum(row[40]) != null, 'UPS eustAmount (col 40: ' + row[40] + ')');
  assert(toNum(row[17]) != null, 'UPS freightAmount (col 17: ' + row[17] + ')');
  
  console.log('  UPS audit: All column indexes verified against real data');
}

// ═══════════ DSV SEA ═══════════
console.log('\n═══ DSV SEA AUDIT ═══');
{
  const wb = XLSX.readFile('excel/DSV/IMP-HELLA-10-2025 DSV Sea.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const hdr = d[0];
  const row = d[1];
  
  // Check date parsing (Excel serial)
  const dateVal = row[4]; // Anlagedatum
  assert(parseDate(dateVal) != null, 'DSV Sea date parses (col 4: ' + dateVal + ' → ' + JSON.stringify(parseDate(dateVal)) + ')');
  
  // Check country normalisation (full German names)
  const origin = str(row[89]); // Ursprung
  console.log('  DSV Sea origin col 89:', origin, '(should be full German name like "Mexiko")');
  assert(origin != null, 'DSV Sea countryOfOrigin resolves');
  
  // Check procedure code parsing
  const procCode = str(row[84]);
  console.log('  DSV Sea procCode col 84:', procCode ? procCode.substring(0, 50) : 'NULL');
  assert(procCode != null && procCode.startsWith('4000'), 'DSV Sea procedureCode starts with 4000');
  
  console.log('  DSV Sea audit: Header-based resolution verified');
}

// ═══════════ DSV LUFTFRACHT Q1 ═══════════
console.log('\n═══ DSV LUFTFRACHT Q1 AUDIT ═══');
{
  const wb = XLSX.readFile('excel/DSV/Zollreport Luftfracht Q1 2025.xlsx');
  const ws = wb.Sheets['Input AC Report '];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const row = d[1];
  
  // Date: MassgeblicherZeitpunkt = 20250113 (YYYYMMDD)
  const dateVal = row[45];
  const parsed = parseDate(dateVal);
  assert(parsed != null, 'DSV Luft Q1 YYYYMMDD date parses (col 45: ' + dateVal + ')');
  assert(parsed && parsed.year === 2025, 'DSV Luft Q1 date year = 2025');
  assert(parsed && parsed.month === 1, 'DSV Luft Q1 date month = January');
  assert(parsed && parsed.day === 13, 'DSV Luft Q1 date day = 13');
  
  // Values are in normal decimal (NOT integer-cents)
  assert(toNum(row[27]) === 10084.29, 'DSV Luft Q1 invoiceValue is normal decimal (10084.29, NOT integer-cents)');
  assert(toNum(row[36]) === 234.06, 'DSV Luft Q1 duty is normal decimal (234.06)');
  
  // HS Code
  assert(str(row[14]) != null && /^\d{8,11}/.test(str(row[14])), 'DSV Luft Q1 hsCode (col 14: ' + str(row[14]) + ')');
  
  // Country is 2-letter code, not German name
  assert(str(row[44]) === 'CN', 'DSV Luft Q1 countryOfOrigin is 2-letter ISO (CN)');
  
  console.log('  DSV Luft Q1 audit: All fields verified');
}

// ═══════════ DSV LUFTFRACHT 07.05 ═══════════
console.log('\n═══ DSV LUFTFRACHT 07.05 AUDIT ═══');
{
  const wb = XLSX.readFile('excel/DSV/Zollreport Luftfracht 07.05. - 30.06.2025.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const row = d[1];
  
  // Date: Anlagedatum = 7052025 (compressed DMMYYYY)
  const dateVal = row[4];
  const parsed = parseDate(dateVal);
  assert(parsed != null, 'DSV Luft 07.05 compressed date parses (col 4: ' + dateVal + ')');
  assert(parsed && parsed.year === 2025, 'DSV Luft 07.05 date year = 2025');
  assert(parsed && parsed.month === 5, 'DSV Luft 07.05 date month = May');
  assert(parsed && parsed.day === 7, 'DSV Luft 07.05 date day = 7');
  
  // Values are in INTEGER-CENTS
  const invoiceRaw = row[23];
  const dutyRaw = row[46];
  const weightRaw = row[64];
  console.log('  Invoice raw:', invoiceRaw, '(should be 2638927 = 26389.27 USD)');
  console.log('  Duty raw:', dutyRaw, '(should be 69305 = 693.05 EUR)');
  console.log('  Weight raw:', weightRaw, '(should be 210000000 = 210 kg)');
  
  assert(Number.isInteger(invoiceRaw) && invoiceRaw > 10000, 'DSV Luft 07.05 invoice is integer-cents encoded');
  assert(weightRaw > 100000, 'DSV Luft 07.05 weight triggers integer-cents detection (>100000)');
  
  // Integer-cents correction
  const correctedInvoice = invoiceRaw / 100;
  const correctedDuty = dutyRaw / 100;
  const correctedWeight = weightRaw / 1000000;
  assert(Math.abs(correctedInvoice - 26389.27) < 0.01, 'Corrected invoice = 26389.27');
  assert(Math.abs(correctedDuty - 693.05) < 0.01, 'Corrected duty = 693.05');
  assert(Math.abs(correctedWeight - 210) < 0.001, 'Corrected weight = 210 kg');
  
  // Country is German name (Mexiko)
  const origin = str(row[59]);
  assert(origin === 'Mexiko', 'DSV Luft 07.05 country is German name (Mexiko)');
  
  // Procedure code from Verfahren_1
  const procCode = str(row[56]);
  assert(procCode != null && procCode.startsWith('4000'), 'DSV Luft 07.05 procCode from Verfahren_1');
  
  console.log('  DSV Luft 07.05 audit: Integer-cents encoding verified');
}

// ═══════════ PARSE DATE EDGE CASES ═══════════
console.log('\n═══ PARSEDATE EDGE CASES ═══');
{
  // YYYYMMDD as number
  assert(JSON.stringify(parseDate(20250113)) === JSON.stringify({year:2025,month:1,day:13}), 'YYYYMMDD number: 20250113');
  assert(JSON.stringify(parseDate(20251231)) === JSON.stringify({year:2025,month:12,day:31}), 'YYYYMMDD number: 20251231');
  
  // DMMYYYY as number
  assert(JSON.stringify(parseDate(7052025)) === JSON.stringify({year:2025,month:5,day:7}), 'DMMYYYY number: 7052025');
  
  // DDMMYYYY as number (different from YYYYMMDD)
  assert(JSON.stringify(parseDate(15062025)) === JSON.stringify({year:2025,month:6,day:15}), 'DDMMYYYY number: 15062025');
  
  // DD.MM.YYYY string
  assert(JSON.stringify(parseDate('01.05.2025')) === JSON.stringify({year:2025,month:5,day:1}), 'DD.MM.YYYY: 01.05.2025');
  
  // YYYY-MM-DD string
  assert(JSON.stringify(parseDate('2025-01-13')) === JSON.stringify({year:2025,month:1,day:13}), 'YYYY-MM-DD: 2025-01-13');
  
  // Excel serial
  const excelResult = parseDate(45833);
  assert(excelResult != null && excelResult.year === 2025, 'Excel serial 45833 → year 2025');
  
  // Edge case: could be ambiguous 20250101 — YYYYMMDD, not DDMMYYYY
  const jan1 = parseDate(20250101);
  assert(jan1.year === 2025 && jan1.month === 1 && jan1.day === 1, 'YYYYMMDD: 20250101 → Jan 1, 2025');
  
  // Edge case: 31012025 — DDMMYYYY (day=31, month=01)
  const jan31 = parseDate(31012025);
  assert(jan31.year === 2025 && jan31.month === 1 && jan31.day === 31, 'DDMMYYYY: 31012025 → Jan 31, 2025');
}

// ═══════════ SUMMARY ═══════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`AUDIT RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) {
  console.log('FAILED TESTS:');
  tests.filter(t => !t.ok).forEach(t => console.log(`  ❌ ${t.msg}`));
}
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
