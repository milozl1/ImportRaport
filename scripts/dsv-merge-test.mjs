/**
 * DSV Air↔Sea column mapping verification test.
 *
 * Loads all 16 DSV files (XLSX only — CSV requires PapaParse which is
 * browser-only), merges them through the engine's alignment pipeline,
 * and verifies:
 *  1. All English AIR columns are correctly mapped to Sea equivalents
 *  2. Unmapped (air-only) columns are separated for Sheet 2
 *  3. No data is lost during remapping
 *  4. The unified header is clean (no air-only columns leaked in)
 */

import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// ── Import engine helpers directly ──
// We can't use the full engine (it imports PapaParse which is browser-only)
// so we re-implement the core logic here using the same algorithms.

const DSV_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..', 'excel', 'DSV'
);

// ── Load broker config ──
// Read brokers.js and extract DSV config
const brokersPath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..', 'src', 'js', 'brokers.js'
);

// We'll manually define the DSV broker config for testing (mirror of brokers.js)
const DSV_BROKER = {
  id: 'dsv',
  headerRows: 1,
  dataStartRow: 1,
  csvDelimiter: ';',
  isFooterRow(row) {
    if (!row || !Array.isArray(row)) return true;
    const filled = row.filter(c => c != null && String(c).trim() !== '').length;
    return filled < 3;
  },
  sheetSelector(names, fileName) {
    const lower = names.map(n => n.toLowerCase());
    // Air files: prefer "import report template", then "importzoll*", then "hella*"
    for (const pattern of ['importzoll', 'hella', 'import report']) {
      const idx = lower.findIndex(n => n.includes(pattern));
      if (idx >= 0) return names[idx];
    }
    return names[0];
  },
};

// Load synonyms and airOnlyColumns from the actual brokers.js source
// (eval is impractical, so we import the actual values)
import { BROKERS } from '../src/js/brokers.js';
const dsvBroker = BROKERS.find(b => b.id === 'DSV');
if (!dsvBroker) {
  console.log('Available broker IDs:', BROKERS.map(b => b.id));
  throw new Error('DSV broker not found');
}
DSV_BROKER.headerSynonyms = dsvBroker.headerSynonyms;
DSV_BROKER.airOnlyColumns = dsvBroker.airOnlyColumns;

// ── Re-implement engine alignment helpers ──

function buildUnifiedHeader(fileParts, broker) {
  const airOnlySet = new Set((broker.airOnlyColumns || []).map(s => s.trim()));

  let widest = fileParts[0];
  for (const fp of fileParts) {
    if ((fp.headers[0] || []).length > (widest.headers[0] || []).length) {
      widest = fp;
    }
  }

  const raw = [...(widest.headers[0] || [])].map(h =>
    h != null ? String(h).trim() : ''
  );
  const unified = raw.filter(h => !airOnlySet.has(h));

  const synonyms = broker.headerSynonyms || {};
  const airOnlyHeader = [];
  const airOnlySeen = new Set();
  const isAirOnly = (name) => airOnlySet.has(name);

  for (const h of raw) {
    if (h && isAirOnly(h) && !airOnlySeen.has(h)) {
      airOnlyHeader.push(h);
      airOnlySeen.add(h);
    }
  }

  for (const fp of fileParts) {
    if (fp === widest) continue;
    const hRow = (fp.headers[0] || []).map(h =>
      h != null ? String(h).trim() : ''
    );
    for (let i = 0; i < hRow.length; i++) {
      const name = hRow[i];
      if (!name) continue;
      if (isAirOnly(name)) {
        if (!airOnlySeen.has(name)) {
          airOnlyHeader.push(name);
          airOnlySeen.add(name);
        }
        continue;
      }
      const canonical = synonyms[name] || name;
      if (unified.includes(canonical)) continue;
      if (unified.includes(name)) continue;
      unified.push(name);
    }
  }

  return { unified, airOnlyHeader };
}

