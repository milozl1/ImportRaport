/**
 * Data Validator & Corrector — v2
 *
 * Multi-zone shift detection:
 *   Zone A: Address areas (Seller/Shipper/Consignee)
 *   Zone B: Goods area (Description, HS Code, duties)
 *
 * Number format normalisation — German comma → dot, leading dot/comma fix
 * Column type enforcement — validates data matches expected column types
 */

/* ───────────────────────────────────────────────
   Column Pattern Matchers
   ─────────────────────────────────────────────── */

const P = {
  hsCode:      (v) => typeof v === 'string' && /^\d{8,11}$/.test(v.trim()),
  country2:    (v) => typeof v === 'string' && /^[A-Z]{2}$/i.test(v.trim()),
  currency3:   (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  incoterm:    (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  postcode:    (v) => {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return s.length <= 10 && /^[\dA-Z][\dA-Z \-\.]*$/i.test(s);
  },
  numeric:     (v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'number') return true;
    return /^-?[.,]?\d/.test(String(v).trim());
  },
  date:        (v) => typeof v === 'string' && /^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}/.test(v.trim()),
  procCode:    (v) => typeof v === 'string' && /^\d{3,4}$/.test(v.trim()),
  measure:     (v) => typeof v === 'string' && /^[A-Z]{2,3}$/.test(v.trim()),
  longText:    (v) => typeof v === 'string' && v.trim().length > 10,
  shortAlpha:  (v) => typeof v === 'string' && v.trim().length <= 10,
  eori:        (v) => typeof v === 'string' && /^[A-Z]{2}\d+/.test(v.trim()),
};

/* ───────────────────────────────────────────────
   DHL Column Schema — what should be in each column
   ─────────────────────────────────────────────── */

const DHL_SCHEMA = {
  0:   { name: 'Date of Declaration',    test: P.date,      type: 'date' },
  1:   { name: 'EORI Number',            test: P.eori,      type: 'eori' },
  15:  { name: 'Seller Name',            test: P.longText,  type: 'text',     allowNull: true },
  16:  { name: 'Seller Address',         test: P.longText,  type: 'address',  allowNull: true },
  17:  { name: 'Seller Town',            test: P.shortAlpha,type: 'town',     allowNull: true },
  18:  { name: 'Seller Postcode',        test: P.postcode,  type: 'postcode', allowNull: true },
  19:  { name: 'Seller Country',         test: P.country2,  type: 'country',  allowNull: true },
  20:  { name: 'Shipper Name',           test: P.longText,  type: 'text' },
  21:  { name: 'Shipper Address',        test: P.longText,  type: 'address' },
  22:  { name: 'Shipper Town',           test: P.shortAlpha,type: 'town' },
  23:  { name: 'Shipper Postcode',       test: P.postcode,  type: 'postcode' },
  24:  { name: 'Shipper Country',        test: P.country2,  type: 'country' },
  26:  { name: 'Consignee Name',         test: P.longText,  type: 'text' },
  27:  { name: 'Consignee Address',      test: P.longText,  type: 'address' },
  28:  { name: 'Consignee Town',         test: P.shortAlpha,type: 'town' },
  29:  { name: 'Consignee Postcode',     test: P.postcode,  type: 'postcode' },
  30:  { name: 'Consignee Country',      test: P.country2,  type: 'country' },
  31:  { name: 'Incoterm',               test: P.incoterm,  type: 'code' },
  33:  { name: 'Freight EUR',            test: P.numeric,   type: 'decimal' },
  34:  { name: 'Weight',                 test: P.numeric,   type: 'decimal' },
  67:  { name: 'Summary Customs Duties', test: P.numeric,   type: 'decimal' },
  71:  { name: 'Summary VAT',           test: P.numeric,   type: 'decimal' },
  75:  { name: 'Summary Import Duties',  test: P.numeric,   type: 'decimal' },
  76:  { name: 'Summary Duties+VAT',     test: P.numeric,   type: 'decimal' },
  109: { name: 'Description of Goods',   test: P.longText,  type: 'description' },
  110: { name: 'HS Code',                test: P.hsCode,    type: 'hscode' },
  111: { name: 'Country of Origin',      test: P.country2,  type: 'country' },
  112: { name: 'Preference',             test: P.procCode,  type: 'code',     allowNull: true },
  113: { name: 'Procedure Code',         test: P.procCode,  type: 'code' },
  115: { name: 'Statistical Measure',    test: P.measure,   type: 'code',     allowNull: true },
  117: { name: 'Invoice Value',          test: P.numeric,   type: 'decimal' },
  118: { name: 'Currency',               test: P.currency3, type: 'currency' },
  119: { name: 'Exchange Rate',          test: P.numeric,   type: 'decimal' },
  120: { name: 'Duty Basis EUR',         test: P.numeric,   type: 'decimal' },
  121: { name: 'Fiscal Charges',         test: P.numeric,   type: 'decimal' },
  123: { name: 'Duty',                   test: P.numeric,   type: 'decimal' },
  124: { name: 'Import Tax Basis',       test: P.numeric,   type: 'decimal' },
  125: { name: 'Import VAT Rate',        test: P.numeric,   type: 'decimal' },
  127: { name: 'VAT',                    test: P.numeric,   type: 'decimal' },
  128: { name: 'Other Import Duties',    test: P.numeric,   type: 'decimal' },
};

