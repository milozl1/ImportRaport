/**
 * Find the best mapping between 92-col headers and 138/158-col headers.
 * Many columns exist in all formats but with different names.
 */
import fs from 'fs';
import path from 'path';

const DSV_DIR = path.resolve('excel/DSV');

function parseCSVHeaders(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const firstLine = raw.split(/\r?\n/)[0];
  return firstLine.split(';').map(h => h.replace(/^"|"$/g, ''));
}

function parseCSVData(filePath, maxRows = 3) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  return lines.slice(1, 1 + maxRows).map(l => l.split(';').map(c => c.replace(/^"|"$/g, '')));
}

// Read a 92-col file and a 158-col file for the same declaration to compare data values
const h92 = parseCSVHeaders(path.join(DSV_DIR, 'IMP-HELLA-03-2025 DSV Sea.csv'));
const h138 = parseCSVHeaders(path.join(DSV_DIR, 'IMP-HELLA-05-2025 DSV Sea.csv'));
const h158 = parseCSVHeaders(path.join(DSV_DIR, 'IMP-HELLA-06-2025 DSV Sea.csv'));

// Find semantic matches between 92-col and 138/158-col headers
// by looking at similar substrings
function findBestMatch(name92, largeHeaders) {
  const n = name92.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let i = 0; i < largeHeaders.length; i++) {
    const l = largeHeaders[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n === l) return { idx: i, name: largeHeaders[i], exact: true };
  }
  // fuzzy match: check if one contains the other
  for (let i = 0; i < largeHeaders.length; i++) {
    const l = largeHeaders[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n.length > 3 && l.length > 3 && (n.includes(l) || l.includes(n))) {
      return { idx: i, name: largeHeaders[i], fuzzy: true };
    }
  }
  return null;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('MAPPING 92-col → 158-col');
console.log('═══════════════════════════════════════════════════════════════');

const used158 = new Set();
for (let i = 0; i < h92.length; i++) {
  const match = findBestMatch(h92[i], h158);
  if (match && !used158.has(match.idx)) {
    used158.add(match.idx);
    if (match.exact) {
      console.log(`  92[${String(i).padStart(2)}] "${h92[i]}" → 158[${String(match.idx).padStart(3)}] "${match.name}" ✅`);
    } else {
      console.log(`  92[${String(i).padStart(2)}] "${h92[i]}" → 158[${String(match.idx).padStart(3)}] "${match.name}" ≈`);
    }
  } else {
    console.log(`  92[${String(i).padStart(2)}] "${h92[i]}" → ❌ NO MATCH`);
  }
}

console.log('\n\nColumns in 158 NOT matched:');
for (let i = 0; i < h158.length; i++) {
  if (!used158.has(i)) {
    console.log(`  158[${String(i).padStart(3)}] "${h158[i]}"`);
  }
}

// Now the critical question: for the SAME conceptual column, does the
// 92-col format use a different name than the 138/158-col format?
// Let's manually identify renamed columns:
console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('RENAMED COLUMNS (92-col name vs 158-col equivalent)');
console.log('═══════════════════════════════════════════════════════════════');

// Manual mapping based on visual comparison of the header lists
const renames = [
  [6, 'Registrienummer/MRN', 9, 'Registriernummer/MRN'],   // typo fix
  [9, 'Versender EORI', 17, 'Versender CZ EORI'],
  [10, 'Versender Name', 19, 'CZ Name'],
  [11, 'Versender Ländercode', 20, 'CZ Ländercode'],
  [12, 'Empfänger EORI', 21, 'Empfänger CN EORI'],
  [13, 'Empfänger Name', 23, 'CN Name'],
  [14, 'Empfänger Ländercode', 24, 'CN Ländercode'],
  [15, 'Anmelder EORI', 25, 'Anmelder DT EORI'],
  [16, 'Anmelder Name', 27, 'DT Name'],
  [17, 'Anmelder Ländercode', 28, 'DT Ländercode'],
  [26, 'Addressierte Zollstelle', 45, 'Zollstelle'],
  [27, 'Aufschubart', 46, 'Aufschubart'],
  [28, 'AufschubHZAZoll', 47, 'HZAZoll'],
  [29, 'AufschubkontoZoll', 48, 'KontoZoll'],
  [30, 'AufschubTextZoll', 49, 'TextZoll'],
  [31, 'AufschubEORIZoll', 50, 'EORIZoll'],
  [32, 'AufschubKennzeichenEigenZoll', 51, 'KennzeichenEigenZoll'],
  [33, 'AufschubArtEust', 52, 'ArtEust'],
  [34, 'AufschubHZAEust', 53, 'HZAEust'],
  [35, 'AufschubKontoEusT', 54, 'KontoEusT'],
  [36, 'AufschubTextEust', 55, 'TextEust'],
  [37, 'AufschubEORIEust', 56, 'EORIEust'],
  [38, 'AufschubKennzeichenEigenEust', 57, 'KennzeichenEigenEust'],
  [42, 'Vorraussichtliche Zollabgabe', 66, 'Vorausstl. Zollabgabe'],
  [43, 'Vorraussichtliche Zollsatzabgabe', 67, 'Vorausstl. Zollsatzabgabe'],
  [44, 'Vorraussichtliche Eustabgabe', 68, 'Vorausstl. Eustabgabe'],
  [45, 'Vorraussichtliche Eustsatzabgabe', 69, 'Vorausstl. Eustsatzabgabe'],
  [78, 'DV1Rechnugnswährung', 115, 'Währung'],
  [80, 'DV1UmrechnungsWährung', 117, 'Währung'],
  [82, 'DV1Versicherungswährung', 119, 'Währung'],
  [84, 'DV1Luftfrachtkostenwährung', 121, 'Währung'],
  [86, 'DV1Frachtkostenwährung', 123, 'Währung'],
  [88, 'DV1MaterialienWährung', 125, 'Währung'],
  [91, 'Vorpapiere Registriernummer', 131, 'Vorpapiere Reg.nummer'],
];

for (const [i92, n92, i158, n158] of renames) {
  console.log(`  92[${String(i92).padStart(2)}] "${n92}" = 158[${String(i158).padStart(3)}] "${n158}"`);
}