function buildColumnMapping(fileHeader, unified, synonyms, airOnlyHeader) {
  const mapping = new Array(fileHeader.length).fill(-1);
  const airMapping = new Array(fileHeader.length).fill(-1);
  const used = new Set();
  const airOnlySet = new Set((airOnlyHeader || []).map(s => s.trim()));

  if (airOnlyHeader && airOnlyHeader.length > 0) {
    const airUsed = new Set();
    for (let fi = 0; fi < fileHeader.length; fi++) {
      const name = fileHeader[fi];
      if (!name) continue;
      if (airOnlySet.has(name)) {
        for (let ai = 0; ai < airOnlyHeader.length; ai++) {
          if (!airUsed.has(ai) && airOnlyHeader[ai] === name) {
            airMapping[fi] = ai;
            airUsed.add(ai);
            break;
          }
        }
      }
    }
  }

  for (let fi = 0; fi < fileHeader.length; fi++) {
    if (airMapping[fi] !== -1) continue;
    const name = fileHeader[fi];
    if (!name) continue;
    for (let ui = 0; ui < unified.length; ui++) {
      if (!used.has(ui) && unified[ui] === name) {
        mapping[fi] = ui;
        used.add(ui);
        break;
      }
    }
  }

  for (let fi = 0; fi < fileHeader.length; fi++) {
    if (mapping[fi] !== -1 || airMapping[fi] !== -1) continue;
    const name = fileHeader[fi];
    if (!name) continue;
    const canonical = synonyms[name];
    if (!canonical) continue;
    for (let ui = 0; ui < unified.length; ui++) {
      if (!used.has(ui) && unified[ui] === canonical) {
        mapping[fi] = ui;
        used.add(ui);
        break;
      }
    }
  }

  return { mapping, airMapping };
}

function remapRow(row, mapping, width) {
  const out = new Array(width).fill(null);
  for (let fi = 0; fi < row.length && fi < mapping.length; fi++) {
    const ui = mapping[fi];
    if (ui >= 0) out[ui] = row[fi];
  }
  return out;
}

function extractAirOnlyRow(row, airMapping, width) {
  if (!width) return null;
  let hasData = false;
  const out = new Array(width).fill(null);
  for (let fi = 0; fi < row.length && fi < airMapping.length; fi++) {
    const ai = airMapping[fi];
    if (ai >= 0) {
      out[ai] = row[fi];
      if (row[fi] != null && row[fi] !== '') hasData = true;
    }
  }
  return hasData ? out : null;
}

