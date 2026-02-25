/**
 * Analytics Engine — exhaustive validation tests
 *
 * Tests aggregateData(), mergeAnalytics(), and all compute* functions
 * using synthetic data for every supported broker.
 *
 * Run: node tests/test-analytics.mjs
 */

import {
  aggregateData,
  mergeAnalytics,
  renderKPICards,
  renderCountryTable,
  renderHSTable,
  renderBrokerBreakdownTable,
} from '../src/js/analytics.js';

/* ───── Test helpers ───── */

let passed = 0;
let failed = 0;
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n  ── ${name} ──`);
}

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    console.error(`    ✗ FAIL: ${label}`);
  }
}

function assertClose(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`    ✓ ${label} (${actual.toFixed(4)} ≈ ${expected.toFixed(4)})`);
  } else {
    failed++;
    console.error(`    ✗ FAIL: ${label} — got ${actual}, expected ≈${expected} (diff ${diff})`);
  }
}

/* ───── Synthetic row builders ───── */

/**
 * Create a DHL row (137 columns) with specific values set.
 */
function makeDHLRow(overrides = {}) {
  const row = new Array(137).fill(null);
  // Defaults: valid date, shipper country, HS code, etc.
  row[0]   = overrides.date          ?? '15.03.2025';
  row[4]   = overrides.declarationNo ?? '25DE000001';
  row[20]  = overrides.shipperName   ?? 'Test Shipper GmbH';
  row[24]  = overrides.shipperCountry ?? 'CN';
  row[26]  = overrides.consigneeName ?? 'Test Consignee AG';
  row[30]  = overrides.consigneeCountry ?? 'DE';
  row[31]  = overrides.incoterm      ?? 'DAP';
  row[33]  = overrides.freight       ?? 25.50;
  row[34]  = overrides.weight        ?? 12.5;
  row[109] = overrides.description   ?? 'Electronic components';
  row[110] = overrides.hsCode        ?? '85389099';
  row[111] = overrides.countryOfOrigin ?? 'CN';
  row[113] = overrides.procedureCode ?? '4000';
  row[117] = overrides.invoiceValue  ?? 500.00;
  row[118] = overrides.currency      ?? 'EUR';
  row[119] = overrides.exchangeRate  ?? 1.0;
  row[120] = overrides.dutyBasis     ?? 500.00;
  row[123] = overrides.duty          ?? 15.00;
  row[127] = overrides.vatAmount     ?? 97.85;
  return row;
}

/**
 * Create a FedEx row (92 columns) with specific values set.
 */
function makeFedExRow(overrides = {}) {
  const row = new Array(92).fill(null);
  row[7]   = overrides.date          ?? '15.03.2025';
  row[6]   = overrides.declarationNo ?? 'FX25000001';
  row[5]   = overrides.awb           ?? '1234567890';
  row[21]  = overrides.shipperCountry ?? 'US';
  row[15]  = overrides.consigneeName ?? 'Test Import GmbH';
  row[31]  = overrides.incoterm      ?? 'DAP';
  row[22]  = overrides.invoiceValueHeader ?? 1000.00;  // header-level
  row[23]  = overrides.currency      ?? 'USD';
  row[24]  = overrides.exchangeRate  ?? 0.92;
  row[27]  = overrides.grossWeight   ?? 5.2;
  row[56]  = overrides.hsCode        ?? '84713000';
  row[57]  = overrides.countryOfOrigin ?? 'US';
  row[58]  = overrides.procedureCode ?? '4000';
  row[64]  = overrides.description   ?? 'Laptop computer';
  row[65]  = overrides.netWeight     ?? 3.1;
  row[66]  = overrides.lineInvoice   ?? 450.00;  // line-level
  row[67]  = overrides.customsValue  ?? 450.00;
  row[68]  = overrides.eustValue     ?? 463.50;
  row[85]  = overrides.dutyRate      ?? 3.0;
  row[86]  = overrides.freightCost   ?? 35.00;
  row[91]  = overrides.dutyAmount    ?? 13.50;
  return row;
}

/**
 * Create a UPS row (65 columns) with specific values set.
 */
function makeUPSRow(overrides = {}) {
  const row = new Array(65).fill(null);
  row[0]   = overrides.date          ?? '15.03.2025';
  row[8]   = overrides.invoiceValue  ?? 200.00;
  row[9]   = overrides.currency      ?? 'EUR';
  row[10]  = overrides.exchangeRate  ?? 1.0;
  row[11]  = overrides.invoiceEUR    ?? 200.00;
  row[15]  = overrides.packageCount  ?? 1;
  row[16]  = overrides.grossWeight   ?? 8.3;
  row[17]  = overrides.freightAmount ?? 18.00;  // original currency
  row[20]  = overrides.freightEUR    ?? 18.00;  // EUR
  row[23]  = overrides.shipperCountry ?? 'GB';
  row[24]  = overrides.countryOfOrigin ?? 'GB';
  row[28]  = overrides.hsCode        ?? '39269097';
  row[29]  = overrides.description   ?? 'Plastic parts';
  row[30]  = overrides.dutyRate      ?? 6.5;
  row[31]  = overrides.customsValue  ?? 200.00;
  row[32]  = overrides.dutyAmount    ?? 13.00;
  row[38]  = overrides.eustRate      ?? 19;
  row[39]  = overrides.eustValue     ?? 213.00;
  row[40]  = overrides.eustAmount    ?? 40.47;
  row[45]  = overrides.incoterm      ?? 'EXW';
  row[47]  = overrides.euFreight     ?? 15.50;  // EU border freight
  return row;
}


/* ═══════════════════════════════════════════════
   Group 1: DHL aggregateData
   ═══════════════════════════════════════════════ */

group('1. DHL aggregateData — basic extraction');

{
  const headers = [['Date', 'EORI', '', '', 'Decl No']]; // not used for DHL (index-based)
  const data = [
    makeDHLRow({ date: '10.01.2025', countryOfOrigin: 'CN', invoiceValue: 500, duty: 15, vatAmount: 97.85, weight: 12.5 }),
    makeDHLRow({ date: '20.01.2025', countryOfOrigin: 'US', invoiceValue: 300, duty: 9, vatAmount: 58.71, weight: 8.0 }),
    makeDHLRow({ date: '15.02.2025', countryOfOrigin: 'CN', invoiceValue: 1200, duty: 36, vatAmount: 234.84, weight: 25.0 }),
  ];

  const a = aggregateData(headers, data, 'DHL');

  assert(a != null, 'aggregateData returns non-null');
  assert(a.brokerId === 'DHL', 'brokerId is DHL');
  assert(a.totalRows === 3, 'totalRows = 3');

  // KPIs
  assert(a.kpis.totalDeclarations === 3, 'KPI: totalDeclarations = 3');
  assertClose(a.kpis.totalInvoiceValue, 2000, 0.01, 'KPI: totalInvoiceValue = 2000');
  assertClose(a.kpis.totalDuty, 60, 0.01, 'KPI: totalDuty = 60');
  assertClose(a.kpis.totalVAT, 391.40, 0.01, 'KPI: totalVAT = 391.40');
  assertClose(a.kpis.totalWeight, 45.5, 0.01, 'KPI: totalWeight = 45.5');
  assertClose(a.kpis.effectiveDutyRate, 3.0, 0.01, 'KPI: effectiveDutyRate = 3%');
  assert(a.kpis.uniqueCountries === 2, 'KPI: uniqueCountries = 2 (CN, US)');
  assert(a.kpis.uniqueHSChapters === 1, 'KPI: uniqueHSChapters = 1 (85)');
  assert(a.kpis.monthsCovered === 2, 'KPI: monthsCovered = 2 (Jan, Feb)');
}


/* ═══════════════════════════════════════════════
   Group 2: DHL monthly aggregation
   ═══════════════════════════════════════════════ */

group('2. DHL monthly aggregation');

{
  const data = [
    makeDHLRow({ date: '10.01.2025', invoiceValue: 500, duty: 15, vatAmount: 97.85 }),
    makeDHLRow({ date: '20.01.2025', invoiceValue: 300, duty: 9, vatAmount: 58.71 }),
    makeDHLRow({ date: '15.02.2025', invoiceValue: 1200, duty: 36, vatAmount: 234.84 }),
  ];
  const a = aggregateData([[]], data, 'DHL');
  const monthly = a.monthly;

  assert(monthly.length === 2, 'monthly has 2 entries (Jan, Feb)');

  const jan = monthly.find(m => m.key === '2025-01');
  const feb = monthly.find(m => m.key === '2025-02');

  assert(jan != null, 'January entry exists');
  assert(feb != null, 'February entry exists');
  assert(jan.count === 2, 'Jan count = 2');
  assert(feb.count === 1, 'Feb count = 1');
  assertClose(jan.invoice, 800, 0.01, 'Jan invoice = 800');
  assertClose(feb.invoice, 1200, 0.01, 'Feb invoice = 1200');
  assertClose(jan.duty, 24, 0.01, 'Jan duty = 24');
  assertClose(feb.duty, 36, 0.01, 'Feb duty = 36');
}


/* ═══════════════════════════════════════════════
   Group 3: DHL country aggregation
   ═══════════════════════════════════════════════ */

group('3. DHL country aggregation');

{
  const data = [
    makeDHLRow({ countryOfOrigin: 'CN', invoiceValue: 500, duty: 15, vatAmount: 97 }),
    makeDHLRow({ countryOfOrigin: 'US', invoiceValue: 300, duty: 9, vatAmount: 58 }),
    makeDHLRow({ countryOfOrigin: 'CN', invoiceValue: 1200, duty: 36, vatAmount: 234 }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  assert(a.countries.length === 2, 'countries has 2 entries');
  const cn = a.countries.find(c => c.code === 'CN');
  const us = a.countries.find(c => c.code === 'US');

  assert(cn != null, 'CN entry exists');
  assert(cn.count === 2, 'CN count = 2');
  assertClose(cn.totalInvoice, 1700, 0.01, 'CN totalInvoice = 1700');
  assertClose(cn.totalDuty, 51, 0.01, 'CN totalDuty = 51');

  assert(us != null, 'US entry exists');
  assert(us.count === 1, 'US count = 1');
  assertClose(us.totalInvoice, 300, 0.01, 'US totalInvoice = 300');
}


/* ═══════════════════════════════════════════════
   Group 4: DHL HS chapters (with invoiceEUR fallback fix)
   ═══════════════════════════════════════════════ */

group('4. DHL HS chapters aggregation');

{
  const data = [
    makeDHLRow({ hsCode: '85389099', invoiceValue: 500, duty: 15, description: 'Electronic parts' }),
    makeDHLRow({ hsCode: '84713000', invoiceValue: 300, duty: 9, description: 'Laptop' }),
    makeDHLRow({ hsCode: '85340000', invoiceValue: 1200, duty: 36, description: 'Printed circuits' }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  assert(a.hsChapters.length === 2, 'hsChapters has 2 entries (85, 84)');
  const ch85 = a.hsChapters.find(h => h.chapter === '85');
  const ch84 = a.hsChapters.find(h => h.chapter === '84');

  assert(ch85 != null, 'Chapter 85 exists');
  assert(ch85.count === 2, 'Ch 85 count = 2');
  assertClose(ch85.totalInvoice, 1700, 0.01, 'Ch 85 totalInvoice = 1700');
  assertClose(ch85.totalDuty, 51, 0.01, 'Ch 85 totalDuty = 51');
  assert(ch85.descriptions.length > 0, 'Ch 85 has descriptions');

  assert(ch84 != null, 'Chapter 84 exists');
  assert(ch84.count === 1, 'Ch 84 count = 1');
}


/* ═══════════════════════════════════════════════
   Group 5: DHL duty distribution buckets
   ═══════════════════════════════════════════════ */

group('5. DHL duty distribution');

{
  const data = [
    makeDHLRow({ duty: 0 }),
    makeDHLRow({ duty: 15 }),
    makeDHLRow({ duty: 75 }),
    makeDHLRow({ duty: 350 }),
    makeDHLRow({ duty: 750 }),
    makeDHLRow({ duty: 2500 }),
  ];
  const a = aggregateData([[]], data, 'DHL');
  const dist = a.dutyDistribution;

  assert(dist.length === 6, 'duty distribution has 6 buckets');
  assert(dist[0].label === 'Zero duty', 'first bucket is Zero duty');
  assert(dist[0].count === 1, 'Zero duty: 1 declaration');
  assert(dist[1].count === 1, '0.01-50: 1 declaration (15)');
  assert(dist[2].count === 1, '50-200: 1 declaration (75)');
  assert(dist[3].count === 1, '200-500: 1 declaration (350)');
  assert(dist[4].count === 1, '500-1000: 1 declaration (750)');
  assert(dist[5].count === 1, '1000+: 1 declaration (2500)');
}


/* ═══════════════════════════════════════════════
   Group 6: FedEx aggregateData — line-level invoice fix
   ═══════════════════════════════════════════════ */

group('6. FedEx aggregateData — line-level invoice');

{
  const data = [
    // Same declaration with header-level invoice of 1000 but different line-level values
    makeFedExRow({ invoiceValueHeader: 1000, lineInvoice: 450, dutyAmount: 13.50, eustValue: 463.50 }),
    makeFedExRow({ invoiceValueHeader: 1000, lineInvoice: 550, dutyAmount: 16.50, eustValue: 566.50 }),
  ];
  const a = aggregateData([[]], data, 'FEDEX');

  assert(a.totalRows === 2, 'FedEx totalRows = 2');
  // With the fix, invoiceValue should use lineInvoice (col 66) = 450 + 550 = 1000
  // Without the fix, it would use invoiceValueHeader (col 22) = 1000 + 1000 = 2000
  assertClose(a.kpis.totalInvoiceValue, 1000, 0.01, 'FedEx total invoice uses line-level (450+550=1000), not header (1000+1000=2000)');
  assertClose(a.kpis.totalDuty, 30, 0.01, 'FedEx totalDuty = 30');

  // VAT should be computed from eustValue × 19%
  const expectedVAT = (463.50 + 566.50) * 19 / 100;
  assertClose(a.kpis.totalVAT, expectedVAT, 0.01, `FedEx totalVAT computed from eustValue × 19% = ${expectedVAT.toFixed(2)}`);
}


/* ═══════════════════════════════════════════════
   Group 7: FedEx with null lineInvoice — falls back to header
   ═══════════════════════════════════════════════ */

group('7. FedEx null lineInvoice fallback');

{
  const row = makeFedExRow({ invoiceValueHeader: 800 });
  // Explicitly clear line-level invoice to test fallback
  row[66] = null;
  const data = [row];
  const a = aggregateData([[]], data, 'FEDEX');

  assertClose(a.kpis.totalInvoiceValue, 800, 0.01, 'Falls back to header invoice when lineInvoice is null');
}


/* ═══════════════════════════════════════════════
   Group 8: UPS aggregateData — EUR freight priority fix
   ═══════════════════════════════════════════════ */

group('8. UPS aggregateData — EUR freight priority');

{
  const data = [
    makeUPSRow({ freightAmount: 20.00, freightEUR: 18.40, euFreight: 15.50 }),
    makeUPSRow({ freightAmount: 30.00, freightEUR: 27.60, euFreight: 22.00 }),
  ];
  const a = aggregateData([[]], data, 'UPS');

  // With fix: freight should use euFreight (col 47) = 15.50 + 22.00 = 37.50
  // Without fix: would use freightAmount (col 17) = 20.00 + 30.00 = 50.00
  assertClose(a.kpis.totalFreight, 37.50, 0.01, 'UPS freight uses euFreight (EUR, col 47) not freightAmount (original, col 17)');
}


/* ═══════════════════════════════════════════════
   Group 9: UPS weight from grossWeight
   ═══════════════════════════════════════════════ */

group('9. UPS weight extraction');

{
  const data = [
    makeUPSRow({ grossWeight: 8.3 }),
    makeUPSRow({ grossWeight: 15.7 }),
  ];
  const a = aggregateData([[]], data, 'UPS');

  assertClose(a.kpis.totalWeight, 24.0, 0.01, 'UPS totalWeight from grossWeight = 24.0');
}


/* ═══════════════════════════════════════════════
   Group 10: UPS invoiceEUR fallback in HS chapters
   ═══════════════════════════════════════════════ */

group('10. UPS HS chapter invoice uses invoiceEUR fallback');

{
  // UPS rows with invoiceValue in foreign currency but invoiceEUR in EUR
  const data = [
    makeUPSRow({ invoiceValue: null, invoiceEUR: 200, hsCode: '39269097', duty: 13 }),
    makeUPSRow({ invoiceValue: null, invoiceEUR: 350, hsCode: '39269097', duty: 22.75 }),
  ];

  // Override: set invoiceValue (col 8) to null, keep invoiceEUR (col 11)
  data[0][8] = null;
  data[1][8] = null;

  const a = aggregateData([[]], data, 'UPS');
  const ch39 = a.hsChapters.find(h => h.chapter === '39');

  assert(ch39 != null, 'Chapter 39 exists');
  // With the fix: invoiceEUR fallback should work in HS chapters
  assertClose(ch39.totalInvoice, 550, 0.01, 'Ch 39 totalInvoice uses invoiceEUR fallback = 550');
}


/* ═══════════════════════════════════════════════
   Group 11: Currency and Incoterm aggregation
   ═══════════════════════════════════════════════ */

group('11. Currency and Incoterm aggregation');

{
  const data = [
    makeDHLRow({ currency: 'EUR', incoterm: 'DAP', invoiceValue: 500 }),
    makeDHLRow({ currency: 'USD', incoterm: 'EXW', invoiceValue: 300 }),
    makeDHLRow({ currency: 'EUR', incoterm: 'DAP', invoiceValue: 700 }),
    makeDHLRow({ currency: 'CNY', incoterm: 'FOB', invoiceValue: 1200 }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  assert(a.currencies.length === 3, 'currencies has 3 entries (EUR, USD, CNY)');
  const eur = a.currencies.find(c => c.code === 'EUR');
  assert(eur.count === 2, 'EUR count = 2');
  assertClose(eur.totalInvoice, 1200, 0.01, 'EUR totalInvoice = 1200');

  assert(a.incoterms.length === 3, 'incoterms has 3 entries');
  const dap = a.incoterms.find(i => i.code === 'DAP');
  assert(dap.count === 2, 'DAP count = 2');
}


/* ═══════════════════════════════════════════════
   Group 12: Weight and invoice distribution
   ═══════════════════════════════════════════════ */

group('12. Weight and invoice distribution');

{
  const data = [
    makeDHLRow({ weight: 0.5, invoiceValue: 30 }),
    makeDHLRow({ weight: 3.0, invoiceValue: 150 }),
    makeDHLRow({ weight: 15.0, invoiceValue: 350 }),
    makeDHLRow({ weight: 50.0, invoiceValue: 800 }),
    makeDHLRow({ weight: 250.0, invoiceValue: 3000 }),
    makeDHLRow({ weight: 600.0, invoiceValue: 25000 }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  // Weight distribution
  const wd = a.weightAnalysis;
  assert(wd[0].count === 1, 'Weight <1kg: 1 (0.5)');
  assert(wd[1].count === 1, 'Weight 1-5kg: 1 (3.0)');
  assert(wd[2].count === 1, 'Weight 5-20kg: 1 (15.0)');
  assert(wd[3].count === 1, 'Weight 20-100kg: 1 (50.0)');
  assert(wd[4].count === 1, 'Weight 100-500kg: 1 (250.0)');
  assert(wd[5].count === 1, 'Weight 500+kg: 1 (600.0)');

  // Invoice distribution
  const id = a.invoiceDistribution;
  assert(id[0].count === 1, 'Invoice <50: 1 (30)');
  assert(id[1].count === 1, 'Invoice 50-200: 1 (150)');
  assert(id[2].count === 1, 'Invoice 200-500: 1 (350)');
  assert(id[3].count === 1, 'Invoice 500-1K: 1 (800)');
  assert(id[4].count === 1, 'Invoice 1K-5K: 1 (3000)');
  assert(id[5].count === 0, 'Invoice 5K-20K: 0');
  assert(id[6].count === 1, 'Invoice 20K+: 1 (25000)');
}


/* ═══════════════════════════════════════════════
   Group 13: Duty rate by country
   ═══════════════════════════════════════════════ */

group('13. Duty rate by country');

{
  const data = [
    makeDHLRow({ countryOfOrigin: 'CN', invoiceValue: 500, duty: 25 }),
    makeDHLRow({ countryOfOrigin: 'CN', invoiceValue: 500, duty: 25 }),
    makeDHLRow({ countryOfOrigin: 'US', invoiceValue: 300, duty: 0 }),
    makeDHLRow({ countryOfOrigin: 'US', invoiceValue: 700, duty: 0 }),
    // JP has only 1 declaration — should be filtered (requires ≥2)
    makeDHLRow({ countryOfOrigin: 'JP', invoiceValue: 200, duty: 10 }),
  ];
  const a = aggregateData([[]], data, 'DHL');
  const drc = a.dutyRateByCountry;

  assert(drc.length === 2, 'dutyRateByCountry has 2 entries (CN, US; JP filtered)');
  const cn = drc.find(d => d.code === 'CN');
  const us = drc.find(d => d.code === 'US');

  assert(cn != null, 'CN in duty rate');
  assertClose(cn.effectiveRate, 5.0, 0.01, 'CN effective rate = 5%');
  assertClose(cn.totalDuty, 50, 0.01, 'CN totalDuty = 50');

  assert(us != null, 'US in duty rate');
  assertClose(us.effectiveRate, 0.0, 0.01, 'US effective rate = 0%');
}


/* ═══════════════════════════════════════════════
   Group 14: Procedure codes
   ═══════════════════════════════════════════════ */

group('14. Procedure codes');

{
  const data = [
    makeDHLRow({ procedureCode: '4000' }),
    makeDHLRow({ procedureCode: '4000' }),
    makeDHLRow({ procedureCode: '5300' }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  assert(a.procedureCodes.length === 2, 'procedureCodes has 2 entries');
  const p4000 = a.procedureCodes.find(p => p.code === '4000');
  assert(p4000.count === 2, '4000 count = 2');
}


/* ═══════════════════════════════════════════════
   Group 15: Weight sanity cap (>500,000 kg filtered)
   ═══════════════════════════════════════════════ */

group('15. Weight sanity cap');

{
  const data = [
    makeDHLRow({ weight: 600000 }),  // > 500,000 → null
    makeDHLRow({ weight: 10 }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  assertClose(a.kpis.totalWeight, 10, 0.01, 'Weight >500,000 kg is excluded');
  assert(a.weightAnalysis.reduce((s, b) => s + b.count, 0) === 1, 'Only 1 row in weight analysis');
}


/* ═══════════════════════════════════════════════
   Group 16: mergeAnalytics — 2 brokers
   ═══════════════════════════════════════════════ */

group('16. mergeAnalytics — two brokers combined');

{
  const dhlData = [
    makeDHLRow({ date: '10.01.2025', countryOfOrigin: 'CN', invoiceValue: 500, duty: 15, vatAmount: 97, weight: 12 }),
    makeDHLRow({ date: '20.02.2025', countryOfOrigin: 'US', invoiceValue: 300, duty: 9, vatAmount: 58, weight: 8 }),
  ];
  const upsData = [
    makeUPSRow({ date: '15.01.2025', countryOfOrigin: 'CN', invoiceValue: 200, dutyAmount: 13, eustAmount: 40, grossWeight: 5 }),
    makeUPSRow({ date: '25.03.2025', countryOfOrigin: 'JP', invoiceValue: 400, dutyAmount: 20, eustAmount: 79, grossWeight: 15 }),
  ];

  const dhlAnalytics = aggregateData([[]], dhlData, 'DHL');
  const upsAnalytics = aggregateData([[]], upsData, 'UPS');

  const reports = [
    { brokerId: 'DHL', brokerLabel: 'DHL Express', analytics: dhlAnalytics },
    { brokerId: 'UPS', brokerLabel: 'UPS', analytics: upsAnalytics },
  ];

  const overall = mergeAnalytics(reports);

  assert(overall != null, 'mergeAnalytics returns non-null');
  assert(overall.brokerId === 'OVERALL', 'brokerId is OVERALL');
  assert(overall.totalRows === 4, 'totalRows = 4 (2 DHL + 2 UPS)');

  // KPI sums
  assertClose(overall.kpis.totalInvoiceValue, 1400, 0.01, 'Total invoice = 1400 (500+300+200+400)');
  assertClose(overall.kpis.totalDuty, 57, 0.01, 'Total duty = 57 (15+9+13+20)');
  assertClose(overall.kpis.totalVAT, 274, 0.01, 'Total VAT = 274 (97+58+40+79)');

  // Countries should be merged
  assert(overall.countries.length === 3, 'countries = 3 (CN, US, JP)');
  const cn = overall.countries.find(c => c.code === 'CN');
  assert(cn.count === 2, 'CN count = 2 (1 DHL + 1 UPS)');
  assertClose(cn.totalInvoice, 700, 0.01, 'CN invoice = 700 (500+200)');

  // Monthly: Jan has entries from both brokers
  const jan = overall.monthly.find(m => m.key === '2025-01');
  assert(jan != null, 'January exists in merged monthly');
  assert(jan.count === 2, 'Jan count = 2 (1 DHL + 1 UPS)');

  // Broker breakdown
  assert(overall.brokerBreakdown.length === 2, 'brokerBreakdown has 2 entries');
  const dhlBd = overall.brokerBreakdown.find(b => b.brokerId === 'DHL');
  assert(dhlBd.totalRows === 2, 'DHL breakdown totalRows = 2');
  assertClose(dhlBd.totalInvoice, 800, 0.01, 'DHL breakdown totalInvoice = 800');

  // Effective duty rate
  assertClose(overall.kpis.effectiveDutyRate, 57 / 1400 * 100, 0.01, 'Effective duty rate = 57/1400*100');
}


/* ═══════════════════════════════════════════════
   Group 17: mergeAnalytics — single broker passthrough
   ═══════════════════════════════════════════════ */

group('17. mergeAnalytics — single broker');

{
  const data = [makeDHLRow({ invoiceValue: 500, duty: 15, vatAmount: 97 })];
  const analytics = aggregateData([[]], data, 'DHL');

  const overall = mergeAnalytics([{ brokerId: 'DHL', brokerLabel: 'DHL Express', analytics }]);

  assert(overall != null, 'Single-broker merge returns non-null');
  assert(overall.brokerId === 'OVERALL', 'brokerId is OVERALL');
  assert(overall.brokerBreakdown.length === 1, 'brokerBreakdown has 1 entry');
  assertClose(overall.kpis.totalInvoiceValue, 500, 0.01, 'Invoice value passed through');
}


/* ═══════════════════════════════════════════════
   Group 18: mergeAnalytics — distribution bucket merge
   ═══════════════════════════════════════════════ */

group('18. mergeAnalytics — distribution bucket merge');

{
  const dhlData = [
    makeDHLRow({ duty: 0 }),     // bucket 0: zero
    makeDHLRow({ duty: 25 }),    // bucket 1: 0.01-50
    makeDHLRow({ duty: 750 }),   // bucket 4: 500-1000
  ];
  const upsData = [
    makeUPSRow({ dutyAmount: 100 }),  // bucket 2: 50-200
    makeUPSRow({ dutyAmount: 25 }),   // bucket 1: 0.01-50
  ];

  const dhlA = aggregateData([[]], dhlData, 'DHL');
  const upsA = aggregateData([[]], upsData, 'UPS');

  const overall = mergeAnalytics([
    { brokerId: 'DHL', brokerLabel: 'DHL Express', analytics: dhlA },
    { brokerId: 'UPS', brokerLabel: 'UPS', analytics: upsA },
  ]);

  const dist = overall.dutyDistribution;
  assert(dist[0].count === 1, 'Merged zero duty: 1');
  assert(dist[1].count === 2, 'Merged 0.01-50: 2 (1 DHL + 1 UPS)');
  assert(dist[2].count === 1, 'Merged 50-200: 1');
  assert(dist[4].count === 1, 'Merged 500-1000: 1');
}


/* ═══════════════════════════════════════════════
   Group 19: HTML generators produce valid output
   ═══════════════════════════════════════════════ */

group('19. HTML generators');

{
  const data = [
    makeDHLRow({ countryOfOrigin: 'CN', invoiceValue: 500, duty: 15, vatAmount: 97 }),
    makeDHLRow({ countryOfOrigin: 'US', invoiceValue: 300, duty: 9, vatAmount: 58 }),
  ];
  const a = aggregateData([[]], data, 'DHL');

  const kpiHTML = renderKPICards(a.kpis);
  assert(typeof kpiHTML === 'string', 'renderKPICards returns string');
  assert(kpiHTML.includes('Total Declarations'), 'KPI HTML includes Total Declarations');
  assert(kpiHTML.includes('Effective Duty Rate'), 'KPI HTML includes Effective Duty Rate');

  const countryHTML = renderCountryTable(a.countries);
  assert(typeof countryHTML === 'string', 'renderCountryTable returns string');
  assert(countryHTML.includes('CN'), 'Country table includes CN');
  assert(countryHTML.includes('<table'), 'Country table has table element');

  const hsHTML = renderHSTable(a.hsChapters);
  assert(typeof hsHTML === 'string', 'renderHSTable returns string');
  assert(hsHTML.includes('Ch. 85'), 'HS table includes Ch. 85');

  // Empty data case
  const emptyCountry = renderCountryTable([]);
  assert(emptyCountry.includes('No country data'), 'Empty country table shows no-data message');

  const emptyHS = renderHSTable([]);
  assert(emptyHS.includes('No HS code data'), 'Empty HS table shows no-data message');
}


/* ═══════════════════════════════════════════════
   Group 20: Broker breakdown table generator
   ═══════════════════════════════════════════════ */

group('20. Broker breakdown table');

{
  const breakdown = [
    { brokerLabel: 'DHL Express', totalRows: 100, totalInvoice: 50000, totalDuty: 1500, totalVAT: 10000 },
    { brokerLabel: 'UPS', totalRows: 50, totalInvoice: 25000, totalDuty: 750, totalVAT: 5000 },
  ];

  const html = renderBrokerBreakdownTable(breakdown);
  assert(typeof html === 'string', 'renderBrokerBreakdownTable returns string');
  assert(html.includes('DHL Express'), 'Breakdown includes DHL Express');
  assert(html.includes('UPS'), 'Breakdown includes UPS');
  assert(html.includes('66.7'), 'Share percentage for DHL (100/150 = 66.7%)');

  // Empty case
  const emptyHtml = renderBrokerBreakdownTable([]);
  assert(emptyHtml.includes('No broker data'), 'Empty breakdown shows no-data message');
}


/* ═══════════════════════════════════════════════
   Group 21: Date parsing edge cases
   ═══════════════════════════════════════════════ */

group('21. Date parsing edge cases');

{
  // Excel serial date (e.g., 45736 = approx 2025-03-15)
  const row1 = makeDHLRow({ date: 45736 });
  const a1 = aggregateData([[]], [row1], 'DHL');
  assert(a1.monthly.length === 1, 'Excel serial date parsed into 1 month');
  assert(a1.monthly[0].key !== 'Unknown', 'Excel serial date not Unknown');

  // YYYY-MM-DD format
  const row2 = makeDHLRow({ date: '2025-03-15' });
  const a2 = aggregateData([[]], [row2], 'DHL');
  assert(a2.monthly[0].key === '2025-03', 'YYYY-MM-DD parsed correctly');

  // DD.MM.YYYY format
  const row3 = makeDHLRow({ date: '15.03.2025' });
  const a3 = aggregateData([[]], [row3], 'DHL');
  assert(a3.monthly[0].key === '2025-03', 'DD.MM.YYYY parsed correctly');

  // Null date → Unknown
  const row4 = makeDHLRow({});
  row4[0] = null;  // Explicitly null date (can't use ?? override with null)
  const a4 = aggregateData([[]], [row4], 'DHL');
  assert(a4.monthly[0].key === 'Unknown', 'Null date → Unknown month');
  assert(a4.kpis.monthsCovered === 0, 'Null date → monthsCovered = 0');
}


/* ═══════════════════════════════════════════════
   Group 22: Country normalisation (German names)
   ═══════════════════════════════════════════════ */

group('22. Country normalisation');

{
  // Test with German country names (used by DSV)
  const dhlData = [
    makeDHLRow({ countryOfOrigin: 'CN' }),  // Already ISO
    makeDHLRow({ countryOfOrigin: 'DE' }),  // Already ISO
  ];
  const a = aggregateData([[]], dhlData, 'DHL');
  assert(a.countries.find(c => c.code === 'CN') != null, 'CN preserved as-is');
  assert(a.countries.find(c => c.code === 'DE') != null, 'DE preserved as-is');
}


/* ═══════════════════════════════════════════════
   Group 23: Incoterm and currency validation filters
   ═══════════════════════════════════════════════ */

group('23. Incoterm and currency validation');

{
  const data = [
    makeDHLRow({ currency: 'EUR', incoterm: 'DAP' }),                  // valid
    makeDHLRow({ currency: '12345', incoterm: 'DAP' }),                // invalid currency (numeric)
    makeDHLRow({ currency: 'EURO', incoterm: 'DAP' }),                 // invalid (too long)
    makeDHLRow({ currency: 'EUR', incoterm: 'Some Company Name' }),    // invalid incoterm (too long)
  ];
  const a = aggregateData([[]], data, 'DHL');

  assert(a.currencies.length === 1, 'Only valid EUR currency kept');
  assert(a.currencies[0].code === 'EUR', 'Valid currency is EUR');
  assert(a.currencies[0].count === 2, 'EUR appears in 2 rows (rows 0 and 3)');

  // Invalid incoterms (>5 chars) filtered
  assert(a.incoterms.length === 1, 'Only valid DAP incoterm kept');
  assert(a.incoterms[0].count === 3, 'DAP count = 3 (invalid one filtered)');
}


/* ═══════════════════════════════════════════════
   Group 24: mergeAnalytics — HS chapter description merge
   ═══════════════════════════════════════════════ */

group('24. mergeAnalytics — HS description merge');

{
  const dhlData = [
    makeDHLRow({ hsCode: '85389099', description: 'DHL electronic parts' }),
  ];
  const upsData = [
    makeUPSRow({ hsCode: '85340000', description: 'UPS circuit boards' }),
  ];

  const dhlA = aggregateData([[]], dhlData, 'DHL');
  const upsA = aggregateData([[]], upsData, 'UPS');

  const overall = mergeAnalytics([
    { brokerId: 'DHL', brokerLabel: 'DHL Express', analytics: dhlA },
    { brokerId: 'UPS', brokerLabel: 'UPS', analytics: upsA },
  ]);

  const ch85 = overall.hsChapters.find(h => h.chapter === '85');
  assert(ch85 != null, 'Chapter 85 exists in merged data');
  assert(ch85.count === 2, 'Ch 85 merged count = 2');
  assert(ch85.descriptions.length >= 2, 'Ch 85 has descriptions from both brokers');
}


/* ═══════════════════════════════════════════════
   Group 25: mergeAnalytics — brokerMonthly data
   ═══════════════════════════════════════════════ */

group('25. mergeAnalytics — brokerMonthly data');

{
  const dhlData = [
    makeDHLRow({ date: '10.01.2025', invoiceValue: 500 }),
    makeDHLRow({ date: '15.02.2025', invoiceValue: 700 }),
  ];
  const upsData = [
    makeUPSRow({ date: '20.01.2025', invoiceValue: 300 }),
  ];

  const dhlA = aggregateData([[]], dhlData, 'DHL');
  const upsA = aggregateData([[]], upsData, 'UPS');

  const overall = mergeAnalytics([
    { brokerId: 'DHL', brokerLabel: 'DHL Express', analytics: dhlA },
    { brokerId: 'UPS', brokerLabel: 'UPS', analytics: upsA },
  ]);

  assert(overall.brokerMonthly != null, 'brokerMonthly exists');
  assert(overall.brokerMonthly['DHL'] != null, 'DHL monthly data exists');
  assert(overall.brokerMonthly['UPS'] != null, 'UPS monthly data exists');
  assert(overall.brokerMonthly['DHL']['2025-01'] != null, 'DHL Jan data exists');
  assert(overall.brokerMonthly['DHL']['2025-02'] != null, 'DHL Feb data exists');
  assert(overall.brokerMonthly['UPS']['2025-01'] != null, 'UPS Jan data exists');
  assert(overall.brokerMonthly['UPS']['2025-02'] == null, 'UPS Feb data is null (no data)');

  // Combined monthly totals
  const jan = overall.monthly.find(m => m.key === '2025-01');
  assert(jan.count === 2, 'Combined Jan count = 2');
}


/* ═══════════════════════════════════════════════
   Group 26: Edge cases — empty data, null rows
   ═══════════════════════════════════════════════ */

group('26. Edge cases');

{
  // Empty data array
  const a1 = aggregateData([[]], [], 'DHL');
  assert(a1 != null, 'Empty data returns non-null analytics');
  assert(a1.totalRows === 0, 'Empty data totalRows = 0');
  assert(a1.kpis.totalDeclarations === 0, 'Empty data totalDeclarations = 0');
  assert(a1.monthly.length === 0, 'Empty data monthly is empty');
  assert(a1.countries.length === 0, 'Empty data countries is empty');

  // Null rows in data array
  const a2 = aggregateData([[]], [null, makeDHLRow({}), null], 'DHL');
  assert(a2.totalRows === 1, 'Null rows filtered, totalRows = 1');

  // Unknown broker
  const a3 = aggregateData([[]], [makeDHLRow({})], 'UNKNOWN_BROKER');
  assert(a3 === null, 'Unknown broker returns null');

  // mergeAnalytics with null/empty
  assert(mergeAnalytics(null) === null, 'mergeAnalytics(null) = null');
  assert(mergeAnalytics([]) === null, 'mergeAnalytics([]) = null');
}


/* ═══════════════════════════════════════════════
   Group 27: KPI averages use correct denominators
   ═══════════════════════════════════════════════ */

group('27. KPI averages use correct denominators');

{
  const data = [
    makeDHLRow({ invoiceValue: 1000, duty: 30, weight: 10, freight: 20 }),
    makeDHLRow({ invoiceValue: null, duty: null, weight: null, freight: null }),
    makeDHLRow({ invoiceValue: 500, duty: 15, weight: 5, freight: 10 }),
  ];

  // Clear out null values explicitly
  data[1][117] = null;
  data[1][123] = null;
  data[1][34]  = null;
  data[1][33]  = null;

  const a = aggregateData([[]], data, 'DHL');

  assert(a.kpis.totalDeclarations === 3, 'totalDeclarations = 3 (all rows)');
  // avgInvoiceValue should be 1500 / 2 (only 2 non-null positive values)
  assertClose(a.kpis.avgInvoiceValue, 750, 0.01, 'avgInvoiceValue = 750 (1500/2, ignoring null row)');
  // avgDuty: 45 / 2
  assertClose(a.kpis.avgDuty, 22.5, 0.01, 'avgDuty = 22.5 (45/2)');
  // avgWeightPerShipment: 15 / 2
  assertClose(a.kpis.avgWeightPerShipment, 7.5, 0.01, 'avgWeightPerShipment = 7.5 (15/2)');
  // avgFreightPerShipment: 30 / 2
  assertClose(a.kpis.avgFreightPerShipment, 15, 0.01, 'avgFreightPerShipment = 15 (30/2)');
}


/* ═══════════════════════════════════════════════
   Group 28: Comprehensive DHL-to-UPS cross-check
   ═══════════════════════════════════════════════ */

group('28. Cross-broker value consistency');

{
  // Create identical economic transactions via different brokers
  // DHL: direct duty and VAT columns
  const dhl = makeDHLRow({ invoiceValue: 1000, duty: 50, vatAmount: 199.50, countryOfOrigin: 'CN' });

  // UPS: duty in col 32, EUSt amount in col 40
  const ups = makeUPSRow({ invoiceValue: 1000, dutyAmount: 50, eustAmount: 199.50, countryOfOrigin: 'CN' });

  const dhlA = aggregateData([[]], [dhl], 'DHL');
  const upsA = aggregateData([[]], [ups], 'UPS');

  // Both should produce identical KPIs for the same economic transaction
  assertClose(dhlA.kpis.totalInvoiceValue, upsA.kpis.totalInvoiceValue, 0.01,
    'DHL and UPS produce same totalInvoiceValue for identical transaction');
  assertClose(dhlA.kpis.totalDuty, upsA.kpis.totalDuty, 0.01,
    'DHL and UPS produce same totalDuty for identical transaction');
  assertClose(dhlA.kpis.totalVAT, upsA.kpis.totalVAT, 0.01,
    'DHL and UPS produce same totalVAT for identical transaction');
  assertClose(dhlA.kpis.effectiveDutyRate, upsA.kpis.effectiveDutyRate, 0.01,
    'DHL and UPS produce same effectiveDutyRate for identical transaction');
}


/* ═══════════════════════════════════════════════
   Final Summary
   ═══════════════════════════════════════════════ */

console.log('\n' + '═'.repeat(50));
console.log(`  Analytics Tests: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('═'.repeat(50));

if (failed > 0) {
  process.exit(1);
}
