/**
 * App controller — orchestrates the 3-step UI flow.
 * Step 1: Select broker → Step 2: Upload files → Step 3: Dashboard
 */

import '../css/styles.css';
import { BROKERS } from './brokers.js';
import { mergeFiles, downloadExcel } from './engine.js';

/* ───────────────────────────────────────────────
   State
   ─────────────────────────────────────────────── */

let selectedBroker = null;
let uploadedFiles = [];
let mergedResult = null;   // { headers, data, stats }

/* ───────────────────────────────────────────────
   DOM refs
   ─────────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);
const views = {
  broker: $('#view-broker'),
  upload: $('#view-upload'),
  result: $('#view-result'),
};

/* ───────────────────────────────────────────────
   Icons (inline SVG snippets)
   ─────────────────────────────────────────────── */

const IC = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  chevDown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  fileOk: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 15 12 17 16 13"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  table: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  shift: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 4 19 4 19 8"/><line x1="14" y1="10" x2="19" y2="4"/><polyline points="9 20 5 20 5 16"/><line x1="10" y1="14" x2="5" y2="20"/></svg>`,
  hash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9 10.5 14.5 8 12"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  list: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
};

/* ───────────────────────────────────────────────
   Navigation
   ─────────────────────────────────────────────── */

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');

  // Update breadcrumb
  document.querySelectorAll('#breadcrumb [data-step]').forEach(el => {
    el.classList.toggle('active-step', el.dataset.step === name);
  });
}

/* ───────────────────────────────────────────────
   Toast
   ─────────────────────────────────────────────── */

function toast(msg, type = 'info') {
  const icon = type === 'success' ? IC.success : type === 'error' ? IC.error : IC.info;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon}<span>${msg}</span>`;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ───────────────────────────────────────────────
   Loading
   ─────────────────────────────────────────────── */

function showLoading(msg) {
  $('#loading-text').textContent = msg;
  $('#loading-overlay').classList.add('active');
}

function hideLoading() {
  $('#loading-overlay').classList.remove('active');
}

/* ───────────────────────────────────────────────
   Step 1 — Broker Grid
   ─────────────────────────────────────────────── */

function renderBrokerGrid() {
  const grid = $('#broker-grid');
  grid.innerHTML = BROKERS.map(b => `
    <div class="broker-card" data-broker="${b.id}" style="--broker-color:${b.color}; --broker-accent:${b.accent}">
      <div class="broker-logo">${b.logoIcon}</div>
      <div class="broker-name">${b.label}</div>
      <div class="broker-tag">${b.headerRows} header row${b.headerRows > 1 ? 's' : ''}</div>
    </div>
  `).join('');

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.broker-card');
    if (!card) return;
    const id = card.dataset.broker;
    selectedBroker = BROKERS.find(b => b.id === id);
    if (!selectedBroker) return;

    // Visual selection
    grid.querySelectorAll('.broker-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    card.style.borderColor = selectedBroker.color;

    // After brief delay, go to upload
    setTimeout(() => {
      renderActiveBrokerBanner();
      showView('upload');
    }, 200);
  });
}

/* ───────────────────────────────────────────────
   Step 2 — Upload
   ─────────────────────────────────────────────── */

function renderActiveBrokerBanner() {
  if (!selectedBroker) return;
  const b = selectedBroker;
  $('#active-broker-banner').innerHTML = `
    <div class="broker-logo-sm">${b.logoIcon}</div>
    <div class="broker-info">
      <h3>${b.label}</h3>
      <p>${b.headerRows} header row${b.headerRows > 1 ? 's' : ''} · Data starts at row ${b.dataStartRow + 1}</p>
    </div>
    <button class="btn-change" id="btn-change-broker">Change</button>
  `;
  $('#btn-change-broker').addEventListener('click', () => {
    uploadedFiles = [];
    renderFileList();
    showView('broker');
  });
}

