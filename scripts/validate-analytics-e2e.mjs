/**
 * Analytics E2E Validation — uses the actual engine.js merge pipeline
 * then feeds the result to analytics.js, exactly as the app does.
 *
 * This requires running through mergeFiles() which does header alignment.
 */
import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { BROKERS } from '../src/js/brokers.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// Import engine and analytics
const { aggregateData, renderKPICards, renderCountryTable, renderHSTable } = await import('file://' + join(import.meta.dirname, '..', 'src', 'js', 'analytics.js'));
const { mergeFiles } = await import('file://' + join(import.meta.dirname, '..', 'src', 'js', 'engine.js'));

const BASE = join(import.meta.dirname, '..');

/**
 * Create a mock File object from a real file path.
 * The browser File API has .name and .arrayBuffer(), which engine.parseFile uses.
 */
function mockFile(filePath, name) {
  const content = readFileSync(filePath);
  return {
    name: name,
    arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
    // PapaParse may try to read as text for CSV
    text: async () => readFileSync(filePath, 'utf-8'),
  };
}

/**
 * Run merge + analytics for a broker and validate the results.
 */
async function validateBroker(brokerId, dir) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${brokerId} — Full Pipeline Validation (mergeFiles → aggregateData)`);
  console.log('═'.repeat(70));

  const broker = BROKERS.find(b => b.id === brokerId);
  if (!broker) {
    console.log('  ❌ Broker not found in BROKERS config');
    return;
  }

  // Collect mock File objects
  let fileList;
  try {
    fileList = readdirSync(dir)
      .filter(f => (f.endsWith('.xlsx') || f.endsWith('.csv')) && !f.startsWith('DSV_Consolidated') && !f.startsWith('~'))
      .map(f => mockFile(join(dir, f), f));
  } catch (e) {
    console.log(`  ❌ Cannot read directory: ${e.message}`);
    return;
  }

  if (fileList.length === 0) {
    console.log('  ❌ No files found');
    return;
  }

  console.log(`  Files: ${fileList.length} (${fileList.map(f => f.name.substring(0, 30)).join(', ')})`);

  // Run merge
  let merged;
  try {
    merged = await mergeFiles(fileList, broker, (msg) => {
      // Silent progress
    });
  } catch (e) {
    console.log(`  ❌ mergeFiles failed: ${e.message}`);
    console.log(e.stack);
    return;
  }

  console.log(`  Merged: ${merged.data.length} rows, ${(merged.headers[0] || []).length} cols`);
  console.log(`  Skipped: ${merged.stats.skippedFiles.length} files`);
  if (merged.stats.skippedFiles.length > 0) {
    for (const sf of merged.stats.skippedFiles) {
      console.log(`    ⚠ ${sf.name}: ${sf.error}`);
    }
  }

  // Show merged header (first 20 cols) for reference
  const hdr = (merged.headers[0] || []).map(h => h != null ? String(h).trim() : '');
  console.log(`\n  ┌─── Merged Header (first 30 cols) ───`);
  for (let i = 0; i < Math.min(30, hdr.length); i++) {
    if (hdr[i]) console.log(`  │ [${String(i).padStart(3)}] ${hdr[i]}`);
  }

  // Run analytics
  let analytics;
  try {
    analytics = aggregateData(merged.headers, merged.data, brokerId);
  } catch (e) {
    console.log(`  ❌ aggregateData failed: ${e.message}`);
    console.log(e.stack);
    return;
  }

  if (!analytics) {
    console.log('  ❌ aggregateData returned null');
    return;
  }

  console.log(`\n  ✅ Records: ${analytics.totalRows}`);

  // ── KPIs ──
  const k = analytics.kpis;
  console.log('\n  ┌─── KPIs ───');
  console.log(`  │ Total Declarations:  ${k.totalDeclarations}`);
  console.log(`  │ Total Invoice Value: ${k.totalInvoiceValue.toFixed(2)} EUR`);
  console.log(`  │ Total Duty:          ${k.totalDuty.toFixed(2)} EUR`);
  console.log(`  │ Total VAT:           ${k.totalVAT.toFixed(2)} EUR`);
  console.log(`  │ Effective Duty Rate: ${k.effectiveDutyRate.toFixed(2)}%`);
  console.log(`  │ Total Freight:       ${k.totalFreight.toFixed(2)} EUR`);
  console.log(`  │ Total Weight:        ${k.totalWeight.toFixed(2)} kg`);
  console.log(`  │ Countries:           ${k.uniqueCountries}`);
  console.log(`  │ HS Chapters:         ${k.uniqueHSChapters}`);
  console.log(`  │ Months:              ${k.monthsCovered}`);

  let issues = 0;

  // ── Sanity checks ──
  if (k.totalDeclarations === 0) { console.log('  ❌ ISSUE: Zero declarations!'); issues++; }
  if (k.totalInvoiceValue === 0 && brokerId !== 'KN' && brokerId !== 'SCHENKER') { console.log('  ⚠ ISSUE: Zero invoice value'); issues++; }
  if (k.totalInvoiceValue > 1e10 && brokerId !== 'DSV') { console.log('  ❌ ISSUE: Invoice value implausibly high (>10B EUR) — likely column shift contamination'); issues++; }
  if (k.totalDuty === 0 && brokerId !== 'KN' && brokerId !== 'SCHENKER') { console.log('  ⚠ ISSUE: Zero duty'); issues++; }
  if (k.totalVAT === 0 && brokerId !== 'KN' && brokerId !== 'SCHENKER') { console.log('  ⚠ ISSUE: Zero VAT'); issues++; }
  if (k.totalVAT > 1e8) { console.log('  ❌ ISSUE: VAT implausibly high (>100M EUR)'); issues++; }
  if (k.totalWeight === 0) { console.log('  ⚠ ISSUE: Zero weight'); issues++; }
  if (k.totalWeight > 1e6) { console.log('  ❌ ISSUE: Weight implausibly high (>1M kg)'); issues++; }
  if (k.uniqueCountries === 0) { console.log('  ⚠ ISSUE: Zero countries'); issues++; }
  if (k.uniqueHSChapters === 0) { console.log('  ⚠ ISSUE: Zero HS chapters'); issues++; }
  if (k.monthsCovered === 0) { console.log('  ❌ ISSUE: Zero months'); issues++; }

  // ── Currencies check ──
  console.log('\n  ┌─── Currencies ───');
  let badCurrencies = 0;
  for (const c of analytics.currencies) {
    const isBad = c.code && (c.code.length > 3 || /^\d/.test(c.code) || c.code.includes(',') || c.code.includes('.'));
    if (isBad) badCurrencies++;
    if (c.count >= 5 || isBad) {
      console.log(`  │ ${(isBad ? '❌ ' : '   ') + c.code.padEnd(8)} │ count: ${String(c.count).padStart(4)} │ invoice: ${c.totalInvoice.toFixed(0).padStart(12)}`);
    }
  }
  if (badCurrencies > 0) { console.log(`  ⚠ ISSUE: ${badCurrencies} invalid currency codes (numeric or >3 chars)`); issues++; }

  // ── Countries check ──
  console.log('\n  ┌─── Top 10 Countries ───');
  for (const c of analytics.countries.slice(0, 10)) {
    const isBad = c.code && (c.code.length > 2 || /^\d/.test(c.code));
    if (isBad) console.log(`  │ ❌ ${c.code.padEnd(4)} │ count: ${String(c.count).padStart(4)} — INVALID COUNTRY CODE`);
    else console.log(`  │    ${c.code.padEnd(4)} │ count: ${String(c.count).padStart(4)} │ invoice: ${c.totalInvoice.toFixed(0).padStart(12)}`);
  }

  // ── Incoterms check ──
  console.log('\n  ┌─── Incoterms ───');
  let badIncoterms = 0;
  const validIncoterms = new Set(['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'DAT', 'DDU', 'XXX']);
  for (const i of analytics.incoterms.slice(0, 10)) {
    const isValid = validIncoterms.has(i.code);
    if (!isValid) badIncoterms++;
    console.log(`  │ ${(isValid ? '   ' : '❌ ') + (i.code || 'null').substring(0, 30).padEnd(32)} │ count: ${String(i.count).padStart(4)}`);
  }
  if (badIncoterms > 0) { console.log(`  ⚠ ISSUE: ${badIncoterms} invalid incoterm values`); issues++; }

  // ── Procedure Codes check ──
  console.log('\n  ┌─── Procedure Codes ───');
  let badProcCodes = 0;
  for (const p of analytics.procedureCodes.slice(0, 8)) {
    const isValid = /^\d{3,4}$/.test(p.code);
    if (!isValid && p.code !== 'IMDC') badProcCodes++;
    console.log(`  │ ${(isValid ? '   ' : '⚠  ') + (p.code || 'null').substring(0, 30).padEnd(32)} │ count: ${String(p.count).padStart(4)}`);
  }
  if (badProcCodes > 0) { console.log(`  ⚠ ISSUE: ${badProcCodes} non-numeric procedure codes`); issues++; }

  // ── Monthly check ──
  console.log('\n  ┌─── Monthly Data ───');
  for (const m of analytics.monthly.slice(0, 13)) {
    const invoiceSus = m.invoice > 1e9 ? ' ❌ SUSPICIOUS' : '';
    console.log(`  │ ${m.label.padEnd(10)} │ count: ${String(m.count).padStart(4)} │ invoice: ${m.invoice.toFixed(0).padStart(12)}${invoiceSus} │ duty: ${m.duty.toFixed(0).padStart(8)} │ vat: ${m.vat.toFixed(0).padStart(8)}`);
  }

  console.log(`\n  ${'═'.repeat(50)}`);
  console.log(`  ${issues === 0 ? '✅ PASSED' : `⚠ ${issues} ISSUE(S) FOUND`} — ${brokerId}`);
  console.log(`  ${'═'.repeat(50)}`);
}

// Run for all brokers
await validateBroker('DHL', join(BASE, 'excel', 'DHL'));
await validateBroker('FEDEX', join(BASE, 'excel', 'FEDEX'));
await validateBroker('UPS', join(BASE, 'excel', 'UPS'));
await validateBroker('DSV', join(BASE, 'excel', 'DSV'));
