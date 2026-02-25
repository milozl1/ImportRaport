import XLSX from 'xlsx';

// Updated headerMap (matches analytics.js after fixes)
const headerMap = {
  date:            ['Anlagedatum', 'MassgeblicherZeitpunkt', 'Ãberlassungsdatum', 'Überlassungsdatum', 'Entry Date \n(ddmmyy)', 'Arrival Date'],
  declarationNo:   ['Registriernummer/MRN', 'Registrienummer/MRN', 'RegistrierNummer', 'Formal Entry Number'],
  declarantName:   ['DT Name', 'Anmelder Name', 'Broker Name'],
  declarantEORI:   ['DT EORI', 'Anmelder EORI', 'Anmelder Ländercode'],
  shipperName:     ['CZ Name', 'Versender Name', 'Versender', 'Supplier Name / Shipper Name'],
  shipperCountry:  ['CZ Ländercode', 'Versender Ländercode', 'VersendungsLand', 'Shipping Country'],
  shipperEORI:     ['CZ EORI', 'Versender EORI'],
  consigneeName:   ['CN Name', 'Empfänger Name', 'Importer Name'],
  consigneeCountry:['CN Ländercode', 'Empfänger Ländercode', 'Declaration Country'],
  consigneeEORI:   ['CN EORI', 'Empfänger EORI', 'Importer ID'],
  incoterm:        ['Liefercode', 'IncoTerm', 'Incoterms'],
  deliveryPlace:   ['Lieferort', 'LieferBedingungOrt'],
  invoiceValue:    ['Rechnungsbetrag', 'RechnungsWertGesamt', 'RechnungsNettoWertPosition', 'Invoice value'],
  currency:        ['Rechnungswährung', 'Rechnungswährung', 'RechnungsWertWaehrung', 'Invoice currency'],
  exchangeRate:    ['Rechnungskurs', 'KursZuEuro', 'Exchange Rate'],
  hsCode:          ['Warentarifnummer', 'WarenNummer', 'HTS Code (Tariff Number)'],
  description:     ['Warenbezeichnung', 'WarenBezeichnung', 'Item Description'],
  countryOfOrigin: ['Ursprung', 'UrsprungsLand', 'Country of Origin'],
  procedureCode:   ['VerfahrensCode', 'Verfahren_1', 'Verfahren'],
  customsDuty:     ['AbgabeZoll', 'AbgabenZoll', 'Vorraussichtliche Zollabgabe', 'Vorausstl. Zollabgabe', 'Duty Paid'],
  customsDutyRate: ['AbgabeZollsatz', 'AbgabenZollsatz', 'Zollabgabensatz', 'Vorraussichtliche Zollsatzabgabe', 'Vorausstl. Zollsatzabgabe', 'Duty Rate %'],
  eustAmount:      ['AbgabeEust', 'AbgabenEUSt', 'AbgabenEust', 'Vorraussichtliche Eustabgabe', 'Vorausstl. Eustabgabe', 'VAT Paid'],
  eustRate:        ['AbgabeEustsatz', 'AbgabenEustsatz', 'Vorraussichtliche Eustsatzabgabe', 'Vorausstl. Eustsatzabgabe', 'EustsatzZoll', 'VAT Rate %'],
  customsValue:    ['Zollwert', 'ZollWert', 'Declared Value'],
  articlePrice:    ['Artikelpreis'],
  grossWeight:     ['Rohmasse', 'RohMasse', 'Gesamtgewicht', 'Gross Mass (in kg)'],
  netWeight:       ['Eigenmasse', 'EigenMasse', 'Net Mass (in kg)'],
  freightCost:     ['DV1Frachtkosten', 'DV1Luftfrachtkosten', 'ZollWertRelevanteFracht', 'FrachtKostenPosition'],
  packageCount:    ['AnzahlPackstücke', 'AnzahlDerPackstuecke', 'Anzahlpackstã¼cke'],
  statisticalValue:['Statistischerwert'],
  container:       ['Container'],
};

const CRITICAL_FIELDS = [
  'date', 'declarationNo', 'hsCode', 'invoiceValue', 'currency',
  'countryOfOrigin', 'shipperCountry', 'procedureCode', 'incoterm',
  'customsDuty', 'eustAmount', 'description', 'grossWeight', 'netWeight',
  'packageCount', 'freightCost', 'shipperName',
];

const files = [
  { path: 'excel/DSV/IMP-HELLA-10-2025 DSV Sea.xlsx', label: 'DSV Sea', sheet: null },
  { path: 'excel/DSV/Zollreport Luftfracht Q1 2025.xlsx', label: 'DSV Luft Q1', sheet: 'Input AC Report ' },
  { path: 'excel/DSV/Zollreport Luftfracht 07.05. - 30.06.2025.xlsx', label: 'DSV Luft 07.05', sheet: null },
];

let allOk = true;
for (const f of files) {
  const wb = XLSX.readFile(f.path);
  const sheetName = f.sheet || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const hdr = d[0].map(h => h != null ? String(h).trim() : '');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${f.label} — sheet "${sheetName}" — ${hdr.length} cols, ${d.length - 1} data rows`);
  console.log('='.repeat(60));

  let resolved = 0, missed = 0;
  for (const [field, names] of Object.entries(headerMap)) {
    const startIdx = (field === 'procedureCode' && names.includes('Verfahren')) ? 0 : 0;
    let found = false;
    for (const name of names) {
      const sIdx = (field === 'procedureCode' && name.toLowerCase() === 'verfahren') ? 40 : 0;
      const idx = hdr.findIndex((h, i) => i >= sIdx && h.toLowerCase() === name.toLowerCase());
      if (idx !== -1) {
        const isCritical = CRITICAL_FIELDS.includes(field);
        const val = d[1] && d[1][idx] != null ? String(d[1][idx]).substring(0, 40) : 'NULL';
        console.log(`  ${isCritical ? '✅' : '  '} ${field.padEnd(20)} → col ${String(idx).padStart(3)} (${name}) = ${val}`);
        found = true;
        resolved++;
        break;
      }
    }
    if (!found) {
      const isCritical = CRITICAL_FIELDS.includes(field);
      if (isCritical) {
        console.log(`  ❌ ${field.padEnd(20)} → NOT FOUND *** CRITICAL ***`);
        allOk = false;
      } else {
        console.log(`     ${field.padEnd(20)} → not found (non-critical)`);
      }
      missed++;
    }
  }
  console.log(`  ── Resolved: ${resolved}/${resolved + missed} | Missed: ${missed}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(allOk ? '✅ ALL CRITICAL FIELDS RESOLVE for all formats!' : '❌ SOME CRITICAL FIELDS MISSING — fix needed!');
console.log('='.repeat(60));
