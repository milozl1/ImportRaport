/**
 * Simple merge engine.
 * Takes multiple files for the same broker, extracts the data rows,
 * and returns { headerRows, dataRows } — one consolidated table.
 *
 * When files have different column structures (e.g. DSV CSVs changed
 * from 92 → 138 → 158 columns during 2025), the engine aligns all
 * data to a unified header so that every value lands in the correct
 * column regardless of which file it came from.
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { validateAndFix, reportSummary } from './validator.js';

/* ───────────────────────────────────────────────
   Header alignment helpers
   ─────────────────────────────────────────────── */

/**
 * Build a unified (superset) header from multiple file headers.
 *
 * Strategy: start with the widest file's header row, then for every
 * other file's header find columns that don't appear in the unified
 * set and append them at the end.  Synonym mapping (broker.headerSynonyms)
 * is consulted when resolving names.
 *
 * Columns listed in `broker.airOnlyColumns` are **excluded** from the
 * unified header and tracked separately so the engine can place them
 * on Sheet 2 of the final report.
 *
 * Because some header names are **duplicated** (e.g. "Verfahren" at
 * positions 2 and 84, or "Währung" at 6 different positions), the
 * unified header is treated as an ordered list where the same name
 * can appear more than once.  Matching is done in order — the first
 * unmatched occurrence is used — so that duplicates stay aligned.
 *
 * @param {Array<{headers: string[][], fileIdx: number}>} fileParts
 * @param {Object} broker
 * @returns {{ unified: string[], airOnlyHeader: string[] }}
 */
function buildUnifiedHeader(fileParts, broker) {
  // Set of header names that must NOT appear on the main sheet.
  const airOnlySet = new Set((broker.airOnlyColumns || []).map(s => s.trim()));

  // Find the widest header row.
  let widest = fileParts[0];
  for (const fp of fileParts) {
    if ((fp.headers[0] || []).length > (widest.headers[0] || []).length) {
      widest = fp;
    }
  }

  // Start with a clone of the widest header (excluding air-only cols).
  const raw = [...(widest.headers[0] || [])].map(h =>
    h != null ? String(h).trim() : ''
  );
  const unified = raw.filter(h => !airOnlySet.has(h));

  const synonyms = broker.headerSynonyms || {};

  // Collect air-only columns from all files (preserving order).
  const airOnlyHeader = [];
  const airOnlySeen = new Set();

  // Helper: check if a header name is air-only
  const isAirOnly = (name) => airOnlySet.has(name);

  // Process widest file first for air-only columns
  for (const h of raw) {
    if (h && isAirOnly(h) && !airOnlySeen.has(h)) {
      airOnlyHeader.push(h);
      airOnlySeen.add(h);
    }
  }

  // For every other file, check if it has columns NOT in the unified set.
  for (const fp of fileParts) {
    if (fp === widest) continue;
    const hRow = (fp.headers[0] || []).map(h =>
      h != null ? String(h).trim() : ''
    );

    for (let i = 0; i < hRow.length; i++) {
      const name = hRow[i];
      if (!name) continue;

      // If this is an air-only column, track it but don't add to unified.
      if (isAirOnly(name)) {
        if (!airOnlySeen.has(name)) {
          airOnlyHeader.push(name);
          airOnlySeen.add(name);
        }
        continue;
      }

      // Resolve through synonyms
      const canonical = synonyms[name] || name;
      // Check if canonical name is already in unified
      if (unified.includes(canonical)) continue;
      // Also check the original name
      if (unified.includes(name)) continue;
      // New column — append
      unified.push(name);
    }
  }

  return { unified, airOnlyHeader };
}

/**
 * Build a column mapping from a file's header to the unified header.
 *
 * Returns an object with:
 *   `mapping`    — array where `mapping[fileColIdx] = unifiedColIdx` (-1 if unmapped)
 *   `airMapping` — array where `airMapping[fileColIdx] = airOnlyColIdx` (-1 if not air-only)
 *
 * Handles duplicates by consuming unified positions in order (first
 * available match).
 *
 * @param {string[]} fileHeader    — this file's header row (strings)
 * @param {string[]} unified       — the unified header row
 * @param {Object}   synonyms      — old-name → new-name map
 * @param {string[]} airOnlyHeader — air-only column names (for Sheet 2)
 * @returns {{ mapping: number[], airMapping: number[] }}
 */