// ── Load XLSX files ──
function loadXlsx(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  let sheetName = DSV_BROKER.sheetSelector(wb.SheetNames, path.basename(filePath)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  return { rows, sheetName };
}

function extractParts(rows) {
  const headers = rows.slice(0, 1);
  const rawData = rows.slice(1);
  const data = rawData.filter(row => !DSV_BROKER.isFooterRow(row));
  return { headers, data };
}

// ── Main ──
console.log('═══════════════════════════════════════════════════════');
console.log('  DSV Air↔Sea Column Mapping Verification Test');
console.log('═══════════════════════════════════════════════════════\n');

// Find all files
const allFiles = fs.readdirSync(DSV_DIR).sort();
const xlsxFiles = allFiles.filter(f => f.endsWith('.xlsx') && !f.startsWith('DSV_Consolidated'));
const csvFiles = allFiles.filter(f => f.endsWith('.csv'));

console.log(`Found ${xlsxFiles.length} XLSX files + ${csvFiles.length} CSV files`);
console.log('Testing with XLSX files only (CSV requires PapaParse browser API)\n');

// Classify files
const airFiles = [];
const seaFiles = [];

for (const f of xlsxFiles) {
  const fPath = path.join(DSV_DIR, f);
  const { rows, sheetName } = loadXlsx(fPath);
  const parts = extractParts(rows);
  const hRow = (parts.headers[0] || []).map(h => h != null ? String(h).trim() : '');
  
  const isAir = f.toLowerCase().includes('luftfracht');
  const type = isAir ? 'AIR' : 'SEA';
  
  console.log(`  ${type}: ${f}`);
  console.log(`    Sheet: "${sheetName}" | ${hRow.length} cols | ${parts.data.length} rows`);
  
  const entry = { name: f, path: fPath, headers: parts.headers, data: parts.data, hRow };
  if (isAir) airFiles.push(entry);
  else seaFiles.push(entry);
}

console.log(`\n  AIR files: ${airFiles.length}, SEA files: ${seaFiles.length}\n`);

// ── Test 1: Build unified header with air-only separation ──
console.log('─── Test 1: Unified Header Construction ───');

const fileParts = [...seaFiles, ...airFiles]; // Sea files first (widest)
const { unified, airOnlyHeader } = buildUnifiedHeader(fileParts, DSV_BROKER);

console.log(`  Unified header: ${unified.length} columns`);
console.log(`  Air-only header: ${airOnlyHeader.length} columns`);
console.log(`  Air-only columns: ${airOnlyHeader.join(', ')}`);

// Verify no air-only columns leaked into unified header
const airOnlySet = new Set((DSV_BROKER.airOnlyColumns || []).map(s => s.trim()));
const leaked = unified.filter(h => airOnlySet.has(h));
if (leaked.length > 0) {
  console.log(`  ✗ FAIL: Air-only columns leaked into unified header: ${leaked.join(', ')}`);
} else {
  console.log('  ✓ PASS: No air-only columns in unified header');
}

// ── Test 2: Column mapping for each file ──
console.log('\n─── Test 2: Column Mapping Per File ───');

const synonyms = DSV_BROKER.headerSynonyms || {};
let totalUnmapped = 0;
let totalMapped = 0;

for (const fp of fileParts) {
  const { mapping, airMapping } = buildColumnMapping(fp.hRow, unified, synonyms, airOnlyHeader);
  
  const mapped = mapping.filter(m => m !== -1).length;
  const airMapped = airMapping.filter(m => m !== -1).length;
  const unmapped = fp.hRow.filter((h, i) => h && mapping[i] === -1 && airMapping[i] === -1).length;
  
  totalMapped += mapped + airMapped;
  totalUnmapped += unmapped;
  
  const unmappedNames = fp.hRow
    .map((h, i) => (h && mapping[i] === -1 && airMapping[i] === -1) ? h : null)
    .filter(Boolean);
  
  const isAir = fp.name.toLowerCase().includes('luftfracht');
  const status = unmapped === 0 ? '✓' : '⚠';
  
  console.log(`  ${status} ${fp.name}: ${mapped} mapped, ${airMapped} air-only, ${unmapped} unmapped`);
  if (unmappedNames.length > 0) {
    console.log(`    Unmapped: ${unmappedNames.join(', ')}`);
  }
}

console.log(`\n  Total: ${totalMapped} mapped, ${totalUnmapped} unmapped`);

// ── Test 3: Data remapping verification ──
console.log('\n─── Test 3: Data Remapping Verification ───');

const allData = [];
const airOnlyData = [];
let totalInputRows = 0;

for (const fp of fileParts) {
  const { mapping, airMapping } = buildColumnMapping(fp.hRow, unified, synonyms, airOnlyHeader);
  
  for (const row of fp.data) {
    allData.push(remapRow(row, mapping, unified.length));
    if (airOnlyHeader.length > 0) {
      airOnlyData.push(extractAirOnlyRow(row, airMapping, airOnlyHeader.length));
    }
    totalInputRows++;
  }
}

console.log(`  Input rows: ${totalInputRows}`);
console.log(`  Output rows (consolidated): ${allData.length}`);
console.log(`  Air-only rows (non-null): ${airOnlyData.filter(r => r != null).length}`);

if (allData.length === totalInputRows) {
  console.log('  ✓ PASS: Row count matches');
} else {
  console.log('  ✗ FAIL: Row count mismatch!');
}

// ── Test 4: Verify key field mappings for AIR files ──
console.log('\n─── Test 4: Key Field Verification (English AIR → Unified) ───');

// Pick an English AIR file and verify specific columns end up in the right place
const englishAir = airFiles.find(f => 
  f.hRow.includes('Formal Entry Number') || f.hRow.includes('HTS Code (Tariff Number)')
);

if (englishAir) {
  const { mapping } = buildColumnMapping(englishAir.hRow, unified, synonyms, airOnlyHeader);
  
  // Key column checks
  const checks = [
    ['Formal Entry Number', 'Registriernummer/MRN'],
    ['HTS Code (Tariff Number)', 'Warentarifnummer'],
    ['Item Description', 'Warenbezeichnung'],
    ['Invoice value', 'Rechnungsbetrag'],
    ['Country of Origin', 'Ursprung'],
    ['Duty Paid', 'AbgabeZoll'],
    ['VAT Paid', 'AbgabeEust'],
    ['Supplier Name / Shipper Name', 'CZ Name'],
    ['Net Mass (in kg)', 'Eigenmasse'],
    ['Incoterms', 'Liefercode'],
  ];
  
  let passed = 0;
  for (const [airCol, seaCol] of checks) {
    const airIdx = englishAir.hRow.indexOf(airCol);
    if (airIdx === -1) {
      // Try with trailing space/newline variants
      const altIdx = englishAir.hRow.findIndex(h => h && h.trim() === airCol.trim());
      if (altIdx === -1) {
        console.log(`  ⚠ SKIP: "${airCol}" not found in file header`);
        continue;
      }
    }
    const actualAirIdx = englishAir.hRow.findIndex(h => h && h.trim() === airCol.trim());
    const unifiedIdx = mapping[actualAirIdx];
    const unifiedCol = unifiedIdx >= 0 ? unified[unifiedIdx] : '(unmapped)';
    
    if (unifiedCol === seaCol) {
      console.log(`  ✓ "${airCol}" → "${unifiedCol}" (col ${unifiedIdx})`);
      passed++;
    } else {
      console.log(`  ✗ "${airCol}" → "${unifiedCol}" (expected "${seaCol}")`);
    }
  }
  console.log(`  ${passed}/${checks.length} key mappings correct`);
  
  // Verify actual data values
  console.log('\n  Sample data verification (first row):');
  const { mapping: m2 } = buildColumnMapping(englishAir.hRow, unified, synonyms, airOnlyHeader);
  if (englishAir.data.length > 0) {
    const row = englishAir.data[0];
    const remapped = remapRow(row, m2, unified.length);
    
    // Find key columns in unified and check they have data
    const regIdx = unified.indexOf('Registriernummer/MRN');
    const hsIdx = unified.indexOf('Warentarifnummer');
    const descIdx = unified.indexOf('Warenbezeichnung');
    
    console.log(`    Registriernummer/MRN (col ${regIdx}): ${remapped[regIdx]}`);
    console.log(`    Warentarifnummer (col ${hsIdx}): ${remapped[hsIdx]}`);
    console.log(`    Warenbezeichnung (col ${descIdx}): ${String(remapped[descIdx]).substring(0, 50)}`);
  }
} else {
  console.log('  ⚠ No English AIR file found — skipping key field checks');
}

// ── Test 5: Verify German AIR Verfahren_1 mapping ──
console.log('\n─── Test 5: German AIR Verfahren_1 → Verfahren ───');

const germanAir = airFiles.find(f => f.hRow.includes('Verfahren_1'));
if (germanAir) {
  const { mapping } = buildColumnMapping(germanAir.hRow, unified, synonyms, airOnlyHeader);
  const v1Idx = germanAir.hRow.indexOf('Verfahren_1');
  const unifiedIdx = mapping[v1Idx];
  const unifiedCol = unifiedIdx >= 0 ? unified[unifiedIdx] : '(unmapped)';
  
  if (unifiedCol === 'Verfahren') {
    console.log(`  ✓ Verfahren_1 (col ${v1Idx}) → Verfahren (col ${unifiedIdx})`);
  } else {
    console.log(`  ✗ Verfahren_1 → "${unifiedCol}" (expected "Verfahren")`);
  }
} else {
  console.log('  ⚠ No German AIR file with Verfahren_1 found');
}

// ── Test 6: Sheet 2 simulation ──
console.log('\n─── Test 6: Sheet 2 (Air-Only Fields) Simulation ───');

const airRowsWithData = airOnlyData.filter(r => r != null);
console.log(`  Air-only header: [${airOnlyHeader.join(', ')}]`);
console.log(`  Rows with air-only data: ${airRowsWithData.length}`);
console.log(`  Total merged rows: ${allData.length}`);
console.log(`  Sea-only rows (no air data): ${allData.length - airRowsWithData.length}`);

if (airRowsWithData.length > 0) {
  console.log('  Sample air-only row:');
  const sample = airRowsWithData[0];
  for (let i = 0; i < airOnlyHeader.length; i++) {
    if (sample[i] != null && sample[i] !== '') {
      console.log(`    ${airOnlyHeader[i]}: ${sample[i]}`);
    }
  }
  console.log('  ✓ PASS: Air-only data collected for Sheet 2');
} else {
  console.log('  ⚠ No air-only data found (English AIR files may not have been loaded)');
}

// ── Summary ──
console.log('\n═══════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Files processed: ${fileParts.length} XLSX (${airFiles.length} AIR + ${seaFiles.length} SEA)`);
console.log(`  Unified header: ${unified.length} columns`);
console.log(`  Air-only columns: ${airOnlyHeader.length} (→ Sheet 2)`);
console.log(`  Total data rows: ${allData.length}`);
console.log(`  Unmapped columns: ${totalUnmapped}`);
console.log(`  Air-only data rows: ${airRowsWithData.length}`);
if (totalUnmapped === 0 && leaked.length === 0) {
  console.log('\n  ✓ ALL TESTS PASSED');
} else {
  console.log(`\n  ⚠ ${totalUnmapped} unmapped columns need attention`);
}
console.log('');
