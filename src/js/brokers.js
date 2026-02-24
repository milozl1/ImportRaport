/**
 * Broker configuration — brand identity + parsing rules
 */

export const BROKERS = [
  {
    id: 'DHL',
    label: 'DHL Express',
    headerRows: 2,
    headerStartRow: 0,
    dataStartRow: 2,
    color: '#FFCC00',
    textColor: '#CC0000',
    accent: '#D40511',
    logoIcon: `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="40" rx="6" fill="#FFCC00"/>
      <path d="M10 13h14l-3 4H7l3-4zm0 14h14l3-4H13l-3 4zm17-14h14l-10 14H17l10-14zm17 0h18l-3 4H47l3-4zm-3 14h18l3-4H44l-3 4zm6-10h14l-7 10H47l7-10zm20-4h18l-3 4H70l3-4zm-3 14h18l3-4H70l-3 4zm6-10h17v10H76l7-10z" fill="#D40511"/>
    </svg>`,
    capabilities: [
      { text: 'Repairs column shifts in address zones and delivery location overflow' },
      { text: 'Reconstructs fragmented goods descriptions spanning multiple columns' },
      { text: 'Corrects delivery location overflow that displaces freight data' },
      { text: 'Converts European number formats to standard decimal notation' },
      { text: 'Validates HS codes and country codes for customs compliance' },
      { text: 'Processes complex layout with dual-header structure' },
    ],
    isFooterRow: (row) => {
      if (!row || row.length < 3) return true;
      const nonEmpty = row.filter(c => c != null && c !== '');
      return nonEmpty.length < 3;
    },
  },
  {
    id: 'FEDEX',
    label: 'FedEx',
    headerRows: 1,
    headerStartRow: 13,
    dataStartRow: 14,
    color: '#4D148C',
    textColor: '#FF6600',
    accent: '#FF6600',
    logoIcon: `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="40" rx="6" fill="#4D148C"/>
      <text x="12" y="27" font-family="Arial Black,sans-serif" font-size="18" font-weight="900" fill="#FFFFFF">Fed</text>
      <text x="55" y="27" font-family="Arial Black,sans-serif" font-size="18" font-weight="900" fill="#FF6600">Ex</text>
    </svg>`,
    capabilities: [
      { text: 'Removes trailing whitespace and newlines from text fields' },
      { text: 'Converts European number formats to standard decimal notation' },
      { text: 'Transforms text-formatted numbers to proper numeric values' },
      { text: 'Validates HS codes and country codes for accuracy' },
    ],
    isFooterRow: (row) => {
      if (!row || row.length < 3) return true;
      const nonEmpty = row.filter(c => c != null && c !== '');
      return nonEmpty.length < 3;
    },
  },
  {
    id: 'KN',
    label: 'Kuehne + Nagel',
    headerRows: 1,
    headerStartRow: 0,
    dataStartRow: 1,
    color: '#003A70',
    textColor: '#FFFFFF',
    accent: '#0075BE',
    logoIcon: `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="40" rx="6" fill="#003A70"/>
      <text x="10" y="27" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">Kuehne+Nagel</text>
    </svg>`,
    capabilities: [
      { text: 'Corrects malformed numbers with leading commas or dots' },
      { text: 'Performs basic file merge and consolidation operations' },
    ],
    isFooterRow: (row) => {
      if (!row || row.length < 2) return true;
      const nonEmpty = row.filter(c => c != null && c !== '');
      return nonEmpty.length < 2;
    },
  },
  {
    id: 'DSV',
    label: 'DSV',
    headerRows: 1,
    headerStartRow: 0,
    dataStartRow: 1,
    csvDelimiter: ';',
    color: '#002B5C',
    textColor: '#FFFFFF',
    accent: '#0077C8',
    logoIcon: `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="40" rx="6" fill="#002B5C"/>
      <text x="28" y="28" font-family="Arial Black,sans-serif" font-size="22" font-weight="900" fill="#FFFFFF">DSV</text>
    </svg>`,
    capabilities: [
      { text: 'Converts European number formats to standard decimal notation' },
      { text: 'Transforms text-formatted numbers to proper numeric values' },
      { text: 'Converts Excel serial dates to readable DD.MM.YYYY format' },
      { text: 'Converts Excel serial times and datetimes to HH:MM format' },
      { text: 'Aligns different column layouts across reporting periods' },
      { text: 'Supports CSV and XLSX files with intelligent sheet selection' },
    ],
    /**
     * DSV Luftfracht XLSX files can contain multiple sheets.
     * The real data is on the largest "Importzollanmeldungen…" or
     * "Hella …" sheet, not the template/metadata sheets.
     * English-format Luftfracht files use "Import Report Template".
     */
    sheetSelector: (sheetNames, fileName) => {
      if (!fileName || !fileName.toLowerCase().includes('luft')) return sheetNames[0];
      // Prefer sheets with actual customs data
      const dataSheet = sheetNames.find(n =>
        /^(importzoll|hella|import report)/i.test(n)
      );
      return dataSheet || sheetNames[0];
    },
    /**
     * DSV report format changed during 2025: months 01-04 use 92 columns,
     * month 05 uses 138 columns, months 06+ use 158 columns.
     * Many columns were renamed.  This synonym map lets the merge engine
     * align data from the old format into the new unified header.
     * Key = old name (92-col), Value = new name (138/158-col equivalent).
     *
     * Luftfracht (Air) files come in two flavours:
     *  – German-format (112/118 cols): nearly identical to Sea 92-col
     *    headers, mapped by the same synonyms below.
     *  – English-format (44 cols, "Import Report Template" sheet):
     *    completely different header names, mapped here to the
     *    corresponding German Sea column names.
     *
     * Columns that have NO equivalent in the Sea layout are left
     * unmapped.  The merge engine appends them to the unified header
     * so no data is lost, and downloadExcel places them on Sheet 2
     * of the final report for reference.
     */
    headerSynonyms: {
      // ── Sea 92-col → 138/158-col renames ──
      'Registrienummer/MRN':               'Registriernummer/MRN',
      'Versender EORI':                    'Versender CZ EORI',
      'Versender Name':                    'CZ Name',
      'Versender Ländercode':              'CZ Ländercode',
      'Empfänger EORI':                    'Empfänger CN EORI',
      'Empfänger Name':                    'CN Name',
      'Empfänger Ländercode':              'CN Ländercode',
      'Anmelder EORI':                     'Anmelder DT EORI',
      'Anmelder Name':                     'DT Name',
      'Anmelder Ländercode':               'DT Ländercode',
      'Addressierte Zollstelle':           'Zollstelle',
      'AufschubHZAZoll':                   'HZAZoll',
      'AufschubkontoZoll':                 'KontoZoll',
      'AufschubTextZoll':                  'TextZoll',
      'AufschubEORIZoll':                  'EORIZoll',
      'AufschubKennzeichenEigenZoll':      'KennzeichenEigenZoll',
      'AufschubArtEust':                   'ArtEust',
      'AufschubHZAEust':                   'HZAEust',
      'AufschubKontoEusT':                 'KontoEusT',
      'AufschubTextEust':                  'TextEust',
      'AufschubEORIEust':                  'EORIEust',
      'AufschubKennzeichenEigenEust':      'KennzeichenEigenEust',
      'Vorraussichtliche Zollabgabe':      'Vorausstl. Zollabgabe',
      'Vorraussichtliche Zollsatzabgabe':  'Vorausstl. Zollsatzabgabe',
      'Vorraussichtliche Eustabgabe':      'Vorausstl. Eustabgabe',
      'Vorraussichtliche Eustsatzabgabe':  'Vorausstl. Eustsatzabgabe',
      'DV1Rechnugnswährung':               'Währung',
      'DV1UmrechnungsWährung':             'Währung',
      'DV1Versicherungswährung':            'Währung',
      'DV1Luftfrachtkostenwährung':         'Währung',
      'DV1Frachtkostenwährung':             'Währung',
      'DV1MaterialienWährung':              'Währung',
      'Vorpapiere Registriernummer':       'Vorpapiere Reg.nummer',

      // ── German Luftfracht extras ──
      'Verfahren_1':                       'Verfahren',
      'SonderAbgabeAntidumping':           'AbgabeAntidumping',

      // ── English Luftfracht (44-col "Import Report Template") → Sea German ──
      'Formal Entry Number':               'Registriernummer/MRN',
      'Line No':                           'PositionNo',
      'Importer Name':                     'CN Name',
      'EORI Number / Tax ID / Equivalent': 'Empfänger CN EORI',
      'Entry Date \n(ddmmyy)':             'Anlagedatum',
      'Port of Entry':                     'Zollstelle',
      'Declaration Country':               'CN Ländercode',
      'Country of Origin':                 'Ursprung',
      'Shipping Country':                  'CZ Ländercode',
      'HTS Code (Tariff Number)':          'Warentarifnummer',
      'Item Description':                  'Warenbezeichnung',
      'Invoice value':                     'Rechnungsbetrag',
      'Invoice value \n':                  'Rechnungsbetrag',
      'Invoice currency':                  'Rechnungswährung',
      'Exchange Rate':                     'Rechnungskurs',
      'Declared Value':                    'Zollwert',
      'Duty Paid':                         'AbgabeZoll',
      'Duty Rate %':                       'AbgabeZollsatz',
      'VAT Value':                         'Eustwert',
      'VAT Paid':                          'AbgabeEust',
      'VAT Rate %':                        'AbgabeEustsatz',
      'Anti Dumping / Countervailing Duties': 'AbgabeAntidumping',
      'Special Trade Program (e.g. FTA)':  'Beguenstigung',
      'Supplier Name / Shipper Name':      'CZ Name',
      'Custom broker company name':        'DT Name',
      'Incoterms':                         'Liefercode',
      'Customs Quantity':                   'Aussenhandelstatistische Menge',
      'Unit of measurement':               'Maßeinheit',
      'Net Mass (in kg)':                  'Eigenmasse',
      'Gross Mass (in kg)':                'Rohmasse',
      'Gross Mass (in kg) ':               'Rohmasse',
      'Broker Reference Number':           'Bezugsnummer/LRN',
      'AWB / Bill Of Lading':              'Vorpapiere Reg.nummer',
      'Customs Value currency':            'Zollwertwährung',
    },
    /**
     * English Luftfracht columns that have NO equivalent in the Sea
     * layout. These are placed on Sheet 2 ("Air-Only Fields") so no
     * data is lost but the main Consolidated sheet stays clean.
     */
    airOnlyColumns: [
      'Arrival Date',
      'Invoice Number',
      'Other Fees / Taxes',
      'Transport Mode',
      'Entry Type',
      'Entry Type ',
      'Branch',
      'Site Name',
      'Site Number',
      'CBAM related goods ? \nY/N',
      'CBAM related goods ?\nY/N',
      'CBAM goods category *',
      'CBAM Exeption applied ? \nY/N',
      'CBAM Exeption applied ?\nY/N',
      'CBAM Type of exeption',
      'Voraus. Gesamtabgaben',
    ],
    isFooterRow: (row) => {
      if (!row || row.length < 2) return true;
      const nonEmpty = row.filter(c => c != null && c !== '');
      return nonEmpty.length < 2;
    },
  },
  {
    id: 'SCHENKER',
    label: 'DB Schenker',
    headerRows: 1,
    headerStartRow: 0,
    dataStartRow: 1,
    color: '#EC0016',
    textColor: '#FFFFFF',
    accent: '#F01414',
    logoIcon: `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="40" rx="6" fill="#EC0016"/>
      <text x="8" y="27" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">DB Schenker</text>
    </svg>`,
    capabilities: [
      { text: 'Corrects malformed numbers with leading commas or dots' },
      { text: 'Performs basic file merge and consolidation operations' },
    ],
    isFooterRow: (row) => {
      if (!row || row.length < 2) return true;
      const nonEmpty = row.filter(c => c != null && c !== '');
      return nonEmpty.length < 2;
    },
  },
  {
    id: 'UPS',
    label: 'UPS',
    headerRows: 1,
    headerStartRow: 0,
    dataStartRow: 1,
    color: '#351C15',
    textColor: '#FFB500',
    accent: '#FFB500',
    logoIcon: `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="40" rx="6" fill="#351C15"/>
      <path d="M46 8h28v24c0 5-14 5-14 5s-14 0-14-5V8z" fill="#FFB500"/>
      <text x="50" y="27" font-family="Arial Black,sans-serif" font-size="14" font-weight="900" fill="#351C15">UPS</text>
    </svg>`,
    capabilities: [
      { text: 'Removes trailing whitespace and newlines from text fields' },
      { text: 'Converts European number formats to standard decimal notation' },
      { text: 'Transforms text-formatted numbers to proper numeric values (23 columns)' },
      { text: 'Automatically trims unused trailing empty columns' },
      { text: 'Validates HS codes and country codes across 4 country columns' },
    ],
    isFooterRow: (row) => {
      if (!row || row.length < 2) return true;
      const nonEmpty = row.filter(c => c != null && c !== '');
      return nonEmpty.length < 2;
    },
  },
];
