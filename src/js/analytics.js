/**
 * Analytics Engine — broker-aware data aggregation and chart rendering.
 *
 * Processes the merged/validated data stored after a merge operation
 * and produces chart-ready datasets for each broker type.
 *
 * Uses Chart.js (loaded via CDN) for all visualizations.
 */

/* ───────────────────────────────────────────────
   Broker Column Mappings
   ─────────────────────────────────────────────── */

/**
 * Each broker has a different column layout. These mappings tell the
 * analytics engine where to find key data fields in each broker's
 * merged output (after validation/repair).
 *
 * Index-based for DHL/FedEx/UPS (fixed layouts).
 * Header-based for DSV (variable layouts across months).
 */
const COLUMN_MAP = {
  DHL: {
    type: 'index',
    date:             0,    // date of declaration (DD.MM.YYYY)
    declarationNo:    4,    // declaration number
    shipperName:      20,   // Shipper Name
    shipperCountry:   24,   // Shipper Country (2-letter)
    consigneeName:    26,   // Consignee Name
    consigneeCountry: 30,   // Consignee Country (2-letter)
    incoterm:         31,   // Incoterm (DAP, EXW, etc.)
    freight:          33,   // freight charges EUR
    weight:           34,   // weight kg
    pieces:           35,   // number of pieces
    customsDuties:    67,   // summary of customs duties
    vat:              71,   // summary of vat
    importDuties:     75,   // summary import duties
    totalDutiesVAT:   76,   // summary duties + vat
    description:      109,  // description of goods
    hsCode:           110,  // HS Code (8-11 digits)
    countryOfOrigin:  111,  // country of origin
    procedureCode:    113,  // procedure code
    invoiceValue:     117,  // invoice value
    currency:         118,  // currency
    exchangeRate:     119,  // exchange rate
    dutyBasis:        120,  // basis of calculation for duty EUR
    duty:             123,  // duty amount
    vatAmount:        127,  // vat amount
  },
  FEDEX: {
    type: 'index',
    date:             7,    // DATUM (Excel serial → needs conversion)
    declarationNo:    6,    // REGISTRIERNUMMER
    awb:              5,    // AWB
    shipperCountry:   21,   // VERSENDUNGSLAND
    consigneeName:    15,   // NAME EMPFAENGER
    incoterm:         31,   // LIEFERBEDINGUNG
    deliveryPlace:    32,   // LIEFERORT
    invoiceValue:     22,   // RECHNUNGSPREIS (header level)
    currency:         23,   // WKZ
    exchangeRate:     24,   // KURS
    grossWeight:      27,   // GESAMTROHMASSE
    packageCount:     61,   // PACKSTUECKE ANZAHL
    hsCode:           56,   // TARIFNUMMER
    countryOfOrigin:  57,   // URSPRUNGSLAND
    procedureCode:    58,   // VERFAHRENSCODE
    description:      64,   // WARENBESCHREIBUNG
    netWeight:        65,   // EIGENMASSE
    lineInvoice:      66,   // RECHNUNGSPREIS2 (line level)
    customsValue:     67,   // ZOLLWERT
    eustValue:        68,   // EUSTWERT
    articlePrice:     70,   // ARTIKELPREIS
    dutyRate:         85,   // ZOLLSATZ
    freightCost:      86,   // FRACHTKOSTEN
    dutyAmount:       91,   // ZOLL
  },
  UPS: {
    type: 'index',
    date:             0,    // Datum der Zollanmeldung (DD.MM.YYYY)
    invoiceValue:     8,    // Rechnungspreis
    currency:         9,    // Waehrung
    exchangeRate:     10,   // Kurs
    invoiceEUR:       11,   // Rechnungspreis in Euro
    packageCount:     15,   // Kolli-Anzahl
    grossWeight:      16,   // Gesamt-Rohmasse
    freightAmount:    17,   // Frachbetrag (lt. Frachtbrief)
    freightEUR:       20,   // Frachtbetrag in Euro
    shipperCountry:   23,   // Versendungsland
    countryOfOrigin:  24,   // Ursprungsland
    hsCode:           28,   // Zolltarifnummer
    description:      29,   // Warenbeschreibung
    dutyRate:         30,   // Zollsatz
    customsValue:     31,   // Zollwert
    dutyAmount:       32,   // Zoll (Betrag in Euro)
    eustRate:         38,   // EUSt-Satz
    eustValue:        39,   // EUSt-Wert
    eustAmount:       40,   // EUSt-Betrag
    senderName:       41,   // Versendername
    senderCountry:    42,   // Land (sender)
    sellerCountry:    44,   // Land4 (seller)
    incoterm:         45,   // Lieferbedingungsschluessel
    euFreight:        47,   // Anteilige Frachtkosten bis EU-Grenze
  },
  DSV: {
    type: 'header',
    // Map logical field names → possible header names
    headerMap: {
      date:            ['Anlagedatum', 'Ãberlassungsdatum', 'Überlassungsdatum', 'Entry Date \n(ddmmyy)', 'Arrival Date'],
      declarationNo:   ['Registriernummer/MRN', 'Registrienummer/MRN', 'Formal Entry Number'],
      shipperName:     ['CZ Name', 'Versender Name', 'Supplier Name / Shipper Name'],
      shipperCountry:  ['CZ Ländercode', 'Versender Ländercode', 'Shipping Country'],
      consigneeName:   ['CN Name', 'Empfänger Name', 'Importer Name'],
      consigneeCountry:['CN Ländercode', 'Empfänger Ländercode', 'Declaration Country'],
      incoterm:        ['Liefercode', 'Incoterms'],
      deliveryPlace:   ['Lieferort'],
      invoiceValue:    ['Rechnungsbetrag', 'Invoice value'],
      currency:        ['Rechnungswährung', 'Invoice currency'],
      exchangeRate:    ['Rechnungskurs', 'Exchange Rate'],
      hsCode:          ['Warentarifnummer', 'HTS Code (Tariff Number)'],
      description:     ['Warenbezeichnung', 'Item Description'],
      countryOfOrigin: ['Ursprung', 'Country of Origin'],
      procedureCode:   ['Verfahren'],
      customsDuty:     ['AbgabeZoll', 'Vorraussichtliche Zollabgabe', 'Vorausstl. Zollabgabe', 'Duty Paid'],
      customsDutyRate: ['AbgabeZollsatz', 'Vorraussichtliche Zollsatzabgabe', 'Vorausstl. Zollsatzabgabe', 'Duty Rate %'],
      eustAmount:      ['AbgabeEust', 'Vorraussichtliche Eustabgabe', 'Vorausstl. Eustabgabe', 'VAT Paid'],
      eustRate:        ['AbgabeEustsatz', 'Vorraussichtliche Eustsatzabgabe', 'Vorausstl. Eustsatzabgabe', 'VAT Rate %'],
      customsValue:    ['Zollwert', 'Declared Value'],
      articlePrice:    ['Artikelpreis'],
      grossWeight:     ['Rohmasse', 'Gesamtgewicht', 'Gross Mass (in kg)'],
      netWeight:       ['Eigenmasse', 'Net Mass (in kg)'],
      freightCost:     ['DV1Frachtkosten', 'DV1Luftfrachtkosten'],
      packageCount:    ['AnzahlPackstücke', 'Anzahlpackstã¼cke'],
      statisticalValue:['Statistischerwert'],
      container:       ['Container'],
    },
  },
  // KN and Schenker use basic merge — analytics are limited
  KN:       { type: 'generic' },
  SCHENKER: { type: 'generic' },
};

/* ───────────────────────────────────────────────
   Data Extraction Helpers
   ─────────────────────────────────────────────── */

/**
 * Build a DSV column index resolver from headers.
 */
function buildDSVResolver(headers) {
  const headerRow = (headers[0] || []).map(h => h != null ? String(h).trim() : '');
  const map = {};
  const dsvMap = COLUMN_MAP.DSV.headerMap;

  for (const [field, names] of Object.entries(dsvMap)) {
    for (const name of names) {
      // For procedureCode, "Verfahren" appears twice: once at col ~2
      // (declaration type, e.g. "IMDC") and once at col ~84 (customs
      // procedure code, e.g. "4000"). We want the second (position-level)
      // occurrence, so search from column 40 onwards.
      const startIdx = (field === 'procedureCode') ? 40 : 0;
      const idx = headerRow.findIndex((h, i) => i >= startIdx && h.toLowerCase() === name.toLowerCase());
      if (idx !== -1) { map[field] = idx; break; }
    }
  }
  return map;
}

/**
 * Extract a field value from a row based on broker type.
 */
function getField(row, field, colMap) {
  const idx = colMap[field];
  if (idx == null || idx < 0 || idx >= row.length) return null;
  return row[idx];
}

/**
 * Parse a numeric value, handling various formats.
 */
function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim().replace(/\s/g, '');
  // Already dot-decimal (after validator fixes)
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse a date string into { year, month, day } or null.
 * Handles DD.MM.YYYY, YYYY-MM-DD, and Excel serial numbers.
 */
function parseDate(v) {
  if (v == null || v === '') return null;

  // Excel serial number
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  const s = String(v).trim();

  // DD.MM.YYYY
  const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m1) return { year: +m1[3], month: +m1[2], day: +m1[1] };

  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return { year: +m2[1], month: +m2[2], day: +m2[3] };

  // Compressed DMMYYYY or DDMMYYYY (used in some Luftfracht files: 7052025 = 07.05.2025)
  if (typeof v === 'number' && v > 1000000 && v < 99999999) {
    const ds = String(v);
    if (ds.length === 7) {
      // DMMYYYY
      return { year: +ds.substring(3), month: +ds.substring(1, 3), day: +ds.substring(0, 1) };
    } else if (ds.length === 8) {
      // DDMMYYYY
      return { year: +ds.substring(4), month: +ds.substring(2, 4), day: +ds.substring(0, 2) };
    }
  }

  // DDMMYYYY as string (no separators)
  const m3 = s.match(/^(\d{1,2})(\d{2})(\d{4})$/);
  if (m3 && +m3[2] <= 12 && +m3[1] <= 31) {
    return { year: +m3[3], month: +m3[2], day: +m3[1] };
  }

  return null;
}

