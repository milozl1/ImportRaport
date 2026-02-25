/**
 * App controller — orchestrates the 3-step UI flow.
 * Step 1: Select broker → Step 2: Upload files → Step 3: Dashboard
 */

import { BROKERS } from './brokers.js';
import { mergeFiles, downloadExcel } from './engine.js';
import { aggregateData, renderCharts, renderKPICards, renderCountryTable, renderHSTable, CHART_INFO } from './analytics.js';

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
  analytics: $('#view-analytics'),
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

  // Scroll to top when switching views
  window.scrollTo(0, 0);
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
  grid.innerHTML = BROKERS.map(b => {
    const caps = (b.capabilities || []).map(c =>
      `<li class="cap-item"><span class="cap-text">${c.text}</span></li>`
    ).join('');
    return `
    <div class="broker-card" data-broker="${b.id}" style="--broker-color:${b.color}; --broker-accent:${b.accent}">
      <div class="broker-logo">${b.logoIcon}</div>
      <div class="broker-name">${b.label}</div>
      <div class="broker-tag">${b.headerRows} header row${b.headerRows > 1 ? 's' : ''}</div>
      <div class="broker-capabilities">
        <div class="cap-title">What this module does</div>
        <ul class="cap-list">${caps}</ul>
      </div>
    </div>
  `;
  }).join('');

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

  // Categorize issues for the summary badges
  const shiftIssues = issues.filter(i => i.type === 'shift');
  const numberIssues = issues.filter(i => i.type === 'number');
  const warningIssues = issues.filter(i => i.type === 'warning');

  // Sub-categorize shifts
  const shipperShifts = shiftIssues.filter(i => (i.zone || '').includes('Shipper'));
  const consigneeShifts = shiftIssues.filter(i => (i.zone || '').includes('Consignee'));
  const midRowShifts = shiftIssues.filter(i => (i.detail || '').includes('Mid-row'));
  const goodsShifts = shiftIssues.filter(i => (i.zone || '').includes('Goods'));

  const midRowShifts2 = shiftIssues.filter(i => (i.zone || '') === 'Mid-row');
  const goodsShifts2 = shiftIssues.filter(i => (i.zone || '') === 'Goods');

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
        ${shipperShifts.length > 0 ? `<span class="v-badge shift" style="opacity:0.8;font-size:0.72rem">${shipperShifts.length} shipper</span>` : ''}
        ${consigneeShifts.length > 0 ? `<span class="v-badge shift" style="opacity:0.8;font-size:0.72rem">${consigneeShifts.length} consignee</span>` : ''}
        ${midRowShifts2.length > 0 ? `<span class="v-badge shift" style="opacity:0.8;font-size:0.72rem">${midRowShifts2.length} mid-row</span>` : ''}
        ${goodsShifts2.length > 0 ? `<span class="v-badge shift" style="opacity:0.8;font-size:0.72rem">${goodsShifts2.length} goods zone</span>` : ''}
        ${numberCount > 0 ? `<span class="v-badge number">${IC.hash} ${numberCount.toLocaleString()} number format${numberCount > 1 ? 's' : ''} fixed</span>` : ''}
        ${warnCount > 0 ? `<span class="v-badge warn">${IC.alert} ${warnCount} warning${warnCount > 1 ? 's' : ''}</span>` : ''}
        ${!hasIssues ? `<span class="v-badge number">${IC.check} Clean data — no corrections needed</span>` : ''}
      </div>
      ${hasIssues ? `<button class="btn-view-report" id="btn-view-report">${IC.list} View Detailed Report</button>` : ''}
    </div>
  `;

  // Toggle expand/collapse
  const toggle = $('#validation-toggle');
  const body = $('#validation-body');
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    body.classList.toggle('open');
  });

  // Open modal on click
  if (hasIssues) {
    $('#btn-view-report').addEventListener('click', () => openReportModal(v));
  }
}

/* ───────────────────────────────────────────────
   Detailed Report Modal
   ─────────────────────────────────────────────── */

function openReportModal(v) {
  const modal = $('#report-modal');
  const body = $('#modal-body');
  const issues = v.issues || [];

  const shiftIssues = issues.filter(i => i.type === 'shift');
  const numberIssues = issues.filter(i => i.type === 'number');
  const warningIssues = issues.filter(i => i.type === 'warning');

  // Sub-categorize shifts
  const shipperShifts = shiftIssues.filter(i => (i.zone || '').includes('Shipper'));
  const consigneeShifts = shiftIssues.filter(i => (i.zone || '').includes('Consignee'));
  const midRowShifts = shiftIssues.filter(i => (i.zone || '') === 'Mid-row');
  const goodsShifts = shiftIssues.filter(i => (i.zone || '') === 'Goods');
  const otherShifts = shiftIssues.filter(i =>
    !(i.zone || '').includes('Shipper') &&
    !(i.zone || '').includes('Consignee') &&
    (i.zone || '') !== 'Mid-row' &&
    (i.zone || '') !== 'Goods'
  );

  body.innerHTML = `
    ${renderSummaryBar(v)}
    ${shiftIssues.length > 0 ? renderShiftSection(shipperShifts, consigneeShifts, midRowShifts, goodsShifts, otherShifts) : ''}
    ${numberIssues.length > 0 ? renderNumberSection(numberIssues) : ''}
    ${warningIssues.length > 0 ? renderWarningSection(warningIssues) : ''}
  `;

  // Attach section toggles
  body.querySelectorAll('.report-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('open');
      const sBody = header.nextElementSibling;
      if (sBody) sBody.classList.toggle('open');
    });
  });

  modal.classList.add('active');
}

function closeReportModal() {
  $('#report-modal').classList.remove('active');
}

function renderSummaryBar(v) {
  const issues = v.issues || [];
  const warnCount = issues.filter(i => i.type === 'warning').length;
  const shiftRows = new Set(issues.filter(i => i.type === 'shift').map(i => i.row)).size;

  return `
    <div class="report-summary-bar">
      <div class="report-summary-stat">
        <div class="stat-num shift">${v.shiftFixes || 0}</div>
        <div class="stat-label">Shift Fixes</div>
      </div>
      <div class="report-summary-stat">
        <div class="stat-num">${shiftRows}</div>
        <div class="stat-label">Rows Shifted</div>
      </div>
      <div class="report-summary-stat">
        <div class="stat-num number">${(v.numberFixes || 0).toLocaleString()}</div>
        <div class="stat-label">Number Fixes</div>
      </div>
      <div class="report-summary-stat">
        <div class="stat-num ${warnCount > 0 ? 'warn' : 'clean'}">${warnCount}</div>
        <div class="stat-label">Warnings</div>
      </div>
      <div class="report-summary-stat">
        <div class="stat-num clean">${v.totalIssues || 0}</div>
        <div class="stat-label">Total Corrections</div>
      </div>
    </div>
  `;
}

function renderShiftSection(shipperShifts, consigneeShifts, midRowShifts, goodsShifts, otherShifts) {
  const total = shipperShifts.length + consigneeShifts.length + midRowShifts.length + goodsShifts.length + otherShifts.length;

  let subsections = '';

  if (shipperShifts.length > 0) {
    subsections += `
      <div class="report-subsection">
        <div class="report-subsection-title">
          Shipper Address Overflow <span class="sub-count">${shipperShifts.length}</span>
        </div>
        <div class="report-subsection-desc" style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px">
          The shipper address field overflowed into adjacent columns, pushing Town/Postcode/Country right. Merged address fragments and realigned the row.
        </div>
        ${renderIssuesList(shipperShifts)}
      </div>
    `;
  }

  if (consigneeShifts.length > 0) {
    subsections += `
      <div class="report-subsection">
        <div class="report-subsection-title">
          Consignee Address Overflow <span class="sub-count">${consigneeShifts.length}</span>
        </div>
        <div class="report-subsection-desc" style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px">
          The consignee address overflowed into adjacent columns. Merged fragments and shifted subsequent columns back into alignment.
        </div>
        ${renderIssuesList(consigneeShifts)}
      </div>
    `;
  }

  if (midRowShifts.length > 0) {
    subsections += `
      <div class="report-subsection">
        <div class="report-subsection-title">
          Delivery Location Overflow <span class="sub-count">${midRowShifts.length}</span>
        </div>
        <div class="report-subsection-desc" style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px">
          The delivery location field (col 32) overflowed, pushing freight, weight, and all downstream columns right. Merged location text and realigned the entire row.
        </div>
        ${renderIssuesList(midRowShifts)}
      </div>
    `;
  }

  if (goodsShifts.length > 0) {
    subsections += `
      <div class="report-subsection">
        <div class="report-subsection-title">
          Goods Description Overflow <span class="sub-count">${goodsShifts.length}</span>
        </div>
        <div class="report-subsection-desc" style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px">
          The goods description spanned multiple cells, pushing HS Code, Country of Origin, and other fields right. Merged description fragments and realigned HS Code to col 110.
        </div>
        ${renderIssuesList(goodsShifts)}
      </div>
    `;
  }

  if (otherShifts.length > 0) {
    subsections += `
      <div class="report-subsection">
        <div class="report-subsection-title">
          Other Shifts <span class="sub-count">${otherShifts.length}</span>
        </div>
        ${renderIssuesList(otherShifts)}
      </div>
    `;
  }

  return `
    <div class="report-section">
      <div class="report-section-header">
        <div class="section-icon shift-icon">${IC.shift}</div>
        <div class="section-title-text">Column Shift Repairs</div>
        <div class="section-count">${total} fix${total !== 1 ? 'es' : ''}</div>
        <svg class="section-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="report-section-body">
        ${subsections}
      </div>
    </div>
  `;
}

function renderNumberSection(numberIssues) {
  // Group by column for better organization
  const byCol = {};
  for (const iss of numberIssues) {
    const colMatch = (iss.detail || '').match(/Col (\d+)/);
    const col = colMatch ? `Col ${colMatch[1]}` : 'Other';
    if (!byCol[col]) byCol[col] = [];
    byCol[col].push(iss);
  }

  const colEntries = Object.entries(byCol).sort((a, b) => a[1].length - b[1].length);
  const MAX_DISPLAY = 50;
  let displayed = 0;

  let subsections = '';
  for (const [col, items] of colEntries) {
    const remaining = MAX_DISPLAY - displayed;
    if (remaining <= 0) break;
    const toShow = items.slice(0, remaining);
    displayed += toShow.length;
    subsections += `
      <div class="report-subsection">
        <div class="report-subsection-title">
          ${col} <span class="sub-count">${items.length} fix${items.length !== 1 ? 'es' : ''}</span>
        </div>
        ${renderIssuesList(toShow)}
        ${items.length > toShow.length ? `<div style="font-size:0.72rem;color:var(--text-dim);padding-top:4px">… and ${items.length - toShow.length} more in this column</div>` : ''}
      </div>
    `;
  }

  return `
    <div class="report-section">
      <div class="report-section-header">
        <div class="section-icon number-icon">${IC.hash}</div>
        <div class="section-title-text">Number Format Corrections</div>
        <div class="section-count">${numberIssues.length.toLocaleString()} fix${numberIssues.length !== 1 ? 'es' : ''}</div>
        <svg class="section-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="report-section-body">
        <div class="report-subsection">
          <div class="report-subsection-desc" style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px">
            European number formats (comma decimal separator, leading comma/dot) were converted to standard decimal format. Affected ${Object.keys(byCol).length} column${Object.keys(byCol).length !== 1 ? 's' : ''}.
          </div>
        </div>
        ${subsections}
        ${numberIssues.length > MAX_DISPLAY ? `<div style="padding:12px 16px;font-size:0.72rem;color:var(--text-dim)">Showing ${MAX_DISPLAY} of ${numberIssues.length.toLocaleString()} number fixes. All corrections applied successfully.</div>` : ''}
      </div>
    </div>
  `;
}

function renderWarningSection(warningIssues) {
  return `
    <div class="report-section">
      <div class="report-section-header open">
        <div class="section-icon warn-icon">${IC.alert}</div>
        <div class="section-title-text">Warnings — Manual Review Recommended</div>
        <div class="section-count">${warningIssues.length}</div>
        <svg class="section-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="report-section-body open">
        <div class="report-subsection">
          <div class="report-subsection-desc" style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px">
            These issues could not be automatically corrected. Please review the affected rows in the output file.
          </div>
          ${renderIssuesList(warningIssues)}
        </div>
      </div>
    </div>
  `;
}

function renderIssuesList(issues) {
  return issues.map(iss => {
    // Format the detail nicely — highlight values in code tags
    let detail = iss.detail || '';
    detail = detail.replace(/"([^"]*)"/g, '<code>$1</code>');
    detail = detail.replace(/→/g, ' → ');

    return `
      <div class="report-issue">
        <span class="issue-row">Row ${iss.row}</span>
        <span class="issue-detail">${detail}</span>
      </div>
    `;
  }).join('');
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
  downloadExcel(mergedResult.headers, mergedResult.data, fileName, mergedResult.airOnly);
  toast('Download started', 'success');
}

/* ───────────────────────────────────────────────
   Chart Info Modal
   ─────────────────────────────────────────────── */

function openChartInfo(chartId) {
  const info = CHART_INFO[chartId];
  if (!info) return;

  $('#chart-info-title').textContent = info.title;

  const body = info.sections.map((s) => {
    let content = '';
    if (s.text) {
      content = `<p>${s.text}</p>`;
    }
    if (s.list) {
      content += '<ul>' + s.list.map((li) => `<li>${li}</li>`).join('') + '</ul>';
    }
    return `
      <div class="chart-info-section">
        <h4>${s.heading}</h4>
        ${content}
      </div>
    `;
  }).join('');

  $('#chart-info-body').innerHTML = body;
  $('#chart-info-modal').classList.add('active');
}

function closeChartInfo() {
  $('#chart-info-modal').classList.remove('active');
}

/* ───────────────────────────────────────────────
   Analytics handler
   ─────────────────────────────────────────────── */

function handleOpenAnalytics() {
  if (!mergedResult || !selectedBroker) return;

  showLoading('Analyzing data…');

  // Small delay to let the loading overlay appear
  setTimeout(() => {
    try {
      const analytics = aggregateData(mergedResult.headers, mergedResult.data, selectedBroker.id);
      if (!analytics) {
        hideLoading();
        toast('Analytics not available for this broker', 'error');
        return;
      }

      renderAnalyticsDashboard(analytics);
      hideLoading();
      showView('analytics');
      toast('Analytics dashboard ready', 'success');
    } catch (err) {
      hideLoading();
      toast('Analytics failed: ' + err.message, 'error');
      console.error(err);
    }
  }, 50);
}

function renderAnalyticsDashboard(analytics) {
  const b = selectedBroker;

  // Header
  $('#analytics-header').innerHTML = `
    <div class="broker-logo-lg">${b.logoIcon}</div>
    <div class="result-info">
      <h2>${b.label} — Import Analytics</h2>
      <p>${analytics.totalRows.toLocaleString()} declarations analyzed · ${analytics.kpis.monthsCovered} month${analytics.kpis.monthsCovered !== 1 ? 's' : ''} · ${analytics.kpis.uniqueCountries} countr${analytics.kpis.uniqueCountries !== 1 ? 'ies' : 'y'}</p>
    </div>
  `;

  // KPI cards — inject header with info button + card grid
  const kpiInfoBtn = `<button class="chart-info-btn" data-chart="kpis" title="About these metrics">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  </button>`;
  $('#analytics-kpis').innerHTML = `
    <div class="chart-header kpi-section-header">
      <h3 class="table-section-title">Key Performance Indicators</h3>
      ${kpiInfoBtn}
    </div>
    ${renderKPICards(analytics.kpis)}
  `;

  // Country & HS tables
  $('#analytics-country-table').innerHTML = renderCountryTable(analytics.countries);
  $('#analytics-hs-table').innerHTML = renderHSTable(analytics.hsChapters);

  // Charts (needs a brief delay for canvases to be in DOM)
  requestAnimationFrame(() => {
    renderCharts(analytics);
  });
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

  // Analytics buttons
  $('#btn-analytics').addEventListener('click', handleOpenAnalytics);
  $('#btn-back-result').addEventListener('click', () => showView('result'));
  $('#btn-download-analytics').addEventListener('click', handleDownload);
  $('#btn-new-session-analytics').addEventListener('click', () => {
    selectedBroker = null;
    uploadedFiles = [];
    mergedResult = null;
    showView('broker');
  });

  // Modal close (report)
  $('#modal-close').addEventListener('click', closeReportModal);
  $('#report-modal').addEventListener('click', (e) => {
    if (e.target === $('#report-modal')) closeReportModal();
  });

  // Chart info modal — delegated click handler
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.chart-info-btn');
    if (btn) {
      const chartId = btn.getAttribute('data-chart');
      if (chartId) openChartInfo(chartId);
    }
  });

  // Chart info modal — close handlers
  $('#chart-info-close').addEventListener('click', closeChartInfo);
  $('#chart-info-modal').addEventListener('click', (e) => {
    if (e.target === $('#chart-info-modal')) closeChartInfo();
  });

  // Escape key — close whichever modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#chart-info-modal').classList.contains('active')) closeChartInfo();
      else if ($('#report-modal').classList.contains('active')) closeReportModal();
    }
  });
}

init();
