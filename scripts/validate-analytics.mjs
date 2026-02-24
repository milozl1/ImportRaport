/**
 * Analytics Validation — simulates the full merge+analytics pipeline
 * for each broker against real data files.
 */
import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// Import the analytics engine
const analyticsPath = join(import.meta.dirname, '..', 'src', 'js', 'analytics.js');

// We need to dynamically import since it's ESM
const { aggregateData, renderKPICards, renderCountryTable, renderHSTable } = await import('file://' + analyticsPath);

const BASE = join(import.meta.dirname, '..');

/* ─── Simulate merge for a broker ─── */
function simulateMerge(dir, broker) {
  const files = readdirSync(dir).filter(f => 
    (f.endsWith('.xlsx') || f.endsWith('.csv')) && !f.startsWith('DSV_Consolidated')
  );
  
  if (files.length === 0) return null;

  let allHeaders = null;
  const allData = [];

  for (const file of files) {
    try {
      let rows;
      if (file.endsWith('.csv')) {
        const content = readFileSync(join(dir, file), 'utf-8');
        const sep = content.split('\n')[0].includes(';') ? ';' : ',';
        rows = content.split('\n').map(line => 
          line.split(sep).map(cell => cell.replace(/^"|"$/g, '').trim())
        );
      } else {
        const wb = XLSX.readFile(join(dir, file));
        let sheetName = wb.SheetNames[0];
        // DSV Luftfracht — skip data definition sheets
        if (broker.id === 'DSV' && wb.SheetNames.length > 1) {
          const dataSheet = wb.SheetNames.find(s => s.includes('Input') || s.includes('Report'));
          if (dataSheet) sheetName = dataSheet;
        }
        const ws = wb.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      }

      const headerStart = broker.headerStartRow || 0;
      const headerEnd = headerStart + broker.headerRows;
      const dataStart = broker.dataStartRow;

      const headers = rows.slice(headerStart, headerEnd);
      const data = rows.slice(dataStart).filter(r => {
        if (!r || !Array.isArray(r)) return false;
        const filled = r.filter(c => c != null && String(c).trim() !== '').length;
        return filled >= 3;
      });

      if (!allHeaders) allHeaders = headers;
      allData.push(...data);
    } catch (e) {
      console.log(`  ⚠ Skipped ${file}: ${e.message}`);
    }
  }

  return { headers: allHeaders || [], data: allData, fileCount: files.length };
}

/* ─── Broker configs (minimal, matching src/js/brokers.js) ─── */
const BROKERS = {
  DHL: { id: 'DHL', headerStartRow: 0, headerRows: 2, dataStartRow: 2 },
  FEDEX: { id: 'FEDEX', headerStartRow: 13, headerRows: 1, dataStartRow: 14 },
  UPS: { id: 'UPS', headerStartRow: 0, headerRows: 2, dataStartRow: 2 },
  DSV: { id: 'DSV', headerStartRow: 0, headerRows: 1, dataStartRow: 1 },
};