/**
 * Extract the HS chapter (first 2 digits) from an HS code.
 */
function hsChapter(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (s.length >= 2 && /^\d{2}/.test(s)) return s.substring(0, 2);
  return null;
}

/**
 * Get a month label from month number (1-12).
 */
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Normalise country of origin values.
 * DSV files use full country names (e.g. "Mexiko") instead of ISO codes.
 * This map converts common German country names to ISO 3166-1 alpha-2.
 */
const COUNTRY_NAME_TO_ISO = {
  'afghanistan': 'AF', 'ägypten': 'EG', 'albanien': 'AL', 'algerien': 'DZ',
  'argentinien': 'AR', 'armenien': 'AM', 'australien': 'AU', 'bangladesch': 'BD',
  'belgien': 'BE', 'bosnien und herzegowina': 'BA', 'brasilien': 'BR',
  'bulgarien': 'BG', 'chile': 'CL', 'china': 'CN', 'dänemark': 'DK',
  'deutschland': 'DE', 'dominikanische republik': 'DO', 'estland': 'EE',
  'finnland': 'FI', 'frankreich': 'FR', 'georgien': 'GE', 'griechenland': 'GR',
  'großbritannien': 'GB', 'hongkong': 'HK', 'indien': 'IN', 'indonesien': 'ID',
  'irak': 'IQ', 'iran': 'IR', 'irland': 'IE', 'island': 'IS', 'israel': 'IL',
  'italien': 'IT', 'japan': 'JP', 'jordanien': 'JO', 'kambodscha': 'KH',
  'kanada': 'CA', 'kasachstan': 'KZ', 'katar': 'QA', 'kenia': 'KE',
  'kolumbien': 'CO', 'korea': 'KR', 'kroatien': 'HR', 'kuba': 'CU',
  'lettland': 'LV', 'libanon': 'LB', 'litauen': 'LT', 'luxemburg': 'LU',
  'malaysia': 'MY', 'marokko': 'MA', 'mexiko': 'MX', 'moldau': 'MD',
  'mongolei': 'MN', 'montenegro': 'ME', 'neuseeland': 'NZ', 'niederlande': 'NL',
  'nigeria': 'NG', 'nordmazedonien': 'MK', 'norwegen': 'NO', 'österreich': 'AT',
  'pakistan': 'PK', 'peru': 'PE', 'philippinen': 'PH', 'polen': 'PL',
  'portugal': 'PT', 'rumänien': 'RO', 'russland': 'RU', 'saudi-arabien': 'SA',
  'schweden': 'SE', 'schweiz': 'CH', 'serbien': 'RS', 'singapur': 'SG',
  'slowakei': 'SK', 'slowakische republik': 'SK', 'slowenien': 'SI',
  'spanien': 'ES', 'sri lanka': 'LK',
  'südafrika': 'ZA', 'südkorea': 'KR', 'süd-korea': 'KR', 'taiwan': 'TW', 'thailand': 'TH',
  'tschechien': 'CZ', 'tschechische republik': 'CZ', 'tunesien': 'TN',
  'türkei': 'TR', 'ukraine': 'UA', 'ungarn': 'HU',
  'vereinigte arabische emirate': 'AE', 'vereinigte staaten': 'US',
  'vereinigtes königreich': 'GB', 'vietnam': 'VN', 'weißrussland': 'BY',
  'zypern': 'CY',
};

/**
 * Normalise a country value to a 2-letter ISO code.
 * If already a 2-letter code, return as-is.
 * If a known German name, convert.
 * Otherwise return the original trimmed value.
 */
function normaliseCountry(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s || s === '0') return null;
  // Already a 2-letter code
  if (/^[A-Z]{2}$/.test(s)) return s;
  // Try exact lookup (case-insensitive)
  const low = s.toLowerCase();
  const iso = COUNTRY_NAME_TO_ISO[low];
  if (iso) return iso;
  // Try after stripping parenthetical text: "Südkorea (Republik Korea)" → "Südkorea"
  const stripped = low.replace(/\s*\(.*\)\s*$/, '').trim();
  if (stripped !== low) {
    const iso2 = COUNTRY_NAME_TO_ISO[stripped];
    if (iso2) return iso2;
  }
  // If it's only digits or single char, not a valid country
  if (/^\d+$/.test(s) || s.length < 2) return null;
  // Return upper-cased original (might be 3-letter or unknown)
  return s.toUpperCase().substring(0, 2);
}

/**
 * Normalise procedure code values.
 * DSV often includes full description: "4000 -- Gleichzeitige..."
 * Extract just the numeric code prefix.
 */
function normaliseProcCode(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  // Extract leading digits (e.g. "4000" from "4000 -- Gleichzeitige...")
  const m = s.match(/^(\d{4})/);
  if (m) return m[1];
  // Short codes like "IMDC" — return as-is
  return s;
}

/* ───────────────────────────────────────────────
   Aggregation Engine
   ─────────────────────────────────────────────── */

/**
 * Main aggregation function. Takes merged data + broker config
 * and returns a comprehensive analytics object.
 */
export function aggregateData(headers, data, brokerId) {
  const mapCfg = COLUMN_MAP[brokerId];
  if (!mapCfg) return null;

  let colMap;

  if (mapCfg.type === 'index') {
    // Direct index mapping
    colMap = {};
    for (const [k, v] of Object.entries(mapCfg)) {
      if (k === 'type') continue;
      colMap[k] = v;
    }
  } else if (mapCfg.type === 'header') {
    colMap = buildDSVResolver(headers);
  } else {
    // Generic broker — try to auto-detect from headers
    colMap = autoDetectColumns(headers);
  }

  // ── Extract structured records ──
  const records = [];
  for (const row of data) {
    if (!row) continue;
    const date = parseDate(getField(row, 'date', colMap));

    // ── Country normalisation (DSV uses full German names like "Mexiko") ──
    const rawOrigin = str(getField(row, 'countryOfOrigin', colMap));
    const rawShipperCountry = str(getField(row, 'shipperCountry', colMap));

    // ── VAT/EUSt amount resolution ──
    // Some brokers (FedEx) don't provide the actual EUSt amount, only the
    // assessment basis (EUSTWERT). When no direct amount is available,
    // compute it as eustValue × 19% (standard German import VAT rate).
    let vatAmt = toNum(getField(row, 'vatAmount', colMap) ?? getField(row, 'eustAmount', colMap) ?? getField(row, 'vat', colMap));
    if (vatAmt == null) {
      const eustVal = toNum(getField(row, 'eustValue', colMap));
      if (eustVal != null && eustVal > 0) {
        const rate = toNum(getField(row, 'eustRate', colMap)) || 19;
        vatAmt = eustVal * rate / 100;
      }
    }

    // ── Currency validation ──
    // Filter out obviously invalid currency codes (numeric values that
    // leaked from shifted columns, or values longer than 3 characters)
    let rawCurrency = str(getField(row, 'currency', colMap));
    if (rawCurrency && (rawCurrency.length > 3 || /^\d/.test(rawCurrency) || /[,.]/.test(rawCurrency))) {
      rawCurrency = null;
    }

    // ── Incoterm validation ──
    // Filter out company names that leaked from wrong column resolution
    let rawIncoterm = str(getField(row, 'incoterm', colMap));
    if (rawIncoterm && rawIncoterm.length > 5) {
      rawIncoterm = null;  // Valid incoterms are 3 chars (EXW, DAP, etc.)
    }

    // ── DSV integer-cents correction ──
    // One Luftfracht file stores all monetary values as integer cents
    // (×100) and mass values with 6 implied decimal places (×1000000).
    // Detection: if weight > 100,000 kg AND invoice is an integer AND
    // both are non-null, this row almost certainly uses integer encoding.
    // Apply correction: monetary ÷100, mass ÷1000000.
    let integerCentsRow = false;
    let weightVal = toNum(getField(row, 'weight', colMap) ?? getField(row, 'grossWeight', colMap) ?? getField(row, 'netWeight', colMap));
    // Prefer line-level invoice (e.g. FedEx RECHNUNGSPREIS2 col 66) over
    // header-level invoice (FedEx RECHNUNGSPREIS col 22) which may be
    // repeated across multi-line declarations and would over-count totals.
    let invoiceVal = toNum(getField(row, 'lineInvoice', colMap) ?? getField(row, 'invoiceValue', colMap));
    let invoiceEURVal = toNum(getField(row, 'invoiceEUR', colMap));

    if (brokerId === 'DSV' && weightVal != null && weightVal > 100000
        && invoiceVal != null && Number.isInteger(invoiceVal) && invoiceVal > 10000) {
      // Integer-cents encoded row — correct all monetary and mass values
      invoiceVal = invoiceVal / 100;
      if (invoiceEURVal != null) invoiceEURVal = invoiceEURVal / 100;
      if (vatAmt != null) vatAmt = vatAmt / 100;
      weightVal = weightVal / 1000000;
      integerCentsRow = true;
    }

    // ── Weight sanity cap ──
    if (weightVal != null && weightVal > 500000) weightVal = null; // >500t per position is unrealistic

    records.push({
      date,
      monthKey:          date ? `${date.year}-${String(date.month).padStart(2, '0')}` : 'Unknown',
      monthLabel:        date ? `${MONTH_LABELS[date.month - 1]} ${date.year}` : 'N/A',
      shipperCountry:    normaliseCountry(rawShipperCountry),
      consigneeCountry:  normaliseCountry(str(getField(row, 'consigneeCountry', colMap))),
      countryOfOrigin:   normaliseCountry(rawOrigin),
      incoterm:          rawIncoterm,
      currency:          rawCurrency,
      hsCode:            str(getField(row, 'hsCode', colMap)),
      hsChapter:         hsChapter(getField(row, 'hsCode', colMap)),
      description:       str(getField(row, 'description', colMap)),
      procedureCode:     normaliseProcCode(getField(row, 'procedureCode', colMap)),
      invoiceValue:      invoiceVal,
      invoiceEUR:        invoiceEURVal,
      customsValue:      centsAdj(toNum(getField(row, 'customsValue', colMap)), integerCentsRow),
      dutyAmount:        centsAdj(toNum(getField(row, 'dutyAmount', colMap) ?? getField(row, 'customsDuty', colMap) ?? getField(row, 'duty', colMap)), integerCentsRow),
      dutyRate:          toNum(getField(row, 'dutyRate', colMap) ?? getField(row, 'customsDutyRate', colMap)),
      vatAmount:         vatAmt,
      eustRate:          toNum(getField(row, 'eustRate', colMap)),
      totalDutiesVAT:    centsAdj(toNum(getField(row, 'totalDutiesVAT', colMap)), integerCentsRow),
      freight:           centsAdj(toNum(getField(row, 'freight', colMap) ?? getField(row, 'freightCost', colMap) ?? getField(row, 'euFreight', colMap) ?? getField(row, 'freightEUR', colMap) ?? getField(row, 'freightAmount', colMap)), integerCentsRow),
      weight:            weightVal,
      netWeight:         massAdj(toNum(getField(row, 'netWeight', colMap)), integerCentsRow),
      packageCount:      toNum(getField(row, 'packageCount', colMap) ?? getField(row, 'pieces', colMap)),
      exchangeRate:      toNum(getField(row, 'exchangeRate', colMap)),
    });
  }

  // ── Compute aggregations ──
  return {
    brokerId,
    totalRows:          records.length,
    kpis:               computeKPIs(records),
    monthly:            computeMonthly(records),
    countries:          computeCountries(records),
    hsChapters:         computeHSChapters(records),
    currencies:         computeCurrencies(records),
    incoterms:          computeIncoterms(records),
    procedureCodes:     computeProcedureCodes(records),
    dutyDistribution:   computeDutyDistribution(records),
    weightAnalysis:     computeWeightAnalysis(records),
    invoiceDistribution: computeInvoiceDistribution(records),
    dutyRateByCountry:   computeDutyRateByCountry(records),
  };
}