function renderFileList() {
  const list = $('#file-list');
  if (!uploadedFiles.length) {
    list.innerHTML = '';
    $('#btn-merge').disabled = true;
    return;
  }

  list.innerHTML = uploadedFiles.map((f, i) => `
    <div class="file-item" data-idx="${i}">
      <span class="file-icon">${IC.fileOk}</span>
      <span class="file-name">${f.name}</span>
      <span class="file-size">${formatSize(f.size)}</span>
      <button class="file-remove" data-idx="${i}" title="Remove">${IC.x}</button>
    </div>
  `).join('');

  list.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx);
      uploadedFiles.splice(idx, 1);
      renderFileList();
    });
  });

  $('#btn-merge').disabled = false;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function setupUpload() {
  const dropZone = $('#drop-zone');
  const fileInput = $('#file-input');

  ['dragenter', 'dragover'].forEach(e =>
    dropZone.addEventListener(e, (ev) => { ev.preventDefault(); dropZone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach(e =>
    dropZone.addEventListener(e, () => dropZone.classList.remove('dragover'))
  );

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
}

function addFiles(fileList) {
  const existing = new Set(uploadedFiles.map(f => f.name));
  let added = 0;
  for (const f of fileList) {
    if (existing.has(f.name)) continue;
    uploadedFiles.push(f);
    added++;
  }
  if (added > 0) {
    toast(`${added} file${added > 1 ? 's' : ''} added`, 'success');
    renderFileList();
  }
}

/* ───────────────────────────────────────────────
   Step 3 — Results Dashboard
   ─────────────────────────────────────────────── */

function renderDashboard() {
  if (!mergedResult || !selectedBroker) return;
  const { headers, data, stats } = mergedResult;
  const b = selectedBroker;
  const v = stats.validation || {};

  // ── Header ──
  $('#result-header').innerHTML = `
    <div class="broker-logo-lg">${b.logoIcon}</div>
    <div class="result-info">
      <h2>${b.label} — Consolidated Report</h2>
      <p>${stats.totalFiles} file${stats.totalFiles !== 1 ? 's' : ''} merged · ${stats.totalRows.toLocaleString()} data rows · ${new Date().toLocaleDateString('en-GB')}</p>
    </div>
  `;

  // ── Stats cards ──
  const warns = (v.issues || []).filter(i => i.type === 'warning').length;
  $('#stats-row').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-value">${stats.totalRows.toLocaleString()}</div>
      <div class="stat-label">Total Rows</div>
    </div>
    <div class="stat-card success">
      <div class="stat-value">${stats.totalFiles}</div>
      <div class="stat-label">Files Merged</div>
    </div>
    <div class="stat-card ${v.shiftFixes > 0 ? 'warning' : 'success'}">
      <div class="stat-value">${v.shiftFixes || 0}</div>
      <div class="stat-label">Shifts Fixed</div>
    </div>
    <div class="stat-card ${v.numberFixes > 0 ? 'warning' : 'success'}">
      <div class="stat-value">${(v.numberFixes || 0).toLocaleString()}</div>
      <div class="stat-label">Number Fixes</div>
    </div>
    ${warns > 0 ? `<div class="stat-card danger"><div class="stat-value">${warns}</div><div class="stat-label">Warnings</div></div>` : ''}
  `;

  // ── Validation panel ──
  renderValidationPanel(v);

  // ── File breakdown ──
  renderFileBreakdown(stats);

  // ── Data preview ──
  renderPreviewTable(headers, data);
}

function renderValidationPanel(v) {
  const panel = $('#validation-panel');
  const issues = v.issues || [];
  const hasIssues = issues.length > 0;
  const shiftCount = v.shiftFixes || 0;
  const numberCount = v.numberFixes || 0;
  const warnCount = issues.filter(i => i.type === 'warning').length;

  const statusClass = hasIssues ? 'fixed' : 'clean';
  const statusIcon = hasIssues ? IC.alert : IC.check;
  const statusText = hasIssues ? 'Data corrected automatically' : 'All data validated — no issues';

  panel.innerHTML = `
    <div class="validation-header" id="validation-toggle">
      <div class="status-icon ${statusClass}">${statusIcon}</div>
      <div class="validation-title">${statusText}</div>
      <div class="validation-summary">${v.totalIssues || 0} corrections</div>
      <div class="chevron">${IC.chevDown}</div>
    </div>
    <div class="validation-body" id="validation-body">
      <div class="validation-badges">
        ${shiftCount > 0 ? `<span class="v-badge shift">${IC.shift} ${shiftCount} shifted row${shiftCount > 1 ? 's' : ''} realigned</span>` : ''}
        ${numberCount > 0 ? `<span class="v-badge number">${IC.hash} ${numberCount.toLocaleString()} number format${numberCount > 1 ? 's' : ''} fixed</span>` : ''}
        ${warnCount > 0 ? `<span class="v-badge warn">${IC.alert} ${warnCount} warning${warnCount > 1 ? 's' : ''}</span>` : ''}
        ${!hasIssues ? `<span class="v-badge number">${IC.check} Clean data — no corrections needed</span>` : ''}
      </div>
      ${hasIssues ? renderIssuesTable(issues) : ''}
    </div>
  `;

  // Toggle
  const toggle = $('#validation-toggle');
  const body = $('#validation-body');
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    body.classList.toggle('open');
  });
}

function renderIssuesTable(issues) {
  // Group by type, show max 200
  const limited = issues.slice(0, 200);
  const rows = limited.map(iss => `
    <tr>
      <td class="row-num">${iss.row}</td>
      <td><span class="type-tag ${iss.type}">${iss.type}</span></td>
      <td>${iss.zone || '—'}</td>
      <td>${iss.detail}</td>
    </tr>
  `).join('');

  return `
    <div class="validation-table-wrapper">
      <table class="validation-table">
        <thead><tr><th>Row</th><th>Type</th><th>Zone</th><th>Detail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${issues.length > 200 ? `<div style="padding:10px 16px;font-size:0.75rem;color:var(--text-muted)">Showing 200 of ${issues.length} issues</div>` : ''}
  `;
}

function renderFileBreakdown(stats) {
  const rows = stats.rowsPerFile.map(f => `
    <tr>
      <td>${f.name}</td>
      <td class="mono">${f.rows.toLocaleString()}</td>
    </tr>
  `).join('');

  const skippedRows = (stats.skippedFiles || []).map(f => `
    <tr>
      <td style="color:var(--danger)">${f.name}</td>
      <td style="color:var(--danger);font-size:0.75rem">${f.error}</td>
    </tr>
  `).join('');

  $('#file-breakdown').innerHTML = `
    <h3>${IC.list} File Breakdown</h3>
    <table class="breakdown-table">
      <thead><tr><th>File</th><th>Rows</th></tr></thead>
      <tbody>${rows}${skippedRows}</tbody>
    </table>
  `;
}

function renderPreviewTable(headers, data) {
  const maxCols = 30;
  const maxRows = 20;
  const displayHeaders = (headers[0] || []).slice(0, maxCols);
  const displayData = data.slice(0, maxRows);

  const ths = `<th>#</th>` + displayHeaders.map((h, i) => `<th title="Col ${i}">${h ?? `Col ${i}`}</th>`).join('');
  const trs = displayData.map((row, r) => {
    const tds = `<td class="row-idx">${r + 1}</td>` +
      displayHeaders.map((_, c) => `<td>${row[c] ?? ''}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  $('#preview-section').innerHTML = `
    <h3>${IC.table} Data Preview <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem">(first ${maxRows} rows, ${maxCols} columns)</span></h3>
    <div class="preview-wrapper">
      <table class="preview-table">
        <thead><tr>${ths}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}

/* ───────────────────────────────────────────────
   Merge handler
   ─────────────────────────────────────────────── */

async function handleMerge() {
  if (!selectedBroker || !uploadedFiles.length) return;

  showLoading('Parsing files…');

  try {
    mergedResult = await mergeFiles(uploadedFiles, selectedBroker, (msg) => {
      $('#loading-text').textContent = msg;
    });

    hideLoading();
    renderDashboard();
    showView('result');
    toast(`Merged ${mergedResult.stats.totalRows.toLocaleString()} rows from ${mergedResult.stats.totalFiles} file${mergedResult.stats.totalFiles > 1 ? 's' : ''}`, 'success');
  } catch (err) {
    hideLoading();
    toast('Merge failed: ' + err.message, 'error');
    console.error(err);
  }
}

/* ───────────────────────────────────────────────
   Download handler
   ─────────────────────────────────────────────── */

function handleDownload() {
  if (!mergedResult) return;
  const fileName = `${selectedBroker.label}_Consolidated_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadExcel(mergedResult.headers, mergedResult.data, fileName);
  toast('Download started', 'success');
}

/* ───────────────────────────────────────────────
   Init
   ─────────────────────────────────────────────── */

function init() {
  renderBrokerGrid();
  setupUpload();

  // Navigation buttons
  $('#btn-back-broker').addEventListener('click', () => {
    uploadedFiles = [];
    renderFileList();
    showView('broker');
  });

  $('#btn-merge').addEventListener('click', handleMerge);
  $('#btn-download').addEventListener('click', handleDownload);

  $('#btn-back-upload').addEventListener('click', () => showView('upload'));
  $('#btn-new-session').addEventListener('click', () => {
    selectedBroker = null;
    uploadedFiles = [];
    mergedResult = null;
    showView('broker');
  });
}

init();
