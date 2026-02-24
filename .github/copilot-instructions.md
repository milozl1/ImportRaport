## ImportRaport — quick guide for AI coding assistants

This project is a small single-page web app (Vite) that consolidates customs/broker monthly reports into one Excel. The goal of these instructions is to provide immediate, actionable context for code changes.

Key files
- `index.html` — SPA shell and UI layout (3-step flow). Loads `src/js/app.js` as module. Includes detail report modal overlay.
- `src/js/app.js` — controller/orchestrator for the UI (select broker → upload files → results). Uses browser File API and calls the engine to parse/merge. Includes detailed report modal with categorized fix display.
- `src/js/brokers.js` — broker configuration: identity + parsing rules. Each broker object defines `id`, `headerRows`, `dataStartRow`, `isFooterRow(row)` and visual fields.
- `src/js/engine.js` — parsing + merging engine. Important exported functions:
  - `parseFile(file)` → Promise<Array<Array>> (sheet parsed as AoA)
  - `extractParts(rows, broker)` → { headers, data }
  - `mergeFiles(files, broker, onProgress)` → { headers, data, stats }
  - `downloadExcel(headers, data, fileName)` → triggers file download
- `src/js/validator.js` — validation & automatic correction logic (v3). DHL-specific column shift detection, repair, and numeric format fixes.
- `tests/test-validator.mjs` — 110 automated tests across 16 groups. Run: `node tests/test-validator.mjs`
- `tests/e2e/app.spec.js` — 28 Playwright E2E tests across 10 groups. Run: `npx playwright test`
- `scripts/full-audit.mjs` — processes all 12 Excel files through the validator and checks every critical column. Run: `node scripts/full-audit.mjs`
- `scripts/deep-analysis.mjs` — exhaustive dump and shift detection across all files.
- `scripts/classify-shifts.mjs` — classifies all anomalous rows into shift categories.
- `scripts/investigate-unknowns.mjs` — deep investigation of cascade and unknown shift rows.

Big picture / data flow
- UI (app.js) gathers browser File objects and sends them to `mergeFiles`.
- `engine.parseFile` uses `papaparse` for CSV/TSV and `xlsx` for spreadsheets; the first sheet is used.
- `extractParts` slices sheet rows using broker config (`headerStartRow`, `headerRows`, `dataStartRow`) and filters footers via `broker.isFooterRow`.
- All data rows (AoA) are concatenated and passed to `validateAndFix` (validator). The final shape returned to the UI is { headers, data, stats }.

DHL Column Layout (137 columns, zero-based)
- Cols 0-14: Declaration info (date, EORI, declaration number, etc.)
- Cols 15-19: Seller zone — **ALWAYS EMPTY** in DHL source data. Never shift-detect this zone.
- Cols 20-24: Shipper zone [Name, Address, Town, Postcode, Country]. Can have +1/+2 address overflow shift.
- Col 25: Gap column (consignee customs number).
- Cols 26-30: Consignee zone [Name, Address, Town, Postcode, Country]. Can have +1/+2 address overflow shift.
- Col 31: Incoterm.
- Col 32: Delivery Location. Can have +1/+2 overflow (mid-row overflow), pushing freight and all downstream columns right.
- Cols 33-34: Freight EUR, Weight.
- Cols 67-76: Summary duties/VAT.
- Col 109: Description of Goods.
- Col 110: HS Code (8-11 digits).
- Col 111: Country of Origin (2-letter code, may be legitimately empty for procCode=300 rows).
- Cols 112-113: Preference, Procedure Code.
- Cols 117-128: Financial values (invoice, currency, exchange rate, duty, VAT, etc.).

Validator v3 Architecture (`src/js/validator.js`)

Pipeline order (CRITICAL — do NOT reorder):
1. **Shipper address zone repair** (cols 20-24) — detects +1/+2 overflow, merges fragments, shifts row left.
2. **Consignee address zone repair** (cols 26-30) — same logic.
3. **Mid-row overflow repair** (col 32: delivery location) — detects if col 33 has non-numeric text (delivery location overflow), merges fragments, shifts row left. This catches cascade shifts where shipper overflow pushes data into the delivery location zone.
4. **Goods zone shift repair** (cols 109+) — detects +1 through +8 description overflow, merges fragments.
5. **Number format correction** — European comma→dot, leading comma/dot fix.
6. **Post-repair validation** — warns if HS Code / Shipper Country still invalid.

Why this order: Address zone repair does a full row rebuild that shifts ALL columns from the repair point onward left by N. If goods zone repair runs first, a subsequent address repair shifts the already-corrected goods columns out of alignment. Address repairs affect cols 20-30 range, mid-row repair affects col 32+, so doing them first means goods zone (cols 109+) sees the post-repair positions.

