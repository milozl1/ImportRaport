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
    let invoiceVal = toNum(getField(row, 'invoiceValue', colMap));
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
      freight:           centsAdj(toNum(getField(row, 'freight', colMap) ?? getField(row, 'freightCost', colMap) ?? getField(row, 'freightAmount', colMap) ?? getField(row, 'freightEUR', colMap) ?? getField(row, 'euFreight', colMap)), integerCentsRow),
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

export function renderCharts(analytics) {
  if (!analytics) return;

  destroyCharts();

  renderMonthlyDeclarationsChart(analytics);
  renderMonthlyFinancialsChart(analytics);
  renderCountryChart(analytics);
  renderHSChaptersChart(analytics);
  renderCurrencyChart(analytics);
  renderIncotermChart(analytics);
  renderDutyDistributionChart(analytics);
  renderWeightDistributionChart(analytics);
  renderMonthlyWeightFreightChart(analytics);
  renderProcedureCodeChart(analytics);
}

function renderMonthlyDeclarationsChart(a) {
  const m = a.monthly;
  if (m.length === 0) return;
  createChart('chart-monthly-declarations', {
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

function renderMonthlyFinancialsChart(a) {
  const m = a.monthly;
  if (m.length === 0) return;
  createChart('chart-monthly-financials', {
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

function renderCountryChart(a) {
  const top = a.countries.slice(0, 10);
  if (top.length === 0) return;
  createChart('chart-countries', {
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

function renderHSChaptersChart(a) {
  const top = a.hsChapters.slice(0, 12);
  if (top.length === 0) return;
  createChart('chart-hs-chapters', {
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

function renderCurrencyChart(a) {
  const cur = a.currencies;
  if (cur.length === 0) return;
  createChart('chart-currencies', {
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

function renderIncotermChart(a) {
  const inco = a.incoterms;
  if (inco.length === 0) return;
  createChart('chart-incoterms', {
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

function renderDutyDistributionChart(a) {
  const dist = a.dutyDistribution.filter(d => d.count > 0);
  if (dist.length === 0) return;
  createChart('chart-duty-dist', {
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

function renderWeightDistributionChart(a) {
  const dist = a.weightAnalysis.filter(d => d.count > 0);
  if (dist.length === 0) return;
  createChart('chart-weight-dist', {
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

function renderMonthlyWeightFreightChart(a) {
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

  createChart('chart-weight-freight', {
    type: 'line',
    data: { labels: m.map(d => d.label || d.key), datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins },
      scales,
    },
  });
}

function renderProcedureCodeChart(a) {
  const pc = a.procedureCodes;
  if (pc.length === 0) return;
  createChart('chart-procedures', {
    type: 'bar',
    data: {
      labels: pc.map(p => p.code),
      datasets: [{
        label: 'Declarations',
        data: pc.map(p => p.count),
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