/* ───────────────────────────────────────────────
   Overall (Cross-Broker) Analytics Merge
   ─────────────────────────────────────────────── */

/**
 * Merge multiple per-broker analytics objects into a single unified analytics.
 * Each entry in `reports` has { brokerId, brokerLabel, analytics }.
 *
 * Strategy:
 * - KPIs: sum all totals, recompute averages and rates from combined totals
 * - Monthly: merge month buckets across brokers (additive)
 * - Countries: merge country buckets across brokers (additive)
 * - HS Chapters: merge chapter buckets (additive, combine description samples)
 * - Currencies, Incoterms, Procedure Codes: merge by key (additive)
 * - Distributions (duty, weight, invoice): sum bucket counts
 * - Duty Rate by Country: recompute from combined country totals
 * - Broker breakdown: new dataset showing per-broker declaration count + financials
 */
export function mergeAnalytics(reports) {
  if (!reports || reports.length === 0) return null;
  if (reports.length === 1) {
    // Single report — return as-is with broker breakdown
    const r = reports[0];
    const a = r.analytics;
    return {
      ...a,
      brokerId: 'OVERALL',
      brokerBreakdown: [{
        brokerId: r.brokerId,
        brokerLabel: r.brokerLabel,
        totalRows: a.totalRows,
        totalInvoice: a.kpis.totalInvoiceValue,
        totalDuty: a.kpis.totalDuty,
        totalVAT: a.kpis.totalVAT,
      }],
    };
  }

  // ── Merge KPIs ──
  let totalDeclarations = 0, totalInvoiceValue = 0, totalDuty = 0, totalVAT = 0;
  let totalFreight = 0, totalWeight = 0;
  let invoiceCount = 0, dutyCount = 0, freightCount = 0, weightCount = 0;
  const allCountries = new Set();
  const allHSChapters = new Set();
  const allMonths = new Set();

  for (const r of reports) {
    const k = r.analytics.kpis;
    totalDeclarations += k.totalDeclarations;
    totalInvoiceValue += k.totalInvoiceValue;
    totalDuty += k.totalDuty;
    totalVAT += k.totalVAT;
    totalFreight += k.totalFreight;
    totalWeight += k.totalWeight;
    // Sum counts for averages (approximate: use declaration count as proxy)
    if (k.totalInvoiceValue > 0) invoiceCount += k.totalDeclarations;
    if (k.totalDuty > 0) dutyCount += k.totalDeclarations;
    if (k.totalFreight > 0) freightCount += k.totalDeclarations;
    if (k.totalWeight > 0) weightCount += k.totalDeclarations;
    // Unique values
    r.analytics.countries.forEach(c => allCountries.add(c.code));
    r.analytics.hsChapters.forEach(h => allHSChapters.add(h.chapter));
    r.analytics.monthly.forEach(m => { if (m.key !== 'Unknown') allMonths.add(m.key); });
  }

  const kpis = {
    totalDeclarations,
    totalInvoiceValue,
    totalDuty,
    totalVAT,
    totalDutiesAndVAT: totalDuty + totalVAT,
    totalFreight,
    totalWeight,
    avgInvoiceValue: invoiceCount > 0 ? totalInvoiceValue / invoiceCount : 0,
    avgDuty: dutyCount > 0 ? totalDuty / dutyCount : 0,
    effectiveDutyRate: totalInvoiceValue > 0 ? (totalDuty / totalInvoiceValue * 100) : 0,
    effectiveVATRate: totalInvoiceValue > 0 ? (totalVAT / totalInvoiceValue * 100) : 0,
    uniqueCountries: allCountries.size,
    uniqueHSChapters: allHSChapters.size,
    monthsCovered: allMonths.size,
    avgWeightPerShipment: weightCount > 0 ? totalWeight / weightCount : 0,
    avgFreightPerShipment: freightCount > 0 ? totalFreight / freightCount : 0,
  };

  // ── Merge monthly data ──
  const monthMap = {};
  for (const r of reports) {
    for (const m of r.analytics.monthly) {
      if (!monthMap[m.key]) monthMap[m.key] = { key: m.key, label: m.label, count: 0, invoice: 0, duty: 0, vat: 0, freight: 0, weight: 0 };
      monthMap[m.key].count += m.count;
      monthMap[m.key].invoice += m.invoice;
      monthMap[m.key].duty += m.duty;
      monthMap[m.key].vat += m.vat;
      monthMap[m.key].freight += m.freight;
      monthMap[m.key].weight += m.weight;
    }
  }
  const monthly = Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key));

  // ── Merge countries ──
  const countryMap = {};
  for (const r of reports) {
    for (const c of r.analytics.countries) {
      if (!countryMap[c.code]) countryMap[c.code] = { code: c.code, count: 0, totalInvoice: 0, totalDuty: 0, totalVAT: 0 };
      countryMap[c.code].count += c.count;
      countryMap[c.code].totalInvoice += c.totalInvoice;
      countryMap[c.code].totalDuty += c.totalDuty;
      countryMap[c.code].totalVAT += c.totalVAT;
    }
  }
  const countries = Object.values(countryMap).sort((a, b) => b.count - a.count);

  // ── Merge HS Chapters ──
  const hsMap = {};
  for (const r of reports) {
    for (const h of r.analytics.hsChapters) {
      if (!hsMap[h.chapter]) hsMap[h.chapter] = { chapter: h.chapter, count: 0, totalInvoice: 0, totalDuty: 0, descriptions: [] };
      hsMap[h.chapter].count += h.count;
      hsMap[h.chapter].totalInvoice += h.totalInvoice;
      hsMap[h.chapter].totalDuty += h.totalDuty;
      // Merge description samples (keep max 3 unique)
      const descSet = new Set(hsMap[h.chapter].descriptions);
      for (const d of (h.descriptions || [])) {
        if (descSet.size < 3) descSet.add(d);
      }
      hsMap[h.chapter].descriptions = [...descSet];
    }
  }
  const hsChapters = Object.values(hsMap).sort((a, b) => b.count - a.count);

  // ── Merge simple key-count aggregations ──
  function mergeByCode(fieldName) {
    const map = {};
    for (const r of reports) {
      for (const item of r.analytics[fieldName]) {
        if (!map[item.code]) map[item.code] = { code: item.code, count: 0, totalInvoice: 0 };
        map[item.code].count += item.count;
        map[item.code].totalInvoice += (item.totalInvoice || 0);
      }
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }

  const currencies = mergeByCode('currencies');
  const incoterms = mergeByCode('incoterms');
  const procedureCodes = mergeByCode('procedureCodes');

  // ── Merge distribution buckets ──
  function mergeBuckets(fieldName) {
    // Use the first report's bucket structure as template
    const template = reports[0].analytics[fieldName];
    const merged = template.map(b => ({ ...b, count: 0 }));
    for (const r of reports) {
      const buckets = r.analytics[fieldName];
      for (let i = 0; i < merged.length && i < buckets.length; i++) {
        merged[i].count += buckets[i].count;
      }
    }
    return merged;
  }

  const dutyDistribution = mergeBuckets('dutyDistribution');
  const weightAnalysis = mergeBuckets('weightAnalysis');
  const invoiceDistribution = mergeBuckets('invoiceDistribution');

  // ── Recompute duty rate by country from merged country totals ──
  const dutyRateByCountry = countries
    .filter(c => c.count >= 2 && c.totalInvoice > 0)
    .map(c => ({
      code: c.code,
      count: c.count,
      totalInvoice: c.totalInvoice,
      totalDuty: c.totalDuty,
      effectiveRate: c.totalInvoice > 0 ? (c.totalDuty / c.totalInvoice * 100) : 0,
    }))
    .sort((a, b) => b.effectiveRate - a.effectiveRate)
    .slice(0, 15);

  // ── Broker breakdown (new for overall view) ──
  const brokerBreakdown = reports.map(r => ({
    brokerId: r.brokerId,
    brokerLabel: r.brokerLabel,
    totalRows: r.analytics.totalRows,
    totalInvoice: r.analytics.kpis.totalInvoiceValue,
    totalDuty: r.analytics.kpis.totalDuty,
    totalVAT: r.analytics.kpis.totalVAT,
    totalFreight: r.analytics.kpis.totalFreight,
    totalWeight: r.analytics.kpis.totalWeight,
  }));

  // ── Per-broker monthly data for stacked comparison chart ──
  const brokerMonthly = {};
  for (const r of reports) {
    brokerMonthly[r.brokerId] = {};
    for (const m of r.analytics.monthly) {
      brokerMonthly[r.brokerId][m.key] = m;
    }
  }

  return {
    brokerId: 'OVERALL',
    totalRows: totalDeclarations,
    kpis,
    monthly,
    countries,
    hsChapters,
    currencies,
    incoterms,
    procedureCodes,
    dutyDistribution,
    weightAnalysis,
    invoiceDistribution,
    dutyRateByCountry,
    brokerBreakdown,
    brokerMonthly,
  };
}

