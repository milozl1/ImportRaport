/**
 * Simple merge engine.
 * Takes multiple files for the same broker, extracts the data rows,
 * and returns { headerRows, dataRows } — one consolidated table.
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { validateAndFix, reportSummary } from './validator.js';

/**
 * Parse a single file into an array-of-arrays.
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || ext === 'tsv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        skipEmptyLines: false,
        complete: (r) => resolve(r.data),
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });
  // Return the first sheet as array-of-arrays
  const ws = wb.Sheets[wb.SheetNames[0]];
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
 */
export async function mergeFiles(files, broker, onProgress) {
  const allData = [];
  let headers = null;
  const stats = { totalFiles: files.length, rowsPerFile: [], totalRows: 0, skippedFiles: [] };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) onProgress(`Parsing ${file.name}... (${i + 1}/${files.length})`);

    try {
      const rows = await parseFile(file);
      const parts = extractParts(rows, broker);

      // Keep headers from the first file only
      if (!headers) {
        headers = parts.headers;
      }

      allData.push(...parts.data);
      stats.rowsPerFile.push({ name: file.name, rows: parts.data.length });
      stats.totalRows += parts.data.length;
    } catch (err) {
      console.error(`Failed to parse ${file.name}:`, err);
      stats.skippedFiles.push({ name: file.name, error: err.message });
    }
  }

  // ── Data Validation & Correction ──
  if (onProgress) onProgress('Validating & correcting data…');
  const validationReport = validateAndFix(allData, broker);
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
