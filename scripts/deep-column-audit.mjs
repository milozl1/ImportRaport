/**
 * Deep Column Audit — verifies analytics.js COLUMN_MAP against real data.
 * For each broker, reads actual files, extracts headers + data rows,
 * then checks that each analytics column index/name resolves to
 * the expected type of data.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const BASE = join(import.meta.dirname, '..');

/* ─────── DHL Audit ─────── */
function auditDHL() {
  console.log('\n' + '═'.repeat(80));
  console.log('  DHL DEEP COLUMN AUDIT');
  console.log('═'.repeat(80));

  const dir = join(BASE, 'excel', 'DHL');
  const file = readdirSync(dir).find(f => f.endsWith('.xlsx'));
  if (!file) { console.log('  No DHL files found'); return; }

  const wb = XLSX.readFile(join(dir, file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log(`\n  File: ${file}`);
  console.log(`  Total rows: ${rows.length}`);

  // DHL: headerStartRow=0, headerRows=2, dataStartRow=2
  const headerRow1 = rows[0] || [];
  const headerRow2 = rows[1] || [];
  console.log(`  Header row 1 cols: ${headerRow1.length}`);
  console.log(`  Header row 2 cols: ${headerRow2.length}`);

  // Show headers at key analytics indices
  const analyticsMap = {
    0: 'date',
    4: 'declarationNo',
    20: 'shipperName',
    24: 'shipperCountry',
    26: 'consigneeName',
    30: 'consigneeCountry',
    31: 'incoterm',
    33: 'freight',
    34: 'weight',
    35: 'pieces',
    67: 'customsDuties',
    71: 'vat',
    75: 'importDuties',
    76: 'totalDutiesVAT',
    109: 'description',
    110: 'hsCode',
    111: 'countryOfOrigin',
    113: 'procedureCode',
    117: 'invoiceValue',
    118: 'currency',
    119: 'exchangeRate',
    120: 'dutyBasis',
    123: 'duty',
    127: 'vatAmount',
  };

  console.log('\n  ┌─── HEADER CHECK (what the column headers say) ───');
  for (const [idx, field] of Object.entries(analyticsMap)) {
    const i = Number(idx);
    const h1 = headerRow1[i] ?? '(empty)';
    const h2 = headerRow2[i] ?? '(empty)';
    console.log(`  │ col[${String(i).padStart(3)}] → ${field.padEnd(20)} │ H1: "${String(h1).substring(0,40)}" │ H2: "${String(h2).substring(0,40)}"`);
  }

  // Sample 5 data rows
  const dataRows = rows.slice(2).filter(r => r && r.length > 10);
  console.log(`\n  Data rows (after header): ${dataRows.length}`);
  console.log('\n  ┌─── DATA SAMPLE (first 3 rows, analytics columns) ───');
  for (let ri = 0; ri < Math.min(3, dataRows.length); ri++) {
    const r = dataRows[ri];
    console.log(`  │ ROW ${ri}:`);
    for (const [idx, field] of Object.entries(analyticsMap)) {
      const i = Number(idx);
      const v = r[i];
      const vs = v == null ? 'null' : String(v).substring(0, 50);
      const type = v == null ? 'null' : typeof v;
      console.log(`  │   [${String(i).padStart(3)}] ${field.padEnd(20)} = ${vs.padEnd(50)} (${type})`);
    }
  }

  // Check data quality across all rows
  console.log('\n  ┌─── DATA QUALITY (across all data rows) ───');
  const stats = {};
  for (const [idx, field] of Object.entries(analyticsMap)) {
    const i = Number(idx);
    let nonNull = 0, numeric = 0, dates = 0, country2 = 0;
    const samples = [];
    for (const r of dataRows) {
      const v = r[i];
      if (v != null && String(v).trim() !== '' && String(v) !== '0001-01-01') {
        nonNull++;
        if (typeof v === 'number' || /^[\d.,\-]+$/.test(String(v).trim())) numeric++;
        if (/^\d{2}\.\d{2}\.\d{4}/.test(String(v))) dates++;
        if (/^[A-Z]{2}$/.test(String(v).trim())) country2++;
        if (samples.length < 3) samples.push(String(v).substring(0, 30));
      }
    }
    stats[field] = { nonNull, numeric, dates, country2 };
    const pct = ((nonNull / dataRows.length) * 100).toFixed(0);
    console.log(`  │ ${field.padEnd(20)} │ filled: ${String(nonNull).padStart(5)}/${dataRows.length} (${pct}%) │ numeric: ${numeric} │ dates: ${dates} │ 2-letter: ${country2} │ samples: [${samples.join(', ')}]`);
  }
}

/* ─────── FedEx Audit ─────── */
function auditFedEx() {
  console.log('\n' + '═'.repeat(80));
  console.log('  FEDEX DEEP COLUMN AUDIT');
  console.log('═'.repeat(80));

  const dir = join(BASE, 'excel', 'FEDEX');
  const file = readdirSync(dir).find(f => f.endsWith('.xlsx') && !f.startsWith('Brokerage'));
  if (!file) { console.log('  No FedEx files found'); return; }

  const wb = XLSX.readFile(join(dir, file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log(`\n  File: ${file}`);
  console.log(`  Total rows: ${rows.length}`);

  // FedEx: headerStartRow=0, headerRows=1, dataStartRow=1
  const headerRow = rows[0] || [];
  console.log(`  Header cols: ${headerRow.length}`);

  const analyticsMap = {
    5: 'awb',
    6: 'declarationNo',
    7: 'date',
    15: 'consigneeName',
    21: 'shipperCountry',
    22: 'invoiceValue',
    23: 'currency',
    24: 'exchangeRate',
    27: 'grossWeight',
    31: 'incoterm',
    32: 'deliveryPlace',
    56: 'hsCode',
    57: 'countryOfOrigin',
    58: 'procedureCode',
    61: 'packageCount',
    64: 'description',
    65: 'netWeight',
    66: 'lineInvoice',
    67: 'customsValue',
    68: 'eustValue',
    70: 'articlePrice',
    85: 'dutyRate',
    86: 'freightCost',
    91: 'dutyAmount',
  };

  console.log('\n  ┌─── HEADER CHECK ───');
  for (const [idx, field] of Object.entries(analyticsMap)) {
    const i = Number(idx);
    const h = headerRow[i] ?? '(empty)';
    console.log(`  │ col[${String(i).padStart(3)}] → ${field.padEnd(20)} │ Header: "${String(h).substring(0,50)}"`);
  }

  const dataRows = rows.slice(1).filter(r => r && r.length > 10);
  console.log(`\n  Data rows: ${dataRows.length}`);

  console.log('\n  ┌─── DATA SAMPLE (first 3 rows) ───');
  for (let ri = 0; ri < Math.min(3, dataRows.length); ri++) {
    const r = dataRows[ri];
    console.log(`  │ ROW ${ri}:`);
    for (const [idx, field] of Object.entries(analyticsMap)) {
      const i = Number(idx);
      const v = r[i];
      const vs = v == null ? 'null' : String(v).substring(0, 50);
      console.log(`  │   [${String(i).padStart(3)}] ${field.padEnd(20)} = ${vs}`);
    }
  }

  // Data quality
  console.log('\n  ┌─── DATA QUALITY ───');
  for (const [idx, field] of Object.entries(analyticsMap)) {
    const i = Number(idx);
    let nonNull = 0, numeric = 0;
    const samples = [];
    for (const r of dataRows) {
      const v = r[i];
      if (v != null && String(v).trim() !== '') {
        nonNull++;
        if (typeof v === 'number' || /^[\d.,\-]+$/.test(String(v).trim())) numeric++;
        if (samples.length < 3) samples.push(String(v).substring(0, 30));
      }
    }
    const pct = ((nonNull / dataRows.length) * 100).toFixed(0);
    console.log(`  │ ${field.padEnd(20)} │ filled: ${String(nonNull).padStart(5)}/${dataRows.length} (${pct}%) │ numeric: ${numeric} │ samples: [${samples.join(', ')}]`);
  }
}

/* ─────── UPS Audit ─────── */
function auditUPS() {
  console.log('\n' + '═'.repeat(80));
  console.log('  UPS DEEP COLUMN AUDIT');
  console.log('═'.repeat(80));

  const dir = join(BASE, 'excel', 'UPS');
  const file = readdirSync(dir).find(f => f.endsWith('.xlsx'));
  if (!file) { console.log('  No UPS files found'); return; }

  const wb = XLSX.readFile(join(dir, file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log(`\n  File: ${file}`);
  console.log(`  Total rows: ${rows.length}`);

  // UPS: headerStartRow=0, headerRows=2, dataStartRow=2
  const headerRow1 = rows[0] || [];
  const headerRow2 = rows[1] || [];
  console.log(`  Header row 1 cols: ${headerRow1.length}`);

  const analyticsMap = {
    0: 'date',
    8: 'invoiceValue',
    9: 'currency',
    10: 'exchangeRate',
    11: 'invoiceEUR',
    15: 'packageCount',
    16: 'grossWeight',
    17: 'freightAmount',
    20: 'freightEUR',
    23: 'shipperCountry',
    24: 'countryOfOrigin',
    28: 'hsCode',
    29: 'description',
    30: 'dutyRate',
    31: 'customsValue',
    32: 'dutyAmount',
    38: 'eustRate',
    39: 'eustValue',
    40: 'eustAmount',
    41: 'senderName',
    42: 'senderCountry',
    44: 'sellerCountry',
    45: 'incoterm',
    47: 'euFreight',
  };

  console.log('\n  ┌─── HEADER CHECK ───');
  for (const [idx, field] of Object.entries(analyticsMap)) {
    const i = Number(idx);
    const h1 = headerRow1[i] ?? '(empty)';
    const h2 = headerRow2[i] ?? '(empty)';
    console.log(`  │ col[${String(i).padStart(3)}] → ${field.padEnd(20)} │ H1: "${String(h1).substring(0,40)}" │ H2: "${String(h2).substring(0,40)}"`);
  }

  const dataRows = rows.slice(2).filter(r => r && r.length > 10);
  console.log(`\n  Data rows: ${dataRows.length}`);

  console.log('\n  ┌─── DATA SAMPLE (first 3 rows) ───');
  for (let ri = 0; ri < Math.min(3, dataRows.length); ri++) {
    const r = dataRows[ri];
    console.log(`  │ ROW ${ri}:`);
    for (const [idx, field] of Object.entries(analyticsMap)) {
      const i = Number(idx);
      const v = r[i];
      const vs = v == null ? 'null' : String(v).substring(0, 50);
      console.log(`  │   [${String(i).padStart(3)}] ${field.padEnd(20)} = ${vs}`);
    }
  }

  // Data quality
  console.log('\n  ┌─── DATA QUALITY ───');
  for (const [idx, field] of Object.entries(analyticsMap)) {
    const i = Number(idx);
    let nonNull = 0, numeric = 0;
    const samples = [];
    for (const r of dataRows) {
      const v = r[i];
      if (v != null && String(v).trim() !== '') {
        nonNull++;
        if (typeof v === 'number' || /^[\d.,\-]+$/.test(String(v).trim())) numeric++;
        if (samples.length < 3) samples.push(String(v).substring(0, 30));
      }
    }
    const pct = ((nonNull / dataRows.length) * 100).toFixed(0);
    console.log(`  │ ${field.padEnd(20)} │ filled: ${String(nonNull).padStart(5)}/${dataRows.length} (${pct}%) │ numeric: ${numeric} │ samples: [${samples.join(', ')}]`);
  }
}

/* ─────── DSV Audit ─────── */
function auditDSV() {
  console.log('\n' + '═'.repeat(80));
  console.log('  DSV DEEP COLUMN AUDIT');
  console.log('═'.repeat(80));

  const dir = join(BASE, 'excel', 'DSV');
  // Try both CSV and XLSX
  const files = readdirSync(dir).filter(f => f.endsWith('.xlsx') && !f.startsWith('DSV_Consolidated'));

  for (const file of files.slice(0, 2)) {
    const wb = XLSX.readFile(join(dir, file));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    console.log(`\n  File: ${file}`);
    console.log(`  Total rows: ${rows.length}`);

    const headerRow = rows[0] || [];
    console.log(`  Header cols: ${headerRow.length}`);

    // Show all headers with indices
    console.log('\n  ┌─── ALL HEADERS ───');
    headerRow.forEach((h, i) => {
      if (h != null && String(h).trim() !== '') {
        console.log(`  │ [${String(i).padStart(3)}] ${String(h).substring(0, 60)}`);
      }
    });

    // DSV header map to check
    const headerMap = {
      date:            ['Anlagedatum', 'Ãberlassungsdatum', 'Überlassungsdatum'],
      declarationNo:   ['Registriernummer/MRN', 'Registrienummer/MRN'],
      shipperName:     ['CZ Name', 'Versender Name'],
      shipperCountry:  ['CZ Ländercode', 'Versender Ländercode'],
      consigneeName:   ['CN Name', 'Empfänger Name'],
      consigneeCountry:['CN Ländercode', 'Empfänger Ländercode'],
      incoterm:        ['Liefercode'],
      deliveryPlace:   ['Lieferort'],
      invoiceValue:    ['Rechnungsbetrag'],
      currency:        ['Rechnungswährung'],
      exchangeRate:    ['Rechnungskurs'],
      hsCode:          ['Warentarifnummer'],
      description:     ['Warenbezeichnung'],
      countryOfOrigin: ['Ursprung'],
      procedureCode:   ['Verfahren'],
      customsDuty:     ['AbgabeZoll', 'Vorraussichtliche Zollabgabe', 'Vorausstl. Zollabgabe'],
      customsDutyRate: ['AbgabeZollsatz', 'Vorraussichtliche Zollsatzabgabe', 'Vorausstl. Zollsatzabgabe'],
      eustAmount:      ['AbgabeEust', 'Vorraussichtliche Eustabgabe', 'Vorausstl. Eustabgabe'],
      eustRate:        ['AbgabeEustsatz', 'Vorraussichtliche Eustsatzabgabe', 'Vorausstl. Eustsatzabgabe'],
      customsValue:    ['Zollwert'],
      articlePrice:    ['Artikelpreis'],
      grossWeight:     ['Rohmasse'],
      netWeight:       ['Eigenmasse'],
      packageCount:    ['AnzahlPackstücke', 'Anzahlpackstã¼cke'],
      statisticalValue:['Statistischerwert'],
    };

    console.log('\n  ┌─── HEADER RESOLUTION ───');
    const hRowLower = headerRow.map(h => h != null ? String(h).trim() : '');
    for (const [field, names] of Object.entries(headerMap)) {
      let found = false;
      for (const name of names) {
        const idx = hRowLower.findIndex(h => h.toLowerCase() === name.toLowerCase());
        if (idx !== -1) {
          console.log(`  │ ${field.padEnd(20)} → col[${idx}] matched "${name}" │ Header: "${hRowLower[idx]}"`);
          found = true;

          // Sample data
          const dataRows = rows.slice(1).filter(r => r && r.length > 5);
          const samples = dataRows.slice(0, 3).map(r => r[idx] == null ? 'null' : String(r[idx]).substring(0, 30));
          console.log(`  │   ${''.padEnd(20)}   Samples: [${samples.join(', ')}]`);
          break;
        }
      }
      if (!found) {
        console.log(`  │ ${field.padEnd(20)} → ❌ NOT FOUND (searched: ${names.join(', ')})`);
      }
    }
  }

  // Also try a CSV
  const csvFiles = readdirSync(dir).filter(f => f.endsWith('.csv'));
  if (csvFiles.length > 0) {
    const csvFile = csvFiles[0];
    console.log(`\n  ── CSV File: ${csvFile} ──`);
    const content = readFileSync(join(dir, csvFile), 'utf-8');
    const firstLine = content.split('\n')[0];
    const sep = firstLine.includes(';') ? ';' : ',';
    const headers = firstLine.split(sep).map(h => h.replace(/^"|"$/g, '').trim());
    console.log(`  Separator: "${sep}", Header cols: ${headers.length}`);
    console.log('  ┌─── CSV HEADERS ───');
    headers.forEach((h, i) => {
      if (h) console.log(`  │ [${String(i).padStart(3)}] ${h}`);
    });
  }
}

/* ─────── Run ─────── */
auditDHL();
auditFedEx();
auditUPS();
auditDSV();

console.log('\n' + '═'.repeat(80));
console.log('  AUDIT COMPLETE');
console.log('═'.repeat(80));