function str(v) {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

/**
 * Adjust a monetary value for integer-cents encoding.
 * When a DSV Luftfracht file stores amounts without decimal separators
 * (e.g. 69305 for 693.05), divide by 100 to get the real value.
 */
function centsAdj(v, isIntegerCents) {
  if (v == null || !isIntegerCents) return v;
  return v / 100;
}

/**
 * Adjust a mass value for integer encoding.
 * When stored with 6 implied decimal places (e.g. 210000000 for 210.000 kg).
 */
function massAdj(v, isIntegerCents) {
  if (v == null || !isIntegerCents) return v;
  return v / 1000000;
}

/* ───── KPIs ───── */

function computeKPIs(records) {
  const invoiceValues = records.map(r => r.invoiceValue ?? r.invoiceEUR).filter(v => v != null && v > 0);
  const dutyValues = records.map(r => r.dutyAmount).filter(v => v != null);
  const vatValues = records.map(r => r.vatAmount).filter(v => v != null);
  const freightValues = records.map(r => r.freight).filter(v => v != null && v > 0);
  const weightValues = records.map(r => r.weight).filter(v => v != null && v > 0);
  const totalDuty = dutyValues.reduce((s, v) => s + v, 0);
  const totalVAT = vatValues.reduce((s, v) => s + v, 0);
  const totalInvoice = invoiceValues.reduce((s, v) => s + v, 0);
  const totalFreight = freightValues.reduce((s, v) => s + v, 0);
  const totalWeight = weightValues.reduce((s, v) => s + v, 0);

  const uniqueCountries = new Set(records.map(r => r.countryOfOrigin || r.shipperCountry).filter(Boolean));
  const uniqueHS = new Set(records.map(r => r.hsChapter).filter(Boolean));
  const months = new Set(records.map(r => r.monthKey).filter(k => k !== 'Unknown'));

  return {
    totalDeclarations: records.length,
    totalInvoiceValue: totalInvoice,
    totalDuty,
    totalVAT,
    totalDutiesAndVAT: totalDuty + totalVAT,
    totalFreight,
    totalWeight,
    avgInvoiceValue: invoiceValues.length > 0 ? totalInvoice / invoiceValues.length : 0,
    avgDuty: dutyValues.length > 0 ? totalDuty / dutyValues.length : 0,
    effectiveDutyRate: totalInvoice > 0 ? (totalDuty / totalInvoice * 100) : 0,
    effectiveVATRate: totalInvoice > 0 ? (totalVAT / totalInvoice * 100) : 0,
    uniqueCountries: uniqueCountries.size,
    uniqueHSChapters: uniqueHS.size,
    monthsCovered: months.size,
    avgWeightPerShipment: weightValues.length > 0 ? totalWeight / weightValues.length : 0,
    avgFreightPerShipment: freightValues.length > 0 ? totalFreight / freightValues.length : 0,
  };
}

/* ───── Monthly Aggregation ───── */

function computeMonthly(records) {
  const byMonth = {};
  for (const r of records) {
    const k = r.monthKey;
    if (!byMonth[k]) byMonth[k] = { key: k, label: r.monthLabel, count: 0, invoice: 0, duty: 0, vat: 0, freight: 0, weight: 0 };
    byMonth[k].count++;
    if (r.invoiceValue != null && r.invoiceValue > 0) byMonth[k].invoice += r.invoiceValue;
    else if (r.invoiceEUR != null && r.invoiceEUR > 0) byMonth[k].invoice += r.invoiceEUR;
    if (r.dutyAmount != null) byMonth[k].duty += r.dutyAmount;
    if (r.vatAmount != null) byMonth[k].vat += r.vatAmount;
    if (r.freight != null) byMonth[k].freight += r.freight;
    if (r.weight != null) byMonth[k].weight += r.weight;
  }
  return Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key));
}

/* ───── Country Distribution ───── */

function computeCountries(records) {
  const byCountry = {};
  for (const r of records) {
    const c = r.countryOfOrigin || r.shipperCountry;
    if (!c) continue;
    if (!byCountry[c]) byCountry[c] = { code: c, count: 0, totalInvoice: 0, totalDuty: 0, totalVAT: 0 };
    byCountry[c].count++;
    if (r.invoiceValue != null && r.invoiceValue > 0) byCountry[c].totalInvoice += r.invoiceValue;
    else if (r.invoiceEUR != null && r.invoiceEUR > 0) byCountry[c].totalInvoice += r.invoiceEUR;
    if (r.dutyAmount != null) byCountry[c].totalDuty += r.dutyAmount;
    if (r.vatAmount != null) byCountry[c].totalVAT += r.vatAmount;
  }
  return Object.values(byCountry).sort((a, b) => b.count - a.count);
}

/* ───── HS Code Chapters ───── */

function computeHSChapters(records) {
  const byChapter = {};
  for (const r of records) {
    if (!r.hsChapter) continue;
    if (!byChapter[r.hsChapter]) byChapter[r.hsChapter] = { chapter: r.hsChapter, count: 0, totalInvoice: 0, totalDuty: 0, descriptions: new Set() };
    byChapter[r.hsChapter].count++;
    if (r.invoiceValue != null && r.invoiceValue > 0) byChapter[r.hsChapter].totalInvoice += r.invoiceValue;
    else if (r.invoiceEUR != null && r.invoiceEUR > 0) byChapter[r.hsChapter].totalInvoice += r.invoiceEUR;
    if (r.dutyAmount != null) byChapter[r.hsChapter].totalDuty += r.dutyAmount;
    if (r.description) {
      // Keep max 3 unique description samples
      if (byChapter[r.hsChapter].descriptions.size < 3) {
        byChapter[r.hsChapter].descriptions.add(r.description.substring(0, 80));
      }
    }
  }
  // Convert sets to arrays for serialization
  for (const ch of Object.values(byChapter)) {
    ch.descriptions = [...ch.descriptions];
  }
  return Object.values(byChapter).sort((a, b) => b.count - a.count);
}

/* ───── Currencies ───── */

function computeCurrencies(records) {
  const byCurrency = {};
  for (const r of records) {
    if (!r.currency) continue;
    if (!byCurrency[r.currency]) byCurrency[r.currency] = { code: r.currency, count: 0, totalInvoice: 0 };
    byCurrency[r.currency].count++;
    if (r.invoiceValue != null && r.invoiceValue > 0) byCurrency[r.currency].totalInvoice += r.invoiceValue;
    else if (r.invoiceEUR != null && r.invoiceEUR > 0) byCurrency[r.currency].totalInvoice += r.invoiceEUR;
  }
  return Object.values(byCurrency).sort((a, b) => b.count - a.count);
}

/* ───── Incoterms ───── */

function computeIncoterms(records) {
  const byInco = {};
  for (const r of records) {
    if (!r.incoterm) continue;
    if (!byInco[r.incoterm]) byInco[r.incoterm] = { code: r.incoterm, count: 0, totalInvoice: 0 };
    byInco[r.incoterm].count++;
    if (r.invoiceValue != null && r.invoiceValue > 0) byInco[r.incoterm].totalInvoice += r.invoiceValue;
    else if (r.invoiceEUR != null && r.invoiceEUR > 0) byInco[r.incoterm].totalInvoice += r.invoiceEUR;
  }
  return Object.values(byInco).sort((a, b) => b.count - a.count);
}

/* ───── Procedure Codes ───── */

function computeProcedureCodes(records) {
  const byProc = {};
  for (const r of records) {
    if (!r.procedureCode) continue;
    if (!byProc[r.procedureCode]) byProc[r.procedureCode] = { code: r.procedureCode, count: 0, totalInvoice: 0 };
    byProc[r.procedureCode].count++;
    if (r.invoiceValue != null && r.invoiceValue > 0) byProc[r.procedureCode].totalInvoice += r.invoiceValue;
    else if (r.invoiceEUR != null && r.invoiceEUR > 0) byProc[r.procedureCode].totalInvoice += r.invoiceEUR;
  }
  return Object.values(byProc).sort((a, b) => b.count - a.count);
}

/* ───── Duty Distribution ───── */

function computeDutyDistribution(records) {
  const ranges = [
    { label: 'Zero duty', min: 0, max: 0.001 },
    { label: '0.01 - 50 EUR', min: 0.001, max: 50 },
    { label: '50 - 200 EUR', min: 50, max: 200 },
    { label: '200 - 500 EUR', min: 200, max: 500 },
    { label: '500 - 1000 EUR', min: 500, max: 1000 },
    { label: '1000+ EUR', min: 1000, max: Infinity },
  ];
  const dist = ranges.map(r => ({ ...r, count: 0 }));
  for (const r of records) {
    const d = r.dutyAmount;
    if (d == null) continue;
    const abs = Math.abs(d);
    for (const bucket of dist) {
      if (abs >= bucket.min && abs < bucket.max) { bucket.count++; break; }
    }
  }
  return dist;
}