/* ───────────────────────────────────────────────
   Shift Zones — independent regions that can shift
   ─────────────────────────────────────────────── */

const DHL_SHIFT_ZONES = [
  {
    name: 'Seller Address',
    overflowCol: 16,
    anchorCols: [18, 19],
    range: [15, 19],
    mergeStrategy: 'concat-comma',
  },
  {
    name: 'Shipper Address',
    overflowCol: 21,
    anchorCols: [23, 24],
    range: [20, 24],
    mergeStrategy: 'concat-comma',
  },
  {
    name: 'Consignee Address',
    overflowCol: 27,
    anchorCols: [29, 30],
    range: [26, 30],
    mergeStrategy: 'concat-comma',
  },
  {
    name: 'Goods Description',
    overflowCol: 109,
    anchorCols: [110, 111, 113, 118],
    range: [109, 130],
    mergeStrategy: 'concat-space',
  },
];

/* ───────────────────────────────────────────────
   Shift Detection Engine
   ─────────────────────────────────────────────── */

function scoreZoneAnchors(row, zone, schema, offset) {
  let score = 0;
  let maxScore = 0;

  for (const acol of zone.anchorCols) {
    const def = schema[acol];
    if (!def) continue;
    const weight =
      def.type === 'country'  ? 10 :
      def.type === 'postcode' ? 8 :
      def.type === 'hscode'   ? 10 :
      def.type === 'currency' ? 9 : 5;
    maxScore += weight;

    const actualCol = acol + offset;
    if (actualCol < 0 || actualCol >= (row.length || 0)) {
      if (def.allowNull) score += weight * 0.3;
      continue;
    }
    const val = row[actualCol];
    if (val == null || val === '') {
      if (def.allowNull) score += weight * 0.3;
      continue;
    }
    if (def.test(val)) score += weight;
  }
  return { score, maxScore };
}

function detectZoneShift(row, zone, schema) {
  const offsets = [0, 1, 2, 3, 4, 5, -1, -2];
  let bestOffset = 0;
  let bestScore = -1;

  for (const off of offsets) {
    const { score } = scoreZoneAnchors(row, zone, schema, off);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = off;
    }
  }

  if (bestOffset !== 0) {
    const { score: zeroScore } = scoreZoneAnchors(row, zone, schema, 0);
    if (bestScore <= zeroScore * 1.2) return 0;
    if (bestScore === 0) return 0;
  }
  return bestOffset;
}