/* ─── Run analytics for each broker ─── */
function validateBroker(brokerId, dir) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${brokerId} ANALYTICS VALIDATION`);
  console.log('═'.repeat(70));

  const broker = BROKERS[brokerId];
  const merged = simulateMerge(dir, broker);
  
  if (!merged || merged.data.length === 0) {
    console.log('  ❌ No data found');
    return;
  }

  console.log(`  Files: ${merged.fileCount}, Data rows: ${merged.data.length}`);

  try {
    const analytics = aggregateData(merged.headers, merged.data, brokerId);
    
    if (!analytics) {
      console.log('  ❌ aggregateData returned null');
      return;
    }

    console.log(`  ✅ Records extracted: ${analytics.totalRows}`);

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

    // ── Validation checks ──
    let issues = 0;
    
    if (k.totalDeclarations === 0) { console.log('  ❌ Zero declarations!'); issues++; }
    if (k.totalInvoiceValue === 0) { console.log('  ⚠ Zero invoice value — check invoiceValue column'); issues++; }
    if (k.totalDuty === 0 && brokerId !== 'KN' && brokerId !== 'SCHENKER') { console.log('  ⚠ Zero duty — check duty/dutyAmount column'); issues++; }
    if (k.totalVAT === 0 && brokerId !== 'KN' && brokerId !== 'SCHENKER') { console.log('  ⚠ Zero VAT — check vatAmount/eustAmount/eustValue column'); issues++; }
    if (k.totalWeight === 0) { console.log('  ⚠ Zero weight — check weight/grossWeight/netWeight column'); issues++; }
    if (k.uniqueCountries === 0) { console.log('  ⚠ Zero countries — check countryOfOrigin/shipperCountry column'); issues++; }
    if (k.uniqueHSChapters === 0) { console.log('  ⚠ Zero HS chapters — check hsCode column'); issues++; }
    if (k.monthsCovered === 0) { console.log('  ❌ Zero months — check date column'); issues++; }

    // ── Monthly ──
    console.log('\n  ┌─── Monthly Data ───');
    for (const m of analytics.monthly.slice(0, 12)) {
      console.log(`  │ ${m.label.padEnd(10)} │ decl: ${String(m.count).padStart(4)} │ invoice: ${m.invoice.toFixed(0).padStart(12)} │ duty: ${m.duty.toFixed(0).padStart(8)} │ vat: ${m.vat.toFixed(0).padStart(8)} │ freight: ${m.freight.toFixed(0).padStart(8)} │ weight: ${m.weight.toFixed(0).padStart(8)}`);
    }

    // ── Countries ──
    console.log('\n  ┌─── Top Countries ───');
    for (const c of analytics.countries.slice(0, 5)) {
      console.log(`  │ ${c.code.padEnd(4)} │ count: ${String(c.count).padStart(4)} │ invoice: ${c.totalInvoice.toFixed(0).padStart(12)} │ duty: ${c.totalDuty.toFixed(0).padStart(8)} │ vat: ${c.totalVAT.toFixed(0).padStart(8)}`);
    }

    // ── HS Chapters ──
    console.log('\n  ┌─── Top HS Chapters ───');
    for (const h of analytics.hsChapters.slice(0, 5)) {
      console.log(`  │ Ch.${h.chapter.padEnd(3)} │ count: ${String(h.count).padStart(4)} │ invoice: ${h.totalInvoice.toFixed(0).padStart(12)} │ duty: ${h.totalDuty.toFixed(0).padStart(8)} │ desc: ${(h.descriptions[0] || '').substring(0, 40)}`);
    }

    // ── Currencies ──
    console.log('\n  ┌─── Currencies ───');
    for (const c of analytics.currencies) {
      console.log(`  │ ${c.code.padEnd(4)} │ count: ${String(c.count).padStart(4)} │ invoice: ${c.totalInvoice.toFixed(0).padStart(12)}`);
    }

    // ── Incoterms ──
    console.log('\n  ┌─── Incoterms ───');
    for (const i of analytics.incoterms) {
      console.log(`  │ ${i.code.padEnd(5)} │ count: ${String(i.count).padStart(4)}`);
    }

    // ── Procedure Codes ──
    console.log('\n  ┌─── Procedure Codes ───');
    for (const p of analytics.procedureCodes.slice(0, 5)) {
      console.log(`  │ ${p.code.padEnd(6)} │ count: ${String(p.count).padStart(4)}`);
    }

    // ── Duty Distribution ──
    console.log('\n  ┌─── Duty Distribution ───');
    for (const d of analytics.dutyDistribution) {
      if (d.count > 0) console.log(`  │ ${d.label.padEnd(18)} │ count: ${String(d.count).padStart(4)}`);
    }

    // ── Weight Distribution ──
    console.log('\n  ┌─── Weight Distribution ───');
    for (const w of analytics.weightAnalysis) {
      if (w.count > 0) console.log(`  │ ${w.label.padEnd(12)} │ count: ${String(w.count).padStart(4)}`);
    }

    // ── HTML render tests ──
    const kpiHtml = renderKPICards(k);
    const countryHtml = renderCountryTable(analytics.countries);
    const hsHtml = renderHSTable(analytics.hsChapters);
    console.log('\n  ┌─── HTML Render Check ───');
    console.log(`  │ KPI Cards HTML:     ${kpiHtml.length > 100 ? '✅' : '❌'} (${kpiHtml.length} chars)`);
    console.log(`  │ Country Table HTML: ${countryHtml.length > 100 ? '✅' : '❌'} (${countryHtml.length} chars)`);
    console.log(`  │ HS Table HTML:      ${hsHtml.length > 100 ? '✅' : '❌'} (${hsHtml.length} chars)`);

    console.log(`\n  ${issues === 0 ? '✅' : '⚠'} ${brokerId} analytics: ${issues} issue(s) found`);
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    console.log(err.stack);
  }
}

// Run for all brokers
validateBroker('DHL', join(BASE, 'excel', 'DHL'));
validateBroker('FEDEX', join(BASE, 'excel', 'FEDEX'));
validateBroker('UPS', join(BASE, 'excel', 'UPS'));
validateBroker('DSV', join(BASE, 'excel', 'DSV'));