/* ───── Weight Analysis ───── */

function computeWeightAnalysis(records) {
  const ranges = [
    { label: '< 1 kg', min: 0, max: 1 },
    { label: '1 - 5 kg', min: 1, max: 5 },
    { label: '5 - 20 kg', min: 5, max: 20 },
    { label: '20 - 100 kg', min: 20, max: 100 },
    { label: '100 - 500 kg', min: 100, max: 500 },
    { label: '500+ kg', min: 500, max: Infinity },
  ];
  const dist = ranges.map(r => ({ ...r, count: 0 }));
  for (const r of records) {
    const w = r.weight;
    if (w == null || w <= 0) continue;
    for (const bucket of dist) {
      if (w >= bucket.min && w < bucket.max) { bucket.count++; break; }
    }
  }
  return dist;
}

/* ───── Invoice Value Distribution ───── */

function computeInvoiceDistribution(records) {
  const ranges = [
    { label: '< 50 EUR',       min: 0,      max: 50 },
    { label: '50 - 200 EUR',   min: 50,     max: 200 },
    { label: '200 - 500 EUR',  min: 200,    max: 500 },
    { label: '500 - 1K EUR',   min: 500,    max: 1000 },
    { label: '1K - 5K EUR',    min: 1000,   max: 5000 },
    { label: '5K - 20K EUR',   min: 5000,   max: 20000 },
    { label: '20K+ EUR',       min: 20000,  max: Infinity },
  ];
  const dist = ranges.map(r => ({ ...r, count: 0 }));
  for (const r of records) {
    const v = r.invoiceValue ?? r.invoiceEUR;
    if (v == null || v <= 0) continue;
    for (const bucket of dist) {
      if (v >= bucket.min && v < bucket.max) { bucket.count++; break; }
    }
  }
  return dist;
}

/* ───── Effective Duty Rate by Country ───── */

function computeDutyRateByCountry(records) {
  const byCountry = {};
  for (const r of records) {
    const c = r.countryOfOrigin || r.shipperCountry;
    if (!c) continue;
    const inv = r.invoiceValue ?? r.invoiceEUR;
    if (inv == null || inv <= 0) continue;
    if (!byCountry[c]) byCountry[c] = { code: c, totalInvoice: 0, totalDuty: 0, count: 0 };
    byCountry[c].totalInvoice += inv;
    if (r.dutyAmount != null) byCountry[c].totalDuty += r.dutyAmount;
    byCountry[c].count++;
  }
  return Object.values(byCountry)
    .filter(c => c.count >= 2)              // require at least 2 declarations for meaningful rate
    .map(c => ({
      code: c.code,
      count: c.count,
      totalInvoice: c.totalInvoice,
      totalDuty: c.totalDuty,
      effectiveRate: c.totalInvoice > 0 ? (c.totalDuty / c.totalInvoice * 100) : 0,
    }))
    .sort((a, b) => b.effectiveRate - a.effectiveRate)
    .slice(0, 15);
}

/* ───── Auto-detect for generic brokers ───── */

function autoDetectColumns(headers) {
  const hRow = (headers[0] || []).map(h => h != null ? String(h).trim().toLowerCase() : '');
  const map = {};

  // Try common patterns
  const patterns = {
    date: ['datum', 'date', 'anlagedatum'],
    invoiceValue: ['rechnungspreis', 'rechnungsbetrag', 'invoice', 'preis'],
    currency: ['waehrung', 'währung', 'wkz', 'currency'],
    hsCode: ['tarifnummer', 'zolltarifnummer', 'hs code', 'warentarifnummer'],
    countryOfOrigin: ['ursprungsland', 'ursprung', 'country of origin', 'herkunftsland'],
    shipperCountry: ['versendungsland', 'versender', 'shipper country'],
    description: ['warenbeschreibung', 'warenbezeichnung', 'description', 'beschreibung'],
    dutyAmount: ['zoll', 'abgabezoll', 'duty', 'customs duties'],
    vatAmount: ['eust', 'abgabeeust', 'vat', 'mwst'],
    weight: ['rohmasse', 'gewicht', 'weight', 'masse'],
    incoterm: ['lieferbedingung', 'liefercode', 'incoterm'],
  };

  for (const [field, keywords] of Object.entries(patterns)) {
    for (let i = 0; i < hRow.length; i++) {
      if (keywords.some(kw => hRow[i].includes(kw))) {
        map[field] = i;
        break;
      }
    }
  }

  return map;
}

/* ───────────────────────────────────────────────
   Chart Rendering (Chart.js)
   ─────────────────────────────────────────────── */

// Chart.js color palette — premium dark theme
const COLORS = {
  primary:   '#58a6ff',
  secondary: '#8b5cf6',
  success:   '#3fb950',
  warning:   '#d29922',
  danger:    '#f85149',
  info:      '#79c0ff',
  palette: [
    '#58a6ff', '#8b5cf6', '#3fb950', '#d29922', '#f85149',
    '#79c0ff', '#bc8cff', '#56d364', '#e3b341', '#ffa198',
    '#39d353', '#a371f7', '#2ea043', '#f0883e', '#ff7b72',
    '#6cb6ff', '#d2a8ff', '#7ee787', '#f8e3a1', '#ffc2b3',
  ],
};

// Shared defaults
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#8b949e',
        font: { family: "'Inter', sans-serif", size: 11 },
        padding: 12,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 20, 35, 0.95)',
      titleColor: '#e6edf3',
      bodyColor: '#8b949e',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
      bodyFont: { family: "'Inter', sans-serif", size: 11 },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255, 255, 255, 0.04)' },
      ticks: { color: '#8b949e', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(255, 255, 255, 0.04)' },
      ticks: { color: '#8b949e', font: { size: 10 } },
    },
  },
};

/** Store chart instances for cleanup */
const chartInstances = {};

function destroyCharts() {
  for (const [id, chart] of Object.entries(chartInstances)) {
    chart.destroy();
    delete chartInstances[id];
  }
}

function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  const chart = new Chart(canvas, config);
  chartInstances[canvasId] = chart;
  return chart;
}

/* ───────────────────────────────────────────────
   Render All Charts
   ─────────────────────────────────────────────── */

/**
 * Render all standard analytics charts.
 * @param {object} analytics — the analytics object from aggregateData or mergeAnalytics
 * @param {string} [prefix=''] — canvas ID prefix ('ov-' for overall view)
 */
export function renderCharts(analytics, prefix) {
  if (!analytics) return;
  const p = prefix || '';

  destroyCharts();

  renderMonthlyDeclarationsChart(analytics, p);
  renderMonthlyFinancialsChart(analytics, p);
  renderMonthlyInvoiceChart(analytics, p);
  renderCountryChart(analytics, p);
  renderHSChaptersChart(analytics, p);
  renderCurrencyChart(analytics, p);
  renderIncotermChart(analytics, p);
  renderDutyDistributionChart(analytics, p);
  renderInvoiceDistributionChart(analytics, p);
  renderWeightDistributionChart(analytics, p);
  renderMonthlyWeightFreightChart(analytics, p);
  renderProcedureCodeChart(analytics, p);
  renderDutyRateByCountryChart(analytics, p);

  // Broker comparison chart — only for overall views
  if (analytics.brokerBreakdown && analytics.brokerBreakdown.length > 1) {
    renderBrokerComparisonChart(analytics, p);
    renderBrokerMonthlyChart(analytics, p);
  }
}

function renderMonthlyDeclarationsChart(a, p) {
  const m = a.monthly;
  if (m.length === 0) return;
  createChart(p + 'chart-monthly-declarations', {
    type: 'bar',
    data: {
      labels: m.map(d => d.label || d.key),
      datasets: [{
        label: 'Declarations',
        data: m.map(d => d.count),
        backgroundColor: COLORS.primary + '80',
        borderColor: COLORS.primary,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: { display: false },
      },
    },
  });
}

function renderMonthlyFinancialsChart(a, p) {
  const m = a.monthly;
  if (m.length === 0) return;
  createChart(p + 'chart-monthly-financials', {
    type: 'line',
    data: {
      labels: m.map(d => d.label || d.key),
      datasets: [
        {
          label: 'Duty (EUR)',
          data: m.map(d => d.duty),
          borderColor: COLORS.warning,
          backgroundColor: COLORS.warning + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: 'VAT (EUR)',
          data: m.map(d => d.vat),
          borderColor: COLORS.secondary,
          backgroundColor: COLORS.secondary + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: { display: false },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0),
          },
        },
      },
    },
  });
}

function renderCountryChart(a, p) {
  const top = a.countries.slice(0, 10);
  if (top.length === 0) return;
  createChart(p + 'chart-countries', {
    type: 'doughnut',
    data: {
      labels: top.map(c => c.code),
      datasets: [{
        data: top.map(c => c.count),
        backgroundColor: COLORS.palette.slice(0, top.length),
        borderColor: '#0d1117',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          ...CHART_DEFAULTS.plugins.legend,
          position: 'right',
        },
      },
    },
  });
}