function buildColumnMapping(fileHeader, unified, synonyms, airOnlyHeader) {
  const mapping = new Array(fileHeader.length).fill(-1);
  const airMapping = new Array(fileHeader.length).fill(-1);
  // Track which unified positions have been claimed.
  const used = new Set();

  // Build a quick lookup for air-only header positions
  const airOnlySet = new Set((airOnlyHeader || []).map(s => s.trim()));

  // Pass 0: map air-only columns first (they are NOT in unified)
  if (airOnlyHeader && airOnlyHeader.length > 0) {
    const airUsed = new Set();
    for (let fi = 0; fi < fileHeader.length; fi++) {
      const name = fileHeader[fi];
      if (!name) continue;
      if (airOnlySet.has(name)) {
        // Find position in airOnlyHeader
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

  // Pass 1: exact name match (order-preserving for duplicates)
  for (let fi = 0; fi < fileHeader.length; fi++) {
    if (airMapping[fi] !== -1) continue; // air-only column, skip
    const name = fileHeader[fi];
    if (!name) continue;
    // Find the first unused unified position with the same name
    for (let ui = 0; ui < unified.length; ui++) {
      if (!used.has(ui) && unified[ui] === name) {
        mapping[fi] = ui;
        used.add(ui);
        break;
      }
    }
  }

  // Pass 2: synonym match for any still-unmapped columns
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

/**
 * Remap a data row from file column layout to unified column layout.
 *
 * @param {Array} row       — original data row
 * @param {number[]} mapping — file-col → unified-col index array
 * @param {number} width     — unified header width
 * @returns {Array} new row aligned to unified header
 */
function remapRow(row, mapping, width) {
  const out = new Array(width).fill(null);
  for (let fi = 0; fi < row.length && fi < mapping.length; fi++) {
    const ui = mapping[fi];
    if (ui >= 0) {
      out[ui] = row[fi];
    }
  }
  return out;
}

/**
 * Extract air-only column values from a data row.
 *
 * @param {Array}    row        — original data row
 * @param {number[]} airMapping — file-col → air-only-col index array
 * @param {number}   width      — air-only header width
 * @returns {Array|null}  air-only row, or null if no air-only data
 */
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

// Export alignment helpers for testing
export { buildUnifiedHeader, buildColumnMapping, remapRow, extractAirOnlyRow };

/**
 * Parse a single file into an array-of-arrays.
 * @param {File} file    — browser File object
 * @param {Object} [broker] — optional broker config (used for CSV parsing hints)
 */
export async function parseFile(file, broker) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || ext === 'tsv') {
    // Build PapaParse options. DSV CSVs use semicolons and UTF-8 BOM.
    const opts = {
      skipEmptyLines: false,
      complete: null,
      error: null,
    };

    // DSV CSV files are semicolon-delimited. PapaParse auto-detect may
    // fail when numeric data contains commas (European decimal format).
    if (broker && broker.csvDelimiter) {
      opts.delimiter = broker.csvDelimiter;
    }

    return new Promise((resolve, reject) => {
      opts.complete = (r) => {
        let rows = r.data;
        // Strip UTF-8 BOM from first cell if present
        if (rows.length > 0 && rows[0].length > 0 && typeof rows[0][0] === 'string') {
          rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
        }
        resolve(rows);
      };
      opts.error = reject;
      Papa.parse(file, opts);
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });

  // DSV Luftfracht XLSX files may have the real data on a sheet other
  // than the first one.  When the broker supplies a sheetSelector
  // function we ask it which sheet to use; otherwise take sheet 0.
  let sheetName = wb.SheetNames[0];
  if (broker && broker.sheetSelector) {
    sheetName = broker.sheetSelector(wb.SheetNames, file.name) || sheetName;
  }
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

/**
 * Extract header rows and data rows from a single parsed sheet.
 * @param {Array<Array>} rows  — full sheet data
 * @param {Object} broker      — broker config
 * @returns {{ headers: Array<Array>, data: Array<Array> }}
 */
export function extractParts(rows, broker) {
  const headerStart = broker.headerStartRow ?? 0;
  const headerEnd = headerStart + broker.headerRows;
  const dataStart = broker.dataStartRow;

  const headers = rows.slice(headerStart, headerEnd);
  const rawData = rows.slice(dataStart);

  // Filter out footer / blank rows
  const data = rawData.filter(row => !broker.isFooterRow(row));

  return { headers, data };
}

/**
 * Merge multiple files for one broker into a single consolidated table.
 * Returns { headers, data, stats }.
 *
 * When files have different column structures (detected by varying
 * header counts), all data is aligned to a unified header so that
 * every value lands in the correct column.
 */
export async function mergeFiles(files, broker, onProgress) {
  const stats = { totalFiles: files.length, rowsPerFile: [], totalRows: 0, skippedFiles: [] };

  // ── Phase 1: Parse all files, collect headers + data ──
  const fileParts = []; // { headers, data, hRow }
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) onProgress(`Parsing ${file.name}... (${i + 1}/${files.length})`);

    try {
      const rows = await parseFile(file, broker);
      const parts = extractParts(rows, broker);

      // Normalise header row strings for comparison
      const hRow = (parts.headers[0] || []).map(h =>
        h != null ? String(h).trim() : ''
      );

      fileParts.push({ headers: parts.headers, data: parts.data, hRow });
      stats.rowsPerFile.push({ name: file.name, rows: parts.data.length });
      stats.totalRows += parts.data.length;
    } catch (err) {
      console.error(`Failed to parse ${file.name}:`, err);
      stats.skippedFiles.push({ name: file.name, error: err.message });
    }
  }

  if (fileParts.length === 0) {
    return { headers: [], data: [], stats };
  }

  // ── Phase 2: Detect if header alignment is needed ──
  // Alignment is needed when files have different column counts or
  // different header names.
  const firstWidth = fileParts[0].hRow.length;
  const needsAlignment = fileParts.some(fp =>
    fp.hRow.length !== firstWidth ||
    fp.hRow.some((h, idx) => h !== fileParts[0].hRow[idx])
  );

  let headers;
  const allData = [];
  let airOnlyHeader = [];
  const airOnlyData = [];

  if (needsAlignment && broker.headerSynonyms) {
    // ── Build unified header and remap all data ──
    if (onProgress) onProgress('Aligning columns across files…');

    const result = buildUnifiedHeader(fileParts, broker);
    const unified = result.unified;
    airOnlyHeader = result.airOnlyHeader;
    headers = [unified];

    const synonyms = broker.headerSynonyms || {};

    for (const fp of fileParts) {
      const { mapping, airMapping } = buildColumnMapping(
        fp.hRow, unified, synonyms, airOnlyHeader
      );
      for (const row of fp.data) {
        allData.push(remapRow(row, mapping, unified.length));
        // Collect air-only data (if this file has air-only columns)
        if (airOnlyHeader.length > 0) {
          const airRow = extractAirOnlyRow(row, airMapping, airOnlyHeader.length);
          airOnlyData.push(airRow); // null for Sea-only rows
        }
      }
    }
  } else {
    // ── All files have the same structure — no remapping needed ──
    headers = fileParts[0].headers;
    for (const fp of fileParts) {
      allData.push(...fp.data);
    }
  }

  // ── Phase 3: Data Validation & Correction ──
  if (onProgress) onProgress('Validating & correcting data…');
  const validationReport = validateAndFix(allData, broker, headers);
  stats.validation = validationReport;
  stats.validationSummary = reportSummary(validationReport);

  // Attach air-only column info so downloadExcel can produce Sheet 2.
  const airOnly = airOnlyHeader.length > 0
    ? { headers: airOnlyHeader, data: airOnlyData }
    : null;

  return { headers: headers || [], data: allData, stats, airOnly };
}

/**
 * Generate an Excel workbook from merged data and trigger download.
 *
 * When `airOnly` is provided (from mergeFiles), a second sheet
 * "Air-Only Fields" is created with the columns that could not be
 * mapped to the Sea layout.  A "Row #" column cross-references the
 * main Consolidated sheet so users can match rows easily.
 *
 * @param {Array}  headers   — header rows (array of arrays)
 * @param {Array}  data      — data rows
 * @param {string} fileName  — output file name
 * @param {Object} [airOnly] — { headers: string[], data: (Array|null)[] }
 */
export function downloadExcel(headers, data, fileName, airOnly) {
  const allRows = [...headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Auto-size columns (approximate)
  const colWidths = [];
  for (const row of allRows.slice(0, 50)) {
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const len = row[c] ? String(row[c]).length : 0;
      colWidths[c] = Math.min(Math.max(colWidths[c] || 8, len), 40);
    }
  }
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consolidated');

  // ── Sheet 2: Air-Only Fields ──
  if (airOnly && airOnly.headers && airOnly.headers.length > 0) {
    // Check if there is any air-only data at all
    const hasAnyAirData = airOnly.data.some(r => r != null);
    if (hasAnyAirData) {
      // Build air-only sheet with a "Row #" cross-reference column.
      const airHeader = ['Row #', ...airOnly.headers];
      const airRows = [airHeader];

      for (let i = 0; i < airOnly.data.length; i++) {
        const airRow = airOnly.data[i];
        if (airRow) {
          // Row # is 1-based, matching the Consolidated sheet data rows
          // (header is row 1, first data row is row 2).
          airRows.push([i + 2, ...airRow]);
        }
      }

      const ws2 = XLSX.utils.aoa_to_sheet(airRows);

      // Auto-size
      const airColWidths = [];
      for (const row of airRows.slice(0, 50)) {
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const len = row[c] ? String(row[c]).length : 0;
          airColWidths[c] = Math.min(Math.max(airColWidths[c] || 8, len), 40);
        }
      }
      ws2['!cols'] = airColWidths.map(w => ({ wch: w }));

      XLSX.utils.book_append_sheet(wb, ws2, 'Air-Only Fields');
    }
  }

  XLSX.writeFile(wb, fileName);
}