Shift types discovered (from analysis of 1,536 rows across 12 months):
- **Address overflow** (+1, rare): Address text fills 2 cells, pushing Town/Postcode/Country right. Detected by checking if Country column lacks a 2-letter code but the next column has one.
- **Mid-row delivery location overflow** (+1/+2): Delivery location (col 32) overflows into freight column (col 33), pushing freight and everything after right. Two sub-types: (A) col 33 has non-numeric text — detected by checking if col 33 has text when it should be numeric; (B) col 33 is empty/null (structural gap after shipper repair cascaded a null cell) — detected by checking col 32 has text AND col 34/35 have numeric data. Creates a **full cascade** when combined with shipper address overflow.
- **Full cascade shift**: When shipper overflow (+1) and delivery location overflow (+1) occur in the same row, the combined +2 offset cascades through the entire row from col 35 to the end. The pipeline handles this by repairing each overflow point sequentially.
- **Goods description overflow** (+1 to +8): Description spans multiple cells, pushing HS Code/Country/ProcCode rightward. Detected by scanning cols 110-118 for an 8-11 digit HS code.
- **"Missing country" pattern** (NOT a shift): Rows with procCode=300 legitimately have empty Country of Origin. The detector handles this explicitly.
- **Date placeholders**: Values like `"0001-01-01"` appear in empty cells and are filtered from description merges.

Key functions in validator.js:
- `P` object: Pattern matchers (hsCode, country2, currency3, postcode, numeric, date, procCode, etc.)
- `DHL_SCHEMA`: Column→type mapping with sparse numeric keys.
- `detectAddressZoneShift(row, base, nextSectionCol)` → 0, 1, or 2.
- `repairAddressZoneShift(row, base, shift, zoneName)` → { fixed, details }.
- `detectMidRowOverflow(row)` → 0 to 3. Checks two cases: (A) col 33 (freight) has non-numeric text (delivery location overflowed), or (B) col 33 is empty/null but col 32 has text and col 34 has numeric data (structural gap after shipper repair).
- `repairMidRowOverflow(row, shift)` → { fixed, details }. Merges delivery location fragments at col 32.
- `detectGoodsZoneShift(row)` → 0 to 8.
- `repairGoodsZoneShift(row, shift)` → { fixed, details }.
- `validateAndFix(data, broker)` → report.
- `reportSummary(report)` → human-readable string.

Project-specific conventions & patterns
- Broker-driven parsing: parsing rules live in `BROKERS` config. Adding a broker is config-driven — no engine code changes usually required.
- Column indexes are zero-based and explicit in `validator.js` schema.
- Numeric fixes assume European formats (comma decimal). The `fixNumericValue` function converts European-style numbers (comma as decimal separator, thousands-dot notation) to standard dot-decimal format. It is applied to ALL columns, not just known numeric ones, so all values are uniformly dot-decimal. Text strings with commas (e.g. addresses) are not affected because the regex only matches numeric patterns.
- UI expects the `mergeFiles` contract: `onProgress` can update a loading text string; errors are pushed into `stats.skippedFiles`.

Build / run / debug
- Install & run dev server (Vite):
  - `npm install`
  - `npm run dev` (opens dev server; use browser devtools to debug)
- Build for production: `npm run build` and `npm run preview`.
- Run tests: `node tests/test-validator.mjs` (110 tests, should all pass).
- Run E2E tests: `npx playwright test` (28 tests, should all pass).
- Run full audit: `node scripts/full-audit.mjs` (processes all 12 Excel files, 3 passes, expects 0 errors).
- Note: `index.html` contains an importmap which maps `papaparse` and `xlsx` to CDN bundles for static hosting. During local dev Vite will resolve from node_modules.

Data contracts (short)
- `parseFile(file: File)` => `Promise<Array<Array>>` — rows are arrays; blank cells may be `null`.
- `extractParts(rows, broker)` => `{ headers: Array<Array>, data: Array<Array> }`
- `mergeFiles(files, broker, onProgress)` => `{ headers, data, stats }`
  - `stats` contains: `totalFiles`, `rowsPerFile`, `totalRows`, `skippedFiles`, `validation`, `validationSummary`.
- `validateAndFix(data, broker)` => `{ shiftFixes, numberFixes, totalIssues, issues: [...] }`

Common edits examples
- Add a broker: edit `src/js/brokers.js` — copy existing object and change `headerRows`, `dataStartRow` and `isFooterRow` logic.
- Expand validation for a broker: update `validator.js` — add column tests in DHL_SCHEMA, and corresponding `P` pattern matchers.
- Add a new shift type: add a detect function and repair function, then add to the pipeline in `validateAndFix` (mind the ordering!).
- Add tests: append to `tests/test-validator.mjs` — use `makeRow(137)` to create test rows, set specific columns, run `validateAndFix`.

Edge-cases & gotchas
- `isFooterRow(row)` must accept `null`/`[]` and should be conservative — many brokers use the heuristic "fewer than N non-empty cells".
- Column schemas use sparse numeric keys — adding or renumbering columns requires checking all referenced indexes.
- The address zone repair does a full row rebuild (`slice` + `concat`) that shifts ALL subsequent columns left. This is why pipeline order matters.
- Seller zone (cols 15-19) is **always empty** in DHL data. The old validator wrongly detected "shifts" and pulled Shipper data into Seller cells — this was the primary bug that was fixed in v3.
- Date placeholder values `"0001-01-01"` appear throughout DHL data in empty cells and are NOT description text.
- Large files may be memory-heavy because the app holds all parsed rows in memory before validation and download.

Audit results (as of last full run)
- 1,536 data rows across 12 monthly files (Jan-Dec 2025)
- 28 column shifts detected and repaired
- 16,272 number format corrections
- 0 errors, 0 warnings remaining after repair
- 3 consecutive passes produce identical results (deterministic)

-- end
