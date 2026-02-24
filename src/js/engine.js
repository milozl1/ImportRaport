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
 * Because some header names are **duplicated** (e.g. "Verfahren" at
 * positions 2 and 84, or "Währung" at 6 different positions), the
 * unified header is treated as an ordered list where the same name
 * can appear more than once.  Matching is done in order — the first
 * unmatched occurrence is used — so that duplicates stay aligned.
 *
 * @param {Array<{headers: string[][], fileIdx: number}>} fileParts
 * @param {Object} broker
 * @returns {string[]} unified header row
 */
function buildUnifiedHeader(fileParts, broker) {
  // Find the widest header row.
  let widest = fileParts[0];
  for (const fp of fileParts) {
    if ((fp.headers[0] || []).length > (widest.headers[0] || []).length) {
      widest = fp;
    }
  }

  // Start with a clone of the widest header.
  const unified = [...(widest.headers[0] || [])].map(h =>
    h != null ? String(h).trim() : ''
  );

  const synonyms = broker.headerSynonyms || {};

  // For every other file, check if it has columns NOT in the unified set.
  for (const fp of fileParts) {
    if (fp === widest) continue;
    const hRow = (fp.headers[0] || []).map(h =>
      h != null ? String(h).trim() : ''
    );

    for (let i = 0; i < hRow.length; i++) {
      const name = hRow[i];
      if (!name) continue;
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

  return unified;
}

/**
 * Build a column mapping from a file's header to the unified header.
 *
 * Returns an array where `mapping[fileColIdx] = unifiedColIdx`.
 * Handles duplicates by consuming unified positions in order (first
 * available match).
 *
 * @param {string[]} fileHeader  — this file's header row (strings)
 * @param {string[]} unified     — the unified header row
 * @param {Object}   synonyms    — old-name → new-name map
 * @returns {number[]} mapping array
 */
function buildColumnMapping(fileHeader, unified, synonyms) {
  const mapping = new Array(fileHeader.length).fill(-1);
  // Track which unified positions have been claimed.
  const used = new Set();

  // Pass 1: exact name match (order-preserving for duplicates)
  for (let fi = 0; fi < fileHeader.length; fi++) {
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
    if (mapping[fi] !== -1) continue; // already matched
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

  return mapping;
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

  if (needsAlignment && broker.headerSynonyms) {
    // ── Build unified header and remap all data ──
    if (onProgress) onProgress('Aligning columns across files…');

    const unified = buildUnifiedHeader(fileParts, broker);
    headers = [unified];

    const synonyms = broker.headerSynonyms || {};

    for (const fp of fileParts) {
      const mapping = buildColumnMapping(fp.hRow, unified, synonyms);
      for (const row of fp.data) {
        allData.push(remapRow(row, mapping, unified.length));
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

  return { headers: headers || [], data: allData, stats };
}

/**
 * Generate an Excel workbook from merged data and trigger download.
 */
export function downloadExcel(headers, data, fileName) {
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

  XLSX.writeFile(wb, fileName);
}