function renderHSChaptersChart(a, p) {
  const top = a.hsChapters.slice(0, 12);
  if (top.length === 0) return;
  createChart(p + 'chart-hs-chapters', {
    type: 'bar',
    data: {
      labels: top.map(h => 'Ch. ' + h.chapter),
      datasets: [{
        label: 'Declarations',
        data: top.map(h => h.count),
        backgroundColor: COLORS.palette.slice(0, top.length).map(c => c + '80'),
        borderColor: COLORS.palette.slice(0, top.length),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderCurrencyChart(a, p) {
  const cur = a.currencies;
  if (cur.length === 0) return;
  createChart(p + 'chart-currencies', {
    type: 'pie',
    data: {
      labels: cur.map(c => c.code),
      datasets: [{
        data: cur.map(c => c.count),
        backgroundColor: [COLORS.primary, COLORS.success, COLORS.warning, COLORS.secondary, COLORS.danger].slice(0, cur.length),
        borderColor: '#0d1117',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...CHART_DEFAULTS.plugins },
    },
  });
}

function renderIncotermChart(a, p) {
  const inco = a.incoterms;
  if (inco.length === 0) return;
  createChart(p + 'chart-incoterms', {
    type: 'bar',
    data: {
      labels: inco.map(i => i.code),
      datasets: [{
        label: 'Declarations',
        data: inco.map(i => i.count),
        backgroundColor: COLORS.success + '80',
        borderColor: COLORS.success,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderDutyDistributionChart(a, p) {
  const dist = a.dutyDistribution.filter(d => d.count > 0);
  if (dist.length === 0) return;
  createChart(p + 'chart-duty-dist', {
    type: 'bar',
    data: {
      labels: dist.map(d => d.label),
      datasets: [{
        label: 'Declarations',
        data: dist.map(d => d.count),
        backgroundColor: COLORS.warning + '80',
        borderColor: COLORS.warning,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderWeightDistributionChart(a, p) {
  const dist = a.weightAnalysis.filter(d => d.count > 0);
  if (dist.length === 0) return;
  createChart(p + 'chart-weight-dist', {
    type: 'doughnut',
    data: {
      labels: dist.map(d => d.label),
      datasets: [{
        data: dist.map(d => d.count),
        backgroundColor: [
          COLORS.info, COLORS.primary, COLORS.success,
          COLORS.warning, COLORS.secondary, COLORS.danger,
        ].slice(0, dist.length),
        borderColor: '#0d1117',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          ...CHART_DEFAULTS.plugins.legend,
          position: 'right',
        },
      },
    },
  });
}

function renderMonthlyWeightFreightChart(a, p) {
  const m = a.monthly;
  if (m.length === 0) return;
  const hasFreight = m.some(d => d.freight > 0);
  const hasWeight = m.some(d => d.weight > 0);
  if (!hasFreight && !hasWeight) return;

  const datasets = [];
  if (hasWeight) {
    datasets.push({
      label: 'Weight (kg)',
      data: m.map(d => d.weight),
      borderColor: COLORS.info,
      backgroundColor: COLORS.info + '20',
      fill: true,
      tension: 0.3,
      yAxisID: 'y',
    });
  }
  if (hasFreight) {
    datasets.push({
      label: 'Freight (EUR)',
      data: m.map(d => d.freight),
      borderColor: COLORS.success,
      backgroundColor: COLORS.success + '20',
      fill: true,
      tension: 0.3,
      yAxisID: hasWeight ? 'y1' : 'y',
    });
  }

  const scales = { x: CHART_DEFAULTS.scales.x };
  scales.y = { ...CHART_DEFAULTS.scales.y, position: 'left' };
  if (hasWeight && hasFreight) {
    scales.y1 = { ...CHART_DEFAULTS.scales.y, position: 'right', grid: { drawOnChartArea: false } };
  }

  createChart(p + 'chart-weight-freight', {
    type: 'line',
    data: { labels: m.map(d => d.label || d.key), datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins },
      scales,
    },
  });
}

function renderProcedureCodeChart(a, p) {
  const pc = a.procedureCodes;
  if (pc.length === 0) return;
  createChart(p + 'chart-procedures', {
    type: 'bar',
    data: {
      labels: pc.map(v => v.code),
      datasets: [{
        label: 'Declarations',
        data: pc.map(v => v.count),
        backgroundColor: COLORS.secondary + '80',
        borderColor: COLORS.secondary,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderMonthlyInvoiceChart(a, p) {
  const m = a.monthly;
  if (m.length === 0) return;
  const hasInvoice = m.some(d => d.invoice > 0);
  if (!hasInvoice) return;
  createChart(p + 'chart-monthly-invoice', {
    type: 'bar',
    data: {
      labels: m.map(d => d.label || d.key),
      datasets: [{
        label: 'Invoice Value (EUR)',
        data: m.map(d => d.invoice),
        backgroundColor: COLORS.success + '80',
        borderColor: COLORS.success,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: { display: false },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0),
          },
        },
      },
    },
  });
}

function renderInvoiceDistributionChart(a, p) {
  const dist = a.invoiceDistribution.filter(d => d.count > 0);
  if (dist.length === 0) return;
  createChart(p + 'chart-invoice-dist', {
    type: 'bar',
    data: {
      labels: dist.map(d => d.label),
      datasets: [{
        label: 'Declarations',
        data: dist.map(d => d.count),
        backgroundColor: COLORS.success + '80',
        borderColor: COLORS.success,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderDutyRateByCountryChart(a, p) {
  const data = a.dutyRateByCountry;
  if (data.length === 0) return;
  const top = data.slice(0, 12);
  createChart(p + 'chart-duty-rate-country', {
    type: 'bar',
    data: {
      labels: top.map(d => d.code),
      datasets: [{
        label: 'Effective Duty Rate (%)',
        data: top.map(d => d.effectiveRate),
        backgroundColor: COLORS.danger + '80',
        borderColor: COLORS.danger,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const d = top[ctx.dataIndex];
              return [
                `Rate: ${d.effectiveRate.toFixed(2)}%`,
                `Duty: ${d.totalDuty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
                `Invoice: ${d.totalInvoice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
                `Declarations: ${d.count}`,
              ];
            },
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: v => v.toFixed(1) + '%',
          },
        },
      },
    },
  });
}

/* ───────────────────────────────────────────────
   Broker Comparison Charts (Overall view only)
   ─────────────────────────────────────────────── */

function renderBrokerComparisonChart(a, p) {
  const breakdown = a.brokerBreakdown;
  if (!breakdown || breakdown.length < 2) return;

  const labels = breakdown.map(b => b.brokerLabel);
  createChart(p + 'chart-broker-comparison', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Declarations',
          data: breakdown.map(b => b.totalRows),
          backgroundColor: COLORS.primary + '80',
          borderColor: COLORS.primary,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Duty (EUR)',
          data: breakdown.map(b => b.totalDuty),
          backgroundColor: COLORS.warning + '80',
          borderColor: COLORS.warning,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y1',
        },
        {
          label: 'VAT (EUR)',
          data: breakdown.map(b => b.totalVAT),
          backgroundColor: COLORS.secondary + '80',
          borderColor: COLORS.secondary,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins },
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y: {
          ...CHART_DEFAULTS.scales.y,
          position: 'left',
          title: { display: true, text: 'Declarations', color: '#8b949e' },
        },
        y1: {
          ...CHART_DEFAULTS.scales.y,
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'EUR', color: '#8b949e' },
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0),
          },
        },
      },
    },
  });
}

function renderBrokerMonthlyChart(a, p) {
  if (!a.brokerMonthly || !a.brokerBreakdown || a.brokerBreakdown.length < 2) return;
  // Stacked bar chart: monthly declarations per broker
  const allMonths = a.monthly.map(m => m.key).sort();
  const labels = a.monthly.sort((x, y) => x.key.localeCompare(y.key)).map(m => m.label || m.key);

  const datasets = a.brokerBreakdown.map((b, i) => ({
    label: b.brokerLabel,
    data: allMonths.map(mk => {
      const m = (a.brokerMonthly[b.brokerId] || {})[mk];
      return m ? m.count : 0;
    }),
    backgroundColor: COLORS.palette[i % COLORS.palette.length] + '80',
    borderColor: COLORS.palette[i % COLORS.palette.length],
    borderWidth: 1,
    borderRadius: 4,
  }));

  createChart(p + 'chart-broker-monthly', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          mode: 'index',
          intersect: false,
        },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, stacked: true },
        y: { ...CHART_DEFAULTS.scales.y, stacked: true },
      },
    },
  });
}

/* ───────────────────────────────────────────────
   Broker Breakdown Table HTML Generator
   ─────────────────────────────────────────────── */

export function renderBrokerBreakdownTable(breakdown) {
  if (!breakdown || breakdown.length === 0) return '<p class="no-data">No broker data available</p>';

  const fmtEUR = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalRows = breakdown.reduce((s, b) => s + b.totalRows, 0);

  const rows = breakdown.map((b, i) => {
    const share = totalRows > 0 ? (b.totalRows / totalRows * 100).toFixed(1) : '0.0';
    return `
      <tr>
        <td class="rank">${i + 1}</td>
        <td><span class="country-badge">${b.brokerLabel}</span></td>
        <td class="mono">${b.totalRows.toLocaleString()}</td>
        <td class="mono">${share}%</td>
        <td class="mono">${fmtEUR(b.totalInvoice)}</td>
        <td class="mono">${fmtEUR(b.totalDuty)}</td>
        <td class="mono">${fmtEUR(b.totalVAT)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="analytics-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Broker</th>
          <th>Declarations</th>
          <th>Share</th>
          <th>Invoice Value (EUR)</th>
          <th>Duty (EUR)</th>
          <th>VAT (EUR)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ───────────────────────────────────────────────
   KPI Cards HTML Generator
   ─────────────────────────────────────────────── */

export function renderKPICards(kpis) {
  const fmt = (v) => {
    if (v == null || isNaN(v)) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(v % 1 === 0 ? 0 : 2);
  };
  const fmtEUR = (v) => fmt(v) + ' EUR';

  return `
    <div class="analytics-kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${kpis.totalDeclarations.toLocaleString()}</div>
        <div class="kpi-label">Total Declarations</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${fmtEUR(kpis.totalInvoiceValue)}</div>
        <div class="kpi-label">Total Invoice Value</div>
      </div>
      <div class="kpi-card accent">
        <div class="kpi-value">${fmtEUR(kpis.totalDuty)}</div>
        <div class="kpi-label">Total Customs Duty</div>
      </div>
      <div class="kpi-card accent">
        <div class="kpi-value">${fmtEUR(kpis.totalVAT)}</div>
        <div class="kpi-label">Total Import VAT</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${kpis.effectiveDutyRate.toFixed(2)}%</div>
        <div class="kpi-label">Effective Duty Rate</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${fmtEUR(kpis.totalFreight)}</div>
        <div class="kpi-label">Total Freight</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${fmt(kpis.totalWeight)} kg</div>
        <div class="kpi-label">Total Weight</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${kpis.uniqueCountries}</div>
        <div class="kpi-label">Countries of Origin</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${kpis.uniqueHSChapters}</div>
        <div class="kpi-label">HS Chapters</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${kpis.monthsCovered}</div>
        <div class="kpi-label">Months Covered</div>
      </div>
    </div>
  `;
}

/* ───────────────────────────────────────────────
   Country Table HTML Generator
   ─────────────────────────────────────────────── */

export function renderCountryTable(countries) {
  if (countries.length === 0) return '<p class="no-data">No country data available</p>';

  const fmtEUR = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const top = countries.slice(0, 15);

  const rows = top.map((c, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="country-code"><span class="country-badge">${c.code}</span></td>
      <td class="mono">${c.count.toLocaleString()}</td>
      <td class="mono">${fmtEUR(c.totalInvoice)}</td>
      <td class="mono">${fmtEUR(c.totalDuty)}</td>
      <td class="mono">${fmtEUR(c.totalVAT)}</td>
    </tr>
  `).join('');

  return `
    <table class="analytics-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Country</th>
          <th>Declarations</th>
          <th>Invoice Value (EUR)</th>
          <th>Duty (EUR)</th>
          <th>VAT (EUR)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ───────────────────────────────────────────────
   HS Chapters Table
   ─────────────────────────────────────────────── */

export function renderHSTable(hsChapters) {
  if (hsChapters.length === 0) return '<p class="no-data">No HS code data available</p>';

  const fmtEUR = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const top = hsChapters.slice(0, 15);

  const rows = top.map((h, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="mono">Ch. ${h.chapter}</td>
      <td class="mono">${h.count.toLocaleString()}</td>
      <td class="mono">${fmtEUR(h.totalInvoice)}</td>
      <td class="mono">${fmtEUR(h.totalDuty)}</td>
      <td class="desc-cell" title="${(h.descriptions || []).join(' | ')}">${(h.descriptions || [])[0] || ''}</td>
    </tr>
  `).join('');

  return `
    <table class="analytics-table">
      <thead>
        <tr>
          <th>#</th>
          <th>HS Chapter</th>
          <th>Declarations</th>
          <th>Invoice Value</th>
          <th>Duty</th>
          <th>Sample Description</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ───────────────────────────────────────────────
   Chart Info Descriptions
   ─────────────────────────────────────────────── */

/**
 * Descriptive information for each chart/table/KPI section.
 * Used by the info icon modal to explain what each visualization shows,
 * how the data was obtained, and what to look for.
 */
export const CHART_INFO = {
  'kpis': {
    title: 'Key Performance Indicators',
    sections: [
      {
        heading: 'What it shows',
        text: 'Summary metrics computed from all declarations in the consolidated report. Provides a high-level overview of import activity, financial exposure, and geographic diversity.',
      },
      {
        heading: 'How it is calculated',
        list: [
          'Total Declarations — number of data rows in the merged report (one row = one customs declaration line item).',
          'Total Invoice Value — sum of all invoice amounts. For rows with foreign currency, the original invoice value is used (not converted to EUR).',
          'Total Customs Duty — sum of all duty amounts assessed by customs authorities.',
          'Total Import VAT (EUSt) — sum of all import VAT amounts. For brokers without a direct VAT column, it is computed as EUSt assessment basis × VAT rate.',
          'Effective Duty Rate — total duty ÷ total invoice value × 100. Shows the average customs duty burden as a percentage of goods value.',
          'Total Freight — sum of all freight/transport cost values where available.',
          'Total Weight — sum of gross weight values (kg) across all shipments.',
          'Countries of Origin — count of distinct origin countries appearing in the data.',
          'HS Chapters — count of distinct 2-digit HS chapters (product categories).',
          'Months Covered — number of distinct calendar months represented.',
        ],
      },
      {
        heading: 'Data source',
        text: 'Extracted from broker-specific columns in the consolidated report. Column mapping varies by broker (index-based for DHL/FedEx/UPS, header-name-based for DSV). Values with European number formats (comma decimal) are automatically converted.',
      },
    ],
  },
  'monthly-declarations': {
    title: 'Monthly Declarations',
    sections: [
      {
        heading: 'What it shows',
        text: 'Number of customs declarations per calendar month, displayed as a bar chart. Each bar represents one month and its height corresponds to the total number of declaration line items processed in that period.',
      },
      {
        heading: 'How it is calculated',
        text: 'Each row in the consolidated report has a date field (declaration date or entry date). The date is parsed and grouped by year-month. Rows without a parseable date are grouped under "N/A".',
      },
      {
        heading: 'What to look for',
        list: [
          'Seasonal patterns — months with spikes may indicate bulk purchasing or project-based imports.',
          'Missing months — gaps may indicate missing source files or reporting delays.',
          'Growth trends — consistent increase may signal expanding import activity.',
        ],
      },
    ],
  },
  'monthly-financials': {
    title: 'Monthly Duty & VAT',
    sections: [
      {
        heading: 'What it shows',
        text: 'Two overlapping area lines showing the monthly total of customs duty (yellow) and import VAT/EUSt (purple). The y-axis is in EUR with "k" suffix for thousands.',
      },
      {
        heading: 'How it is calculated',
        list: [
          'Duty — sum of all duty amounts per month. Source column depends on broker: DHL uses col 123 (duty amount), FedEx col 91 (ZOLL), UPS col 32 (Zoll Betrag in Euro), DSV uses AbgabeZoll or equivalent.',
          'VAT — sum of all VAT/EUSt amounts per month. For FedEx, where no direct VAT amount column exists, it is computed as EUSt basis × VAT rate (default 19%).',
        ],
      },
      {
        heading: 'What to look for',
        list: [
          'VAT typically dominates duty because the standard import VAT rate (19%) applies to goods value + duty, while duty rates vary (often 0–5%).',
          'Months with disproportionately high duty may indicate tariff reclassifications or imports from non-preferential countries.',
        ],
      },
    ],
  },
  'countries': {
    title: 'Country of Origin',
    sections: [
      {
        heading: 'What it shows',
        text: 'Doughnut chart showing the top 10 countries of origin by number of declarations. Each segment represents one country with its ISO 3166-1 alpha-2 code.',
      },
      {
        heading: 'How it is calculated',
        text: 'The country of origin field is extracted per row. If only a shipper country is available, it is used as fallback. German country names (e.g. "Mexiko", "Tschechien") are automatically converted to 2-letter ISO codes. The top 10 countries by declaration count are shown.',
      },
      {
        heading: 'What to look for',
        list: [
          'Supply chain concentration — heavy reliance on one country may indicate risk.',
          'EU vs non-EU split — EU-origin goods typically have zero or reduced duty under preferential trade agreements.',
        ],
      },
    ],
  },
  'hs-chapters': {
    title: 'Top HS Code Chapters',
    sections: [
      {
        heading: 'What it shows',
        text: 'Horizontal bar chart showing the most frequently imported HS code chapters. HS chapters are the first 2 digits of the Harmonized System tariff code, representing broad product categories.',
      },
      {
        heading: 'How it is calculated',
        text: 'The HS code from each declaration row is truncated to its first 2 digits. Rows are grouped and counted by chapter. Up to 12 chapters are shown, sorted by frequency.',
      },
      {
        heading: 'Common chapters',
        list: [
          'Ch. 85 — Electrical machinery, equipment, and parts (lamps, LED, circuit boards).',
          'Ch. 84 — Machinery, mechanical appliances, and parts.',
          'Ch. 90 — Optical, measuring, and precision instruments.',
          'Ch. 39 — Plastics and articles thereof.',
          'Ch. 73 — Articles of iron or steel.',
        ],
      },
    ],
  },
  'currencies': {
    title: 'Invoice Currencies',
    sections: [
      {
        heading: 'What it shows',
        text: 'Pie chart showing the distribution of invoice currencies used across all declarations. Each segment represents one currency code (EUR, USD, CNY, etc.).',
      },
      {
        heading: 'How it is calculated',
        text: 'The currency field is extracted from each row and grouped by 3-letter ISO currency code. Segments show the count of declarations per currency. Invalid or missing currency values are excluded.',
      },
      {
        heading: 'What to look for',
        list: [
          'EUR dominance indicates direct European suppliers or EUR-denominated contracts.',
          'USD, CNY, JPY segments indicate significant non-EU sourcing that may carry exchange rate risk.',
        ],
      },
    ],
  },
  'incoterms': {
    title: 'Incoterm Distribution',
    sections: [
      {
        heading: 'What it shows',
        text: 'Bar chart showing how many declarations use each Incoterm (International Commercial Terms). Incoterms define who is responsible for shipping costs, insurance, and risk.',
      },
      {
        heading: 'How it is calculated',
        text: 'The Incoterm field is extracted from each row. Values longer than 5 characters are filtered out (likely data errors). Bars are sorted by frequency.',
      },
      {
        heading: 'Common incoterms',
        list: [
          'EXW (Ex Works) — buyer bears all shipping costs and risks from seller\'s premises.',
          'DAP (Delivered at Place) — seller delivers goods to a named destination.',
          'FCA (Free Carrier) — seller delivers to carrier at named place.',
          'FOB (Free on Board) — seller delivers goods on board the vessel.',
          'DDP (Delivered Duty Paid) — seller bears all costs including import duties.',
        ],
      },
    ],
  },
  'duty-dist': {
    title: 'Duty Amount Distribution',
    sections: [
      {
        heading: 'What it shows',
        text: 'Bar chart showing how many declarations fall into each duty amount range (in EUR). Helps visualize whether most shipments carry negligible duty or substantial charges.',
      },
      {
        heading: 'How it is calculated',
        text: 'The absolute duty amount per declaration is placed into one of six brackets: zero duty, 0.01–50, 50–200, 200–500, 500–1000, or 1000+ EUR. Each bar shows the count of declarations in that range.',
      },
      {
        heading: 'What to look for',
        list: [
          'A large "zero duty" bar may indicate preferential trade agreements (FTA) or duty-exempt goods.',
          'Many declarations in the 1000+ EUR range may warrant tariff classification review to identify savings.',
        ],
      },
    ],
  },
  'weight-dist': {
    title: 'Weight Distribution',
    sections: [
      {
        heading: 'What it shows',
        text: 'Doughnut chart showing how many declarations fall into each weight range (in kg). Visualizes the physical scale of imported goods.',
      },
      {
        heading: 'How it is calculated',
        text: 'Gross weight per declaration is placed into brackets: <1 kg, 1–5, 5–20, 20–100, 100–500, or 500+ kg. Weight values above 500,000 kg (500 tonnes) are excluded as likely data errors. For files with integer-encoded weights (DSV Luftfracht), values are automatically divided by 1,000,000.',
      },
      {
        heading: 'What to look for',
        list: [
          'Predominantly small weights (<5 kg) indicate express/parcel shipments.',
          'Larger weights (100+ kg) indicate bulk/freight shipments with different cost structures.',
        ],
      },
    ],
  },
  'procedures': {
    title: 'Procedure Codes',
    sections: [
      {
        heading: 'What it shows',
        text: 'Bar chart showing the customs procedure codes used across all declarations. The procedure code determines the customs treatment applied to the goods.',
      },
      {
        heading: 'How it is calculated',
        text: 'The procedure code field is extracted per row. For DSV, codes may include descriptions (e.g. "4000 — Gleichzeitige...") — only the 4-digit code prefix is used. Not all brokers provide procedure codes.',
      },
      {
        heading: 'Common codes',
        list: [
          '4000 — Free circulation with simultaneous re-dispatch (standard permanent import).',
          '4010 — Free circulation of goods under inward processing (toll manufacturing return).',
          '5300 — Temporary admission with partial relief from import duty.',
        ],
      },
    ],
  },
  'weight-freight': {
    title: 'Monthly Weight & Freight',
    sections: [
      {
        heading: 'What it shows',
        text: 'Dual-axis line chart tracking monthly total weight (kg, left axis) and total freight cost (EUR, right axis). Both lines share the same time axis for correlation analysis.',
      },
      {
        heading: 'How it is calculated',
        list: [
          'Weight — sum of gross weight values per month.',
          'Freight — sum of freight cost/transport charges per month. Source varies: DHL col 33, FedEx col 86 (FRACHTKOSTEN), UPS col 47 (anteilige Frachtkosten bis EU-Grenze) or col 20 (Frachtbetrag in Euro), DSV uses DV1Frachtkosten.',
        ],
      },
      {
        heading: 'What to look for',
        list: [
          'Correlation between weight and freight — should generally move in the same direction.',
          'Divergence may indicate rate changes, modal shifts (air vs sea), or consolidation gains.',
          'This chart may be empty if freight data is not available for the selected broker.',
        ],
      },
    ],
  },
  'country-table': {
    title: 'Country Breakdown Table',
    sections: [
      {
        heading: 'What it shows',
        text: 'Detailed table of the top 15 countries of origin, showing declaration count, total invoice value, customs duty, and import VAT for each country.',
      },
      {
        heading: 'How it is calculated',
        text: 'Same data source as the Country of Origin chart, expanded with financial aggregations. Invoice values are summed per country (using invoice value or EUR-converted amount as available). Duty and VAT amounts are summed similarly.',
      },
      {
        heading: 'What to look for',
        list: [
          'High invoice value with low duty may indicate FTA utilization or zero-duty tariff lines.',
          'Countries with high duty-to-invoice ratios may benefit from tariff engineering or supplier diversification.',
        ],
      },
    ],
  },
  'hs-table': {
    title: 'HS Code Analysis Table',
    sections: [
      {
        heading: 'What it shows',
        text: 'Detailed table of the top 15 HS code chapters, showing declaration count, total invoice value, total duty, and a sample goods description for each chapter.',
      },
      {
        heading: 'How it is calculated',
        text: 'Same data source as the HS Chapters chart. The first 2 digits of each HS code determine the chapter. Invoice values and duty amounts are summed per chapter. Up to 3 sample descriptions are collected per chapter (first one shown).',
      },
      {
        heading: 'What to look for',
        list: [
          'High-duty chapters may benefit from tariff classification review.',
          'Sample descriptions help verify that HS codes are correctly assigned to the right product categories.',
        ],
      },
    ],
  },
  'monthly-invoice': {
    title: 'Monthly Invoice Value',
    sections: [
      {
        heading: 'What it shows',
        text: 'Bar chart showing the total invoice value (goods value) per calendar month in EUR. This is the primary financial indicator of import volume, representing the total declared value of goods before customs duties and taxes.',
      },
      {
        heading: 'How it is calculated',
        text: 'For each declaration, the invoice value (or EUR-converted invoice value if available) is summed per month. Rows without a positive invoice value are excluded. The y-axis uses "k" notation for thousands.',
      },
      {
        heading: 'What to look for',
        list: [
          'Seasonal spending patterns — peaks may correlate with production schedules or seasonal demand.',
          'Budget tracking — compare monthly totals against procurement budgets.',
          'Growth trends — increasing values may indicate expanding operations or price inflation.',
          'Compare with the Monthly Duty & VAT chart to see how tax burden correlates with goods value.',
        ],
      },
    ],
  },
  'invoice-dist': {
    title: 'Invoice Value Distribution',
    sections: [
      {
        heading: 'What it shows',
        text: 'Bar chart showing how many individual declarations fall into each invoice value range (in EUR). Visualizes the scale and frequency distribution of shipment values.',
      },
      {
        heading: 'How it is calculated',
        text: 'The invoice value per declaration is placed into one of seven brackets: under 50, 50-200, 200-500, 500-1K, 1K-5K, 5K-20K, or 20K+ EUR. Each bar shows the count of declarations in that range.',
      },
      {
        heading: 'What to look for',
        list: [
          'Many low-value shipments may indicate express/sample traffic — consider consolidation to reduce per-shipment fees.',
          'A few very high-value shipments dominating total spend — these warrant closer duty optimization attention.',
          'Customs de minimis thresholds — shipments below certain values may qualify for simplified procedures.',
        ],
      },
    ],
  },
  'duty-rate-country': {
    title: 'Effective Duty Rate by Country',
    sections: [
      {
        heading: 'What it shows',
        text: 'Bar chart showing the effective customs duty rate for each country of origin, calculated as total duty paid divided by total invoice value. Countries are sorted from highest to lowest rate.',
      },
      {
        heading: 'How it is calculated',
        list: [
          'For each country, all invoice values and duty amounts are summed.',
          'Effective rate = total duty / total invoice value * 100%.',
          'Only countries with at least 2 declarations are included to avoid statistical noise.',
          'Up to 12 countries are shown, sorted by rate (highest first).',
        ],
      },
      {
        heading: 'What to look for',
        list: [
          'Countries with 0% effective rate — goods from these origins may benefit from Free Trade Agreements (FTA) or preferential tariffs.',
          'Countries with high rates (>5%) — may indicate non-preferential origins or product categories with significant tariffs.',
          'Hover over bars to see exact duty amounts, invoice values, and declaration counts per country.',
          'Compare with the Country Breakdown table for a complete picture of each origin.',
        ],
      },
    ],
  },
  'broker-comparison': {
    title: 'Broker Comparison',
    sections: [
      {
        heading: 'What it shows',
        text: 'Multi-axis bar chart comparing all processed brokers side by side. The left axis shows the number of declarations per broker, while the right axis shows financial totals (duty and VAT in EUR). Available only in the Overall Analytics view when reports from two or more brokers have been processed.',
      },
      {
        heading: 'How it is calculated',
        text: 'Each broker\'s analytics report is stored after processing. The comparison chart shows the total declarations, total customs duty, and total import VAT for each broker. Values are exact sums from each broker\'s consolidated report — no estimation or interpolation is applied.',
      },
      {
        heading: 'What to look for',
        list: [
          'Volume distribution — which brokers handle the most declarations.',
          'Cost distribution — which brokers process higher-value or higher-duty shipments.',
          'Duty/VAT ratios — differences may indicate varying product mixes or origin countries per broker.',
        ],
      },
    ],
  },
  'broker-monthly': {
    title: 'Monthly Declarations by Broker',
    sections: [
      {
        heading: 'What it shows',
        text: 'Stacked bar chart showing monthly declaration counts broken down by broker. Each color segment represents one broker\'s contribution to the total monthly volume.',
      },
      {
        heading: 'How it is calculated',
        text: 'Monthly declaration counts from each broker\'s report are stacked for every calendar month. Months are sorted chronologically. If a broker has no data for a given month, its segment is zero.',
      },
      {
        heading: 'What to look for',
        list: [
          'Broker activity patterns — some brokers may only be active in certain months.',
          'Volume shifts — changes in broker usage over time may indicate service changes.',
          'Total monthly volume — the bar height shows combined activity across all brokers.',
        ],
      },
    ],
  },
  'broker-table': {
    title: 'Broker Breakdown Table',
    sections: [
      {
        heading: 'What it shows',
        text: 'Detailed table comparing all processed brokers with their declaration counts, share percentage, total invoice values, customs duty, and import VAT.',
      },
      {
        heading: 'How it is calculated',
        text: 'Each row shows one broker\'s totals from its analytics report. The share column shows what percentage of total declarations each broker handles. All financial values are in EUR.',
      },
      {
        heading: 'What to look for',
        list: [
          'Market share — the share column shows each broker\'s proportion of total import activity.',
          'Cost efficiency — compare duty and VAT amounts relative to invoice values across brokers.',
          'Concentration risk — heavy reliance on a single broker may indicate supply chain risk.',
        ],
      },
    ],
  },
};