function repairZoneShift(row, zone, shift) {
  if (shift <= 0) return { fixed: false, details: '' };

  const oc = zone.overflowCol;
  const sep = zone.mergeStrategy === 'concat-comma' ? ', ' : ' ';

  // Merge overflow fragments
  const fragments = [];
  for (let i = 0; i <= shift; i++) {
    const val = row[oc + i];
    if (val != null && val !== '') fragments.push(String(val));
  }
  const merged = fragments.join(sep);

  // Build corrected row
  const corrected = row.slice(0, oc);
  corrected[oc] = merged;
  const sourceStart = oc + shift + 1;
  for (let c = sourceStart; c < row.length; c++) corrected.push(row[c]);
  while (corrected.length < row.length) corrected.push(null);

  for (let c = 0; c < row.length; c++) row[c] = corrected[c] ?? null;

  return {
    fixed: true,
    details: `${zone.name}: +${shift} col overflow → merged & realigned`,
  };
}

/* ───────────────────────────────────────────────
   Number Format Correction
   ─────────────────────────────────────────────── */

const NUMERIC_COLUMNS_DHL = [
  33, 34, 67, 71, 75, 76, 77,
  116, 117, 119,
  120, 121, 123, 124, 125, 127, 128,
];

function fixNumericValue(val) {
  if (val == null || val === '') return { value: val, changed: false, detail: '' };
  if (typeof val === 'number') return { value: val, changed: false, detail: '' };

  const orig = String(val).trim();
  let s = orig;

  if (/^[.,]\d/.test(s)) s = '0' + s;

  if (s.includes(',') && !s.includes('.')) {
    if ((s.match(/,/g) || []).length === 1) s = s.replace(',', '.');
  }

  if (s !== orig) return { value: s, changed: true, detail: `"${orig}" → "${s}"` };
  return { value: val, changed: false, detail: '' };
}

/* ───────────────────────────────────────────────
   Main Pipeline
   ─────────────────────────────────────────────── */

export function validateAndFix(data, broker) {
  const report = {
    shiftFixes: 0,
    numberFixes: 0,
    totalIssues: 0,
    issues: [],
  };

  const schema = broker.id === 'DHL' ? DHL_SCHEMA : null;
  const zones  = broker.id === 'DHL' ? DHL_SHIFT_ZONES : [];
  const numericCols = broker.id === 'DHL' ? NUMERIC_COLUMNS_DHL : [];

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    // ── 1. Multi-zone Shift Detection ──
    for (const zone of zones) {
      if (!schema) continue;
      const shift = detectZoneShift(row, zone, schema);
      if (shift > 0) {
        const { fixed, details } = repairZoneShift(row, zone, shift);
        if (fixed) {
          report.shiftFixes++;
          report.issues.push({ row: r + 1, type: 'shift', zone: zone.name, detail: details });
        }
      } else if (shift < 0) {
        report.issues.push({
          row: r + 1, type: 'warning', zone: zone.name,
          detail: `${zone.name}: possible left-shift (${shift}) — manual review needed`,
        });
      }
    }

    // ── 2. Number Format Correction ──
    for (const col of numericCols) {
      if (col >= row.length) continue;
      const { value, changed, detail } = fixNumericValue(row[col]);
      if (changed) {
        row[col] = value;
        report.numberFixes++;
        report.issues.push({ row: r + 1, type: 'number', detail: `Col ${col}: ${detail}` });
      }
    }

    // ── 3. Catch-all leading dot/comma ──
    for (let c = 0; c < row.length; c++) {
      if (numericCols.includes(c)) continue;
      const v = row[c];
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (/^[.,]\d+$/.test(trimmed)) {
        const fixed = '0' + trimmed.replace(',', '.');
        row[c] = fixed;
        report.numberFixes++;
        report.issues.push({ row: r + 1, type: 'number', detail: `Col ${c}: "${trimmed}" → "${fixed}"` });
      }
    }
  }

  report.totalIssues = report.shiftFixes + report.numberFixes +
    report.issues.filter(i => i.type === 'warning').length;
  return report;
}

export function reportSummary(report) {
  const parts = [];
  if (report.shiftFixes > 0) parts.push(`${report.shiftFixes} shifted row(s) corrected`);
  if (report.numberFixes > 0) parts.push(`${report.numberFixes} number format(s) fixed`);
  const warns = report.issues.filter(i => i.type === 'warning').length;
  if (warns > 0) parts.push(`${warns} warning(s)`);
  if (parts.length === 0) parts.push('No issues found — data looks clean');
  return parts.join(' · ');
}
