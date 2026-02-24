/**
 * Data Validator & Corrector — v3
 *
 * Complete rewrite based on analysis of 12 months of DHL Excel data.
 *
 * Findings that drive the design:
 *   1. Seller zone (cols 15-19) is ALWAYS empty in source data — never shift it.
 *   2. Shipper zone (cols 20-24) can have +1 shift when address overflows.
 *   3. Consignee zone (cols 26-30) can have +1 shift similarly.
 *   4. Goods zone (cols 109+) has the most complex shifts:
 *      - Description (col 109) can overflow into cols 110, 111, ... pushing
 *        HS Code, Country, etc. rightward by 1-4 columns.
 *      - Country of Origin (col 111) is sometimes legitimately empty
 *        (procedure code 300 rows) — this is NOT a shift.
 *   5. The old code wrongly pulled Shipper data (col 20+) into empty Seller
 *      cells (col 15+), destroying correct data alignment.
 *
 * Number format normalisation — German comma → dot, leading dot/comma fix
 */

/* ───────────────────────────────────────────────
   Column Pattern Matchers
   ─────────────────────────────────────────────── */

const P = {
  hsCode:      (v) => {
    if (v == null || v === '') return false;
    return /^\d{8,11}$/.test(String(v).trim());
  },
  country2:    (v) => typeof v === 'string' && /^[A-Z]{2}$/i.test(v.trim()),
  currency3:   (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  incoterm:    (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  postcode:    (v) => {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return s.length > 0 && s.length <= 10 && /^[\dA-Z][\dA-Z \-\.]*$/i.test(s);
  },
  numeric:     (v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'number') return true;
    return /^-?[.,]?\d/.test(String(v).trim());
  },
  date:        (v) => {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return /^\d{2}\.\d{2}\.\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
  },
  procCode:    (v) => {
    if (v == null || v === '') return false;
    return /^\d{3,4}$/.test(String(v).trim());
  },
  measure:     (v) => typeof v === 'string' && /^[A-Z]{2,3}$/.test(v.trim()),
  longText:    (v) => typeof v === 'string' && v.trim().length > 10,
  shortAlpha:  (v) => typeof v === 'string' && v.trim().length <= 10 && v.trim().length > 0,
  eori:        (v) => typeof v === 'string' && /^[A-Z]{2}\d+/.test(v.trim()),
  isEmpty:     (v) => v == null || v === '',
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
   Address Zone Shift Detection (Shipper / Consignee)
   ─────────────────────────────────────────────── */

/**
 * Detects a +N shift in an address zone.
 *
 * Layout: [Name, Address, Town, Postcode, Country]
 *         [base, base+1,  base+2, base+3, base+4]
 *
 * When the address field overflows, the data looks like:
 *   [Name, Addr-part1, Addr-part2, Town, Postcode, Country]
 *   where Town lands in base+3, Postcode in base+4, Country in base+5.
 *
 * Detection: check if base+4 (should be Country) is NOT a 2-letter code
 *            AND base+5 IS a 2-letter code → +1 shift
 */
function detectAddressZoneShift(row, base, nextSectionCol) {
  const nameCol    = base;
  const addrCol    = base + 1;
  const countryCol = base + 4;

  // Skip if the whole zone is empty (e.g., Seller zone is always empty)
  if (P.isEmpty(row[nameCol]) && P.isEmpty(row[addrCol]) && P.isEmpty(row[base + 2])) {
    return 0;
  }

  // Check current alignment: is col countryCol a 2-letter country?
  const isAligned = P.country2(row[countryCol]);
  if (isAligned) return 0;

  // Check for +1 shift: country might have been pushed 1 col right,
  // possibly crossing into the next section's first column
  if (countryCol + 1 <= nextSectionCol || nextSectionCol === -1) {
    if (P.country2(row[countryCol + 1]) && !P.country2(row[base + 3])) {
      return 1;
    }
  }

  // Check for +2 shift
  if (countryCol + 2 <= nextSectionCol + 1 || nextSectionCol === -1) {
    if (P.country2(row[countryCol + 2]) && !P.country2(row[countryCol + 1])) {
      return 2;
    }
  }

  return 0;
}

/**
 * Repairs a positive shift in an address zone by merging overflow
 * address fragments back into the Address field.
 */
function repairAddressZoneShift(row, base, shift, zoneName) {
  if (shift <= 0) return { fixed: false, details: '' };

  const addrCol = base + 1;
  const origLen = row.length;

  // Merge overflow fragments into address
  const fragments = [];
  for (let i = 0; i <= shift; i++) {
    const val = row[addrCol + i];
    if (val != null && val !== '') fragments.push(String(val));
  }
  const merged = fragments.join(', ');

  // Rebuild: keep [0..addrCol-1], merged address, then shifted data, then rest
  const before = row.slice(0, addrCol);
  before.push(merged);
  const afterStart = addrCol + shift + 1;
  const after = row.slice(afterStart);
  const corrected = [...before, ...after];

  while (corrected.length < origLen) corrected.push(null);
  if (corrected.length > origLen) corrected.length = origLen;

  for (let c = 0; c < origLen; c++) row[c] = corrected[c] ?? null;

  return {
    fixed: true,
    details: `${zoneName}: +${shift} address overflow → merged & realigned`,
  };
}

/* ───────────────────────────────────────────────
   Mid-Row Overflow Detection (col 32: delivery location)
   ─────────────────────────────────────────────── */

/**
 * Detects overflow in the delivery location cell (col 32).
 *
 * Normal: col 32 has a short town name, col 33 has a numeric freight value.
 * Overflow patterns:
 *   A) col 33 has non-numeric text (address fragment) → text overflow +N
 *   B) col 33 is EMPTY, col 32 has text, col 34 has numeric → structural gap +1
 *      This happens after shipper repair shifts a null cell into col 33.
 *
 * Returns: 0 (no shift) or N (number of extra overflow cells)
 */
function detectMidRowOverflow(row) {
  const freightCol = 33;
  const locationCol = 32;

  // ── Case A: col 33 has non-numeric text (delivery location overflowed) ──
  if (!P.isEmpty(row[freightCol]) && !P.numeric(row[freightCol])) {
    if (!P.isEmpty(row[locationCol]) && typeof row[freightCol] === 'string') {
      for (let offset = 1; offset <= 3; offset++) {
        const candidate = row[freightCol + offset];
        if (P.numeric(candidate) || P.isEmpty(candidate)) {
          const nextVal = row[freightCol + offset + 1];
          if (P.numeric(nextVal) || P.isEmpty(nextVal)) {
            return offset;
          }
        }
      }
    }
    return 0;
  }

  // ── Case B: col 33 is EMPTY, col 32 has text, freight at col 34 ──
  // After shipper repair, a null gap cell may slide into col 33 while the
  // delivery location text sits in col 32 and freight is pushed to col 34.
  if (P.isEmpty(row[freightCol]) && !P.isEmpty(row[locationCol])) {
    // col 34 should be numeric (freight) and col 35 also numeric (weight)
    if (P.numeric(row[freightCol + 1]) && P.numeric(row[freightCol + 2])) {
      return 1;
    }
  }

  return 0;
}

/**
 * Repairs mid-row overflow by merging delivery location fragments
 * and shifting subsequent columns left.
 */
function repairMidRowOverflow(row, shift) {
  if (shift <= 0) return { fixed: false, details: '' };

  const locationCol = 32;
  const origLen = row.length;

  // Merge location fragments (cols 32..32+shift)
  const fragments = [];
  for (let i = 0; i <= shift; i++) {
    const val = row[locationCol + i];
    if (val != null && val !== '') fragments.push(String(val));
  }
  const merged = fragments.join(', ');

  // Rebuild: keep [0..locationCol-1], merged location, then rest from locationCol+shift+1
  const before = row.slice(0, locationCol);
  before.push(merged);
  const afterStart = locationCol + shift + 1;
  const after = row.slice(afterStart);
  const corrected = [...before, ...after];

  while (corrected.length < origLen) corrected.push(null);
  if (corrected.length > origLen) corrected.length = origLen;

  for (let c = 0; c < origLen; c++) row[c] = corrected[c] ?? null;

  return {
    fixed: true,
    details: `Mid-row: +${shift} delivery location overflow at col 32 → merged & realigned`,
  };
}

/* ───────────────────────────────────────────────
   Goods Zone Shift Detection (cols 109+)
   ─────────────────────────────────────────────── */

/**
 * The goods description (col 109) can overflow into multiple columns,
 * pushing HS Code, Country of Origin, etc. rightward.
 *
 * Normal layout:
 *   [109: Description] [110: HS Code] [111: Country] [112: Pref] [113: ProcCode] ...
 *
 * Shifted +1:
 *   [109: Desc-part1] [110: Desc-part2] [111: HS Code] [112: Country] ...
 *
 * Detection: find where the HS Code (8-11 digit number) actually is.
 *
 * Special case: "missing country" rows (procCode=300) have empty country —
 * this is valid data, NOT a shift.
 */
function detectGoodsZoneShift(row) {
  const hsCol = 110;

  // Check if col 110 already has a valid HS code
  if (P.hsCode(row[hsCol])) {
    // Verify: col 111 should be country or empty, col 113 should be procCode
    const country = row[111];
    const procCode = row[113];
    if ((P.country2(country) || P.isEmpty(country)) && P.procCode(procCode)) {
      return 0;
    }
    // "no country" pattern: col 111 empty, col 112 has procCode like "300"
    if (P.isEmpty(country) && P.procCode(row[112])) {
      return 0;
    }
  }

  // Scan rightward from col 110 to find HS code (up to +8 for long descriptions)
  for (let offset = 1; offset <= 8; offset++) {
    const candidate = row[hsCol + offset];
    if (P.hsCode(candidate)) {
      const afterHS = hsCol + offset;
      const candidateCountry = row[afterHS + 1];
      const candidateProc = row[afterHS + 3];
      const candidatePref = row[afterHS + 2];

      // Strong: country OK + procCode OK
      if ((P.country2(candidateCountry) || P.isEmpty(candidateCountry)) &&
          P.procCode(candidateProc)) {
        return offset;
      }
      // Country found after HS
      if (P.country2(candidateCountry)) {
        return offset;
      }
      // HS found, empty country, procCode at +2 (no-country pattern shifted)
      if (P.isEmpty(candidateCountry) && P.procCode(candidatePref)) {
        return offset;
      }
    }
  }

  // Special case: col 110 is empty but col 111 has HS code
  if (P.isEmpty(row[hsCol]) && P.hsCode(row[hsCol + 1])) {
    return 1;
  }

  return 0;
}

/**
 * Repairs goods zone shift by merging description overflow fragments
 * and shifting subsequent columns back to their correct positions.
 */
function repairGoodsZoneShift(row, shift) {
  if (shift <= 0) return { fixed: false, details: '' };

  const descCol = 109;
  const origLen = row.length;

  // Merge description fragments (skip date placeholders like "0001-01-01")
  const fragments = [];
  for (let i = 0; i <= shift; i++) {
    const val = row[descCol + i];
    if (val != null && val !== '') {
      const s = String(val).trim();
      // Skip date placeholder values that aren't real description text
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) continue;
      fragments.push(s);
    }
  }
  const merged = fragments.join(' ');

  // Rebuild row
  const before = row.slice(0, descCol);
  before.push(merged);
  const afterStart = descCol + shift + 1;
  const after = row.slice(afterStart);
  const corrected = [...before, ...after];

  while (corrected.length < origLen) corrected.push(null);
  if (corrected.length > origLen) corrected.length = origLen;

  for (let c = 0; c < origLen; c++) row[c] = corrected[c] ?? null;

  return {
    fixed: true,
    details: `Goods: +${shift} description overflow → merged & realigned (HS=${String(row[110] ?? '').substring(0,11)})`,
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

/* ───────────────────────────────────────────────
   FedEx Column Layout & Validation
   ─────────────────────────────────────────────── */

// FedEx numeric columns — columns that should contain numbers.
// Derived from analysis of 22 FedEx files (1,882 data rows).
// Col 73 (AH STATISTISCHEMENGE) comes as string from xlsx in some rows.
const NUMERIC_COLUMNS_FEDEX = [
  22,  // RECHNUNGSPREIS (invoice price)
  24,  // KURS (exchange rate)
  27,  // GESAMTROHMASSE (gross weight)
  44,  // AUFSCHUB EF 2
  49,  // AUFSCHUB EF 3
  53,  // POSITION NR
  60,  // BEANTRAGTE BEGUENSTIGUNG
  61,  // PACKSTUECKE ANZAHL (package count)
  65,  // EIGENMASSE (net weight)
  66,  // RECHNUNGSPREIS (line-level invoice price)
  67,  // ZOLLWERT (customs value)
  68,  // EUSTWERT
  70,  // ARTIKELPREIS
  73,  // AH STATISTISCHEMENGE (statistical quantity) — often string
  85,  // ZOLLSATZ (duty rate)
  86,  // FRACHTKOSTEN (freight costs)
  88,  // PROZENTSATZ (percentage)
  89,  // HINZURECHNUNGART
  90,  // HINZURECHNUNGBETRAG
  91,  // ZOLL (customs duty)
];

// FedEx description column
const FEDEX_COL_DESCRIPTION = 64;  // WARENBESCHREIBUNG

// FedEx HS code column
const FEDEX_COL_HS_CODE = 56;  // TARIFNUMMER

// FedEx country columns
const FEDEX_COL_VERSENDUNGSLAND = 21;  // Sending country
const FEDEX_COL_URSPRUNGSLAND = 57;    // Country of origin

/**
 * FedEx-specific validation and correction pipeline.
 *
 * Issues found in analysis of 22 FedEx files (1,882 rows):
 *   1. Col 73 (STATISTISCHEMENGE) has 216 string-typed integers → convert to Number
 *   2. Col 64 (WARENBESCHREIBUNG) has 102 trailing newlines → strip
 *   3. Col 34 and others have trailing whitespace (e.g. "J ") → trim strings
 *   4. Number format: most values already JS Number, but apply fixNumericValue
 *      to catch any edge-case European-format strings
 *   5. Post-repair validation on HS Code (col 56) and country codes (cols 21, 57)
 *
 * No column-shift issues were found in FedEx data (unlike DHL). The FedEx export
 * format is more structured — fixed 91-column layout with no address overflow.
 */
function validateAndFixFedEx(data, report) {
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    // ── 1. Trailing newline cleanup (description and all string cells) ──
    // FedEx descriptions (col 64) frequently end with \n from the Excel source.
    // Clean all cells to be safe — this won't affect non-string values.
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v !== 'string') continue;

      // Strip trailing/leading whitespace and newlines
      const cleaned = v.replace(/[\r\n]+$/g, '').replace(/^[\r\n]+/g, '');
      if (cleaned !== v) {
        row[c] = cleaned;
        report.numberFixes++;
        report.issues.push({
          row: r + 1, type: 'cleanup',
          detail: `Col ${c}: stripped trailing newline/whitespace`,
        });
      }
    }

    // ── 2. Number format correction — all columns ──
    // Apply fixNumericValue to catch European-format numbers (comma→dot).
    // Most FedEx values are already JS Number, but this handles edge cases.
    for (let c = 0; c < row.length; c++) {
      const { value, changed, detail } = fixNumericValue(row[c]);
      if (changed) {
        row[c] = value;
        report.numberFixes++;
        report.issues.push({ row: r + 1, type: 'number', detail: `Col ${c}: ${detail}` });
      }
    }

    // ── 3. String-to-Number conversion for numeric columns ──
    // Col 73 (STATISTISCHEMENGE) frequently comes as string ("12000") from xlsx.
    // Convert all numeric-column strings to JS Number for proper Excel output.
    for (const col of NUMERIC_COLUMNS_FEDEX) {
      if (col >= row.length) continue;
      const v = row[col];
      if (v == null || v === '' || typeof v === 'number') continue;
      const s = String(v).trim();
      const n = Number(s);
      if (s.length > 0 && !isNaN(n)) {
        row[col] = n;
        report.numberFixes++;
        report.issues.push({
          row: r + 1, type: 'number',
          detail: `Col ${col}: string→number "${s}" → ${n}`,
        });
      }
    }

    // ── 4. Post-repair validation — warn if critical columns look wrong ──

    // HS Code (col 56, TARIFNUMMER): should be 8-11 digit string
    const hs = row[FEDEX_COL_HS_CODE];
    if (hs != null && hs !== '') {
      const hsStr = String(hs).trim();
      if (hsStr.length > 0 && !/^\d{8,11}$/.test(hsStr)) {
        report.issues.push({
          row: r + 1, type: 'warning', zone: 'HS Code',
          detail: `TARIFNUMMER (col ${FEDEX_COL_HS_CODE}) invalid: "${hsStr.substring(0,30)}"`,
        });
      }
    }

    // Sending country (col 21): should be 2-letter code
    const vs = row[FEDEX_COL_VERSENDUNGSLAND];
    if (vs != null && vs !== '') {
      const vsStr = String(vs).trim();
      if (vsStr.length > 0 && !/^[A-Z]{2}$/i.test(vsStr)) {
        report.issues.push({
          row: r + 1, type: 'warning', zone: 'Country',
          detail: `VERSENDUNGSLAND (col ${FEDEX_COL_VERSENDUNGSLAND}) invalid: "${vsStr}"`,
        });
      }
    }

    // Origin country (col 57): should be 2-letter code (may include "EU")
    const oc = row[FEDEX_COL_URSPRUNGSLAND];
    if (oc != null && oc !== '') {
      const ocStr = String(oc).trim();
      if (ocStr.length > 0 && !/^[A-Z]{2}$/i.test(ocStr)) {
        report.issues.push({
          row: r + 1, type: 'warning', zone: 'Country',
          detail: `URSPRUNGSLAND (col ${FEDEX_COL_URSPRUNGSLAND}) invalid: "${ocStr}"`,
        });
      }
    }
  }

  report.totalIssues = report.shiftFixes + report.numberFixes +
    report.issues.filter(i => i.type === 'warning').length;
  return report;
}

