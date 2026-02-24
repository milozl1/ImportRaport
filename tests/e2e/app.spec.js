/**
 * Playwright E2E tests for Import Report tool.
 *
 * Tests the full user flow:
 *   1. Select DHL broker
 *   2. Upload Excel files
 *   3. Verify merge & validation results
 *   4. Verify detailed report modal
 *   5. Verify download
 *
 * Run: npx playwright test
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.resolve(__dirname, '../../excel');

// ═══════════════════════════════════════════════════
// 1. App loads and shows broker selection
// ═══════════════════════════════════════════════════

test.describe('App Load', () => {
  test('page loads with title and broker grid', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Import Report/);
    await expect(page.locator('#view-broker')).toBeVisible();
    await expect(page.locator('.broker-card')).not.toHaveCount(0); // At least one broker
  });

  test('DHL broker card is visible with correct label', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.broker-card[data-broker="DHL"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.broker-name')).toContainText('DHL');
  });

  test('breadcrumb shows Broker step active', async ({ page }) => {
    await page.goto('/');
    const brokerStep = page.locator('#breadcrumb [data-step="broker"]');
    await expect(brokerStep).toHaveClass(/active-step/);
  });
});

// ═══════════════════════════════════════════════════
// 2. Broker selection → Upload view
// ═══════════════════════════════════════════════════

test.describe('Broker Selection', () => {
  test('clicking DHL goes to upload view', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();

    // Wait for upload view
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#view-broker')).not.toBeVisible();

    // Broker banner shown
    await expect(page.locator('#active-broker-banner')).toContainText('DHL');
  });

  test('merge button is disabled with no files', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const mergeBtn = page.locator('#btn-merge');
    await expect(mergeBtn).toBeDisabled();
  });

  test('change broker button returns to broker view', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#btn-change-broker').click();
    await expect(page.locator('#view-broker')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════
// 3. File upload
// ═══════════════════════════════════════════════════

test.describe('File Upload', () => {
  test('uploading a file shows it in the file list', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    // Upload file via input
    const filePath = path.join(EXCEL_DIR, 'January 2025.xlsx');
    await page.locator('#file-input').setInputFiles(filePath);

    // File should appear in list
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-name')).toContainText('January 2025.xlsx');

    // Merge button enabled
    await expect(page.locator('#btn-merge')).toBeEnabled();
  });

  test('uploading multiple files shows all in list', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const files = [
      path.join(EXCEL_DIR, 'January 2025.xlsx'),
      path.join(EXCEL_DIR, 'February 2025.xlsx'),
    ];
    await page.locator('#file-input').setInputFiles(files);

    await expect(page.locator('.file-item')).toHaveCount(2);
  });

  test('removing a file updates the list', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const files = [
      path.join(EXCEL_DIR, 'January 2025.xlsx'),
      path.join(EXCEL_DIR, 'February 2025.xlsx'),
    ];
    await page.locator('#file-input').setInputFiles(files);
    await expect(page.locator('.file-item')).toHaveCount(2);

    // Remove first file
    await page.locator('.file-remove').first().click();
    await expect(page.locator('.file-item')).toHaveCount(1);
  });

  test('duplicate file is not added twice', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const filePath = path.join(EXCEL_DIR, 'January 2025.xlsx');
    await page.locator('#file-input').setInputFiles(filePath);
    await expect(page.locator('.file-item')).toHaveCount(1);

    // Upload same file again
    await page.locator('#file-input').setInputFiles(filePath);
    await expect(page.locator('.file-item')).toHaveCount(1);
  });
});

// ═══════════════════════════════════════════════════
// 4. Merge & Validate — Single file
// ═══════════════════════════════════════════════════

test.describe('Merge & Validate — Single File', () => {
  test('merging January 2025 produces correct results', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await expect(page.locator('#btn-merge')).toBeEnabled();

    await page.locator('#btn-merge').click();

    // Wait for results view
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Check header
    await expect(page.locator('#result-header')).toContainText('DHL');
    await expect(page.locator('#result-header')).toContainText('Consolidated Report');

    // Stats row should show data
    const statsRow = page.locator('#stats-row');
    await expect(statsRow).toBeVisible();

    // Total rows stat should show 140 (January has 140 data rows)
    const totalRows = statsRow.locator('.stat-card').first();
    await expect(totalRows.locator('.stat-value')).toContainText('140');
  });

  test('validation panel shows corrections', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Validation panel should exist
    const panel = page.locator('#validation-panel');
    await expect(panel).toBeVisible();

    // Should have corrections (January has 3 shifts + number fixes)
    await expect(panel.locator('.validation-title')).toContainText('corrected');
  });

  test('data preview table renders', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Preview table
    const preview = page.locator('.preview-table');
    await expect(preview).toBeVisible();
    await expect(preview.locator('thead th')).not.toHaveCount(0);
    await expect(preview.locator('tbody tr')).not.toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════
// 5. Merge & Validate — Multiple files
// ═══════════════════════════════════════════════════

test.describe('Merge & Validate — Multiple Files', () => {
  test('merging 3 files produces correct total', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const files = [
      path.join(EXCEL_DIR, 'January 2025.xlsx'),
      path.join(EXCEL_DIR, 'February 2025.xlsx'),
      path.join(EXCEL_DIR, 'March 2025.xlsx'),
    ];
    await page.locator('#file-input').setInputFiles(files);
    await expect(page.locator('.file-item')).toHaveCount(3);

    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Total rows: Jan(140) + Feb(95) + Mar(152) = 387
    const statsRow = page.locator('#stats-row');
    const totalRows = statsRow.locator('.stat-card').first();
    await expect(totalRows.locator('.stat-value')).toContainText('387');

    // Files merged = 3
    const filesMerged = statsRow.locator('.stat-card').nth(1);
    await expect(filesMerged.locator('.stat-value')).toContainText('3');
  });

  test('file breakdown shows all uploaded files', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const files = [
      path.join(EXCEL_DIR, 'January 2025.xlsx'),
      path.join(EXCEL_DIR, 'February 2025.xlsx'),
    ];
    await page.locator('#file-input').setInputFiles(files);
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    const breakdown = page.locator('#file-breakdown');
    await expect(breakdown).toContainText('January 2025');
    await expect(breakdown).toContainText('February 2025');
  });
});

// ═══════════════════════════════════════════════════
// 6. Detailed Report Modal
// ═══════════════════════════════════════════════════

test.describe('Detailed Report Modal', () => {
  test('View Detailed Report button opens modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'November 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Expand validation panel
    await page.locator('#validation-toggle').click();

    // Click View Detailed Report
    const reportBtn = page.locator('#btn-view-report');
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    // Modal should be visible
    await expect(page.locator('#report-modal')).toHaveClass(/active/);
    await expect(page.locator('.modal-title')).toContainText('Validation Report');
  });

  test('modal has summary bar with statistics', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'November 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#validation-toggle').click();
    await page.locator('#btn-view-report').click();

    const summaryBar = page.locator('.report-summary-bar');
    await expect(summaryBar).toBeVisible();
    await expect(summaryBar.locator('.report-summary-stat')).not.toHaveCount(0);
  });

  test('modal has Column Shift Repairs section', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    // November has 3 shift fixes (shipper, mid-row cascade, goods)
    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'November 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#validation-toggle').click();
    await page.locator('#btn-view-report').click();

    // Should have shift repairs section
    const shiftSection = page.locator('.report-section-header').filter({ hasText: 'Column Shift Repairs' });
    await expect(shiftSection).toBeVisible();
  });

  test('modal has Number Format Corrections section', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'November 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#validation-toggle').click();
    await page.locator('#btn-view-report').click();

    const numberSection = page.locator('.report-section-header').filter({ hasText: 'Number Format' });
    await expect(numberSection).toBeVisible();
  });

  test('expanding shift section shows subsections', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'November 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#validation-toggle').click();
    await page.locator('#btn-view-report').click();

    // Click on Column Shift Repairs to expand
    const shiftSection = page.locator('.report-section-header').filter({ hasText: 'Column Shift Repairs' });
    await shiftSection.click();

    // Should show subsections (e.g., Goods Description Overflow)
    const body = shiftSection.locator('~ .report-section-body');
    await expect(body).toHaveClass(/open/);
  });

  test('close button closes modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#validation-toggle').click();
    await page.locator('#btn-view-report').click();
    await expect(page.locator('#report-modal')).toHaveClass(/active/);

    // Close
    await page.locator('#modal-close').click();
    await expect(page.locator('#report-modal')).not.toHaveClass(/active/);
  });

  test('Escape key closes modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#validation-toggle').click();
    await page.locator('#btn-view-report').click();
    await expect(page.locator('#report-modal')).toHaveClass(/active/);

    // Press Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('#report-modal')).not.toHaveClass(/active/);
  });
});

// ═══════════════════════════════════════════════════
// 7. Download functionality
// ═══════════════════════════════════════════════════

test.describe('Download', () => {
  test('download button triggers file download', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Trigger download and capture
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-download').click(),
    ]);

    expect(download.suggestedFilename()).toContain('DHL');
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

// ═══════════════════════════════════════════════════
// 8. Navigation — Back & New Session
// ═══════════════════════════════════════════════════

test.describe('Navigation', () => {
  test('Upload More returns to upload view with files', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#btn-back-upload').click();
    await expect(page.locator('#view-upload')).toBeVisible();
  });

  test('New Session resets to broker selection', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    await page.locator('#btn-new-session').click();
    await expect(page.locator('#view-broker')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════
// 9. Validation correctness — All 12 files
// ═══════════════════════════════════════════════════

test.describe('Validation — All 12 Files', () => {
  test('merging all 12 files: 1536 rows, 0 warnings', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    const files = [
      'January 2025.xlsx', 'February 2025.xlsx', 'March 2025.xlsx',
      'April 2025.xlsx', 'May 2025.xlsx', 'June 2025.xlsx',
      'July 2025.xlsx', 'August 2025.xlsx', 'September 2025.xlsx',
      'October 2025.xlsx', 'November 2025.xlsx', 'December 2025.xlsx',
    ].map(f => path.join(EXCEL_DIR, f));

    await page.locator('#file-input').setInputFiles(files);
    await expect(page.locator('.file-item')).toHaveCount(12);

    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 90000 });

    // Total rows should be 1536
    const statsRow = page.locator('#stats-row');
    const totalRowsStat = statsRow.locator('.stat-card').first().locator('.stat-value');
    await expect(totalRowsStat).toContainText('1,536');

    // Files merged = 12
    const filesMerged = statsRow.locator('.stat-card').nth(1).locator('.stat-value');
    await expect(filesMerged).toContainText('12');

    // Should NOT have a danger warnings card (0 warnings)
    const dangerCards = statsRow.locator('.stat-card.danger');
    await expect(dangerCards).toHaveCount(0);

    // Shifts fixed should be 28
    const shiftCard = statsRow.locator('.stat-card').nth(2).locator('.stat-value');
    await expect(shiftCard).toContainText('28');
  });
});

// ═══════════════════════════════════════════════════
// 10. Toast notifications
// ═══════════════════════════════════════════════════

test.describe('Toast Notifications', () => {
  test('file upload shows success toast', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));

    const toast = page.locator('.toast.success');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText('added');
  });

  test('merge completion shows success toast', async ({ page }) => {
    await page.goto('/');
    await page.locator('.broker-card[data-broker="DHL"]').click();
    await expect(page.locator('#view-upload')).toBeVisible({ timeout: 3000 });

    await page.locator('#file-input').setInputFiles(path.join(EXCEL_DIR, 'January 2025.xlsx'));
    await page.locator('#btn-merge').click();
    await expect(page.locator('#view-result')).toBeVisible({ timeout: 30000 });

    // Should show merge success toast
    const toast = page.locator('.toast.success').last();
    await expect(toast).toContainText('Merged');
  });
});