/**
 * Fixes European-style numeric values:
 *  - Leading comma/dot  →  prepend 0: ",5" → "0.5"
 *  - Single comma as decimal separator → dot: "123,45" → "123.45"
 *  - Thousands-dot + comma-decimal → remove dots, comma→dot: "1.234,56" → "1234.56"
 *  - Negative variants with leading minus
 */
function fixNumericValue(val) {
  if (val == null || val === '') return { value: val, changed: false, detail: '' };
  if (typeof val === 'number') return { value: val, changed: false, detail: '' };

  const orig = String(val).trim();
  let s = orig;

  // Leading comma or dot → prepend 0
  if (/^-?[.,]\d/.test(s)) {
    s = s.replace(/^(-?)([.,])/, '$10$2');
  }

  // European thousands-dot + comma-decimal: "1.234,56" or "12.345.678,90"
  // Pattern: digits, then one or more groups of .NNN, then ,NN
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  // Single comma as decimal separator (no dots present): "123,45" or "-0,5"
  // Must look like a number: optional minus, digits, single comma, digits
  else if (/^-?\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
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

  if (broker.id === 'FEDEX') {
    return validateAndFixFedEx(data, report);
  }

  if (broker.id !== 'DHL') {
    // For other brokers, only do leading dot/comma fix
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
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
    report.totalIssues = report.numberFixes;
    return report;
  }

  // ── DHL-specific validation pipeline ──
  //
  // Order matters! Address zone repairs (Shipper/Consignee) must run BEFORE
  // goods zone repair. The address repair removes overflow cells and shifts
  // the entire row left — this affects goods zone column positions. If we
  // repair goods first, the subsequent address repair would shift the
  // already-corrected goods columns out of alignment.

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    // ── 1. Shipper Address Zone (cols 20-24) — FIRST ──
    const shipperShift = detectAddressZoneShift(row, 20, 25);
    if (shipperShift > 0) {
      const { fixed, details } = repairAddressZoneShift(row, 20, shipperShift, 'Shipper');
      if (fixed) {
        report.shiftFixes++;
        report.issues.push({ row: r + 1, type: 'shift', zone: 'Shipper', detail: details });
      }
    }

    // ── 2. Consignee Address Zone (cols 26-30) ──
    const consigneeShift = detectAddressZoneShift(row, 26, 31);
    if (consigneeShift > 0) {
      const { fixed, details } = repairAddressZoneShift(row, 26, consigneeShift, 'Consignee');
      if (fixed) {
        report.shiftFixes++;
        report.issues.push({ row: r + 1, type: 'shift', zone: 'Consignee', detail: details });
      }
    }

    // NOTE: Seller zone (cols 15-19) is intentionally NOT checked.
    // 12 months of data shows Seller is ALWAYS empty in DHL source files.
    // The old code wrongly detected a "shift" and pulled Shipper data into Seller cells.

    // ── 3. Mid-row overflow (col 32: delivery location) ──
    // After address zone repairs, check if col 33 (Freight) has non-numeric data.
    // This happens when the delivery location (col 32) overflows, pushing
    // freight and everything after it right. Common in cascade shifts where
    // the shipper address overflow also pushes excess data into col 33.
    const midRowShift = detectMidRowOverflow(row);
    if (midRowShift > 0) {
      const { fixed, details } = repairMidRowOverflow(row, midRowShift);
      if (fixed) {
        report.shiftFixes++;
        report.issues.push({ row: r + 1, type: 'shift', zone: 'Mid-row', detail: details });
      }
    }

    // ── 4. Goods Zone Shift Detection (after address + mid-row repairs) ──
      let goodsShift = detectGoodsZoneShift(row);
      if (goodsShift > 0) {
        const { fixed, details } = repairGoodsZoneShift(row, goodsShift);
        if (fixed) {
          report.shiftFixes++;
          report.issues.push({ row: r + 1, type: 'shift', zone: 'Goods', detail: details });
        }
      } else {
        // Fallback: if HS Code not in col 110 but present in a downstream col
        // (110..118), infer a rightward shift and repair. This is a tolerant
        // heuristic for rare exports where the HS code moved right without
        // the detector matching usual overflow patterns.
        if (!P.hsCode(row[110]) && !P.isEmpty(row[110])) {
          for (let j = 111; j <= 118; j++) {
            if (P.hsCode(row[j])) {
              const inferredShift = j - 110;
              const { fixed, details } = repairGoodsZoneShift(row, inferredShift);
              if (fixed) {
                report.shiftFixes++;
                report.issues.push({ row: r + 1, type: 'shift', zone: 'Goods', detail: `Inferred shift +${inferredShift}: ${details}` });
              }
              break;
            }
          }
        }
      }

    // ── 5. Number Format Correction — ALL columns ──
    // Apply fixNumericValue to every cell in the row. This ensures uniform
    // decimal separators (comma → dot) across all columns, not just the
    // known numeric ones. fixNumericValue only changes values that look
    // like European-format numbers, so text strings are left untouched.
    for (let c = 0; c < row.length; c++) {
      const { value, changed, detail } = fixNumericValue(row[c]);
      if (changed) {
        row[c] = value;
        report.numberFixes++;
        report.issues.push({ row: r + 1, type: 'number', detail: `Col ${c}: ${detail}` });
      }
    }

    // ── 5b. Convert numeric-column strings to actual numbers ──
    // After comma→dot normalisation, values like "5.07" are still strings.
    // XLSX.utils.aoa_to_sheet writes strings as text cells (t:"s"), which
    // causes locale-dependent display in Excel (Romanian locale shows comma).
    // Converting to JS Number here makes them proper number cells (t:"n")
    // in the output Excel, so they display uniformly regardless of locale.
    for (const col of NUMERIC_COLUMNS_DHL) {
      if (col >= row.length) continue;
      const v = row[col];
      if (v == null || v === '' || typeof v === 'number') continue;
      const s = String(v).trim();
      const n = Number(s);
      if (s.length > 0 && !isNaN(n)) {
        row[col] = n;
      }
    }

    // ── 6. Post-repair validation — warn if critical columns still bad ──
    if (!P.hsCode(row[110]) && !P.isEmpty(row[110])) {
      report.issues.push({
        row: r + 1, type: 'warning', zone: 'Goods',
        detail: `HS Code (col 110) still invalid after repair: "${String(row[110]).substring(0,30)}" — manual review`,
      });
    }
    if (!P.country2(row[24]) && !P.isEmpty(row[24])) {
      const v24 = String(row[24]).trim();
      if (v24.length > 0 && !/^[A-Z]{2}$/i.test(v24)) {
        report.issues.push({
          row: r + 1, type: 'warning', zone: 'Shipper',
          detail: `Shipper Country (col 24) invalid: "${v24}" — possible undetected shift`,
        });
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
