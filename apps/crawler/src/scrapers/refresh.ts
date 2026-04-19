import type { RefreshResult } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug, info, warn } from "../logger.js";

const DEFAULT_MAX_WAIT_MINUTES = 20;
const MAX_WAIT_TIME_MS =
  (Number(process.env.MAX_WAIT_MINUTES) || DEFAULT_MAX_WAIT_MINUTES) * 60 * 1000; // default: 20 minutes
const POLL_INTERVAL_MS = 30000; // 30 seconds
const NAVIGATION_RETRY_DELAY_MS = 1000;

export async function navigateToAccountsPage(page: Page): Promise<void> {
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(mfUrls.accounts, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");
      return;
    } catch (err) {
      if (page.isClosed()) {
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("net::ERR_ABORTED") || attempt === MAX_RETRIES) {
        throw err;
      }

      await page.waitForTimeout(NAVIGATION_RETRY_DELAY_MS);
    }
  }
}

async function getUpdatingAccounts(page: Page): Promise<string[]> {
  const rows = page.locator("#account-table tr:has(td.account-status)");
  const count = await rows.count();
  const updatingAccounts: string[] = [];

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const statusCells = row.locator("td.account-status");
    // Multiple td.account-status cells may exist in the same row (e.g., info_msg and normal)
    const allTexts = await statusCells.allTextContents();
    const statusText = allTexts.join(" ");

    // Only count as updating if it exactly matches "更新中"
    if (statusText?.trim() === "更新中") {
      const nameCell = row.locator("td.service a").first();
      const name = await nameCell.textContent();
      if (name) {
        updatingAccounts.push(name.trim());
      }
    }
  }

  return updatingAccounts;
}

async function dismissBlockingModal(page: Page): Promise<boolean> {
  const iframeSelector = 'iframe[title="Modal Message"]';
  const modalFrame = page.frameLocator(iframeSelector);
  const closeCandidates = [
    'button[aria-label="閉じる"]',
    'button[aria-label="Close"]',
    'button:has-text("閉じる")',
    'button:has-text("×")',
    'button:has-text("✕")',
    'button:has-text("X")',
    'a:has-text("閉じる")',
    '[role="button"][aria-label="閉じる"]',
  ];

  for (const selector of closeCandidates) {
    const button = modalFrame.locator(selector).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(500);
        info(`Dismissed blocking modal via selector: ${selector}`);
        return true;
      } catch {
        // Try next candidate
      }
    }
  }

  const iframe = page.locator(iframeSelector).first();
  if (!await iframe.count()) {
    return false;
  }

  const programmaticClose = modalFrame.locator('.ab-programmatic-close-button').first();
  if (await programmaticClose.count()) {
    try {
      await programmaticClose.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      info("Dismissed blocking modal via .ab-programmatic-close-button");
      return true;
    } catch {
      // continue fallback
    }
  }

  const frameCloseButton = modalFrame.locator('.ab-close-button').first();
  if (await frameCloseButton.count()) {
    try {
      await frameCloseButton.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      info("Dismissed blocking modal via .ab-close-button in iframe");
      return true;
    } catch {
      // continue fallback
    }
  }

  try {
    const clicked = await page.evaluate((selector) => {
      const iframe = document.querySelector(selector) as HTMLIFrameElement | null;
      const doc = iframe?.contentDocument;
      if (!doc) return false;

      const button = doc.querySelector('.ab-programmatic-close-button, .ab-close-button') as HTMLElement | null;
      if (button) {
        button.click();
        return true;
      }

      const body = doc.body as HTMLElement | null;
      if (body) {
        body.click();
        return true;
      }

      return false;
    }, iframeSelector);

    if (clicked) {
      await page.waitForTimeout(500);
      info("Dismissed blocking modal via iframe DOM click fallback");
      return true;
    }
  } catch {
    // ignore and continue fallback
  }

  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    if (!await iframe.count()) {
      info("Dismissed blocking modal via Escape");
      return true;
    }
  } catch {
    // ignore and continue fallback
  }

  try {
    const removed = await page.evaluate((selector) => {
      const iframe = document.querySelector(selector);
      if (!iframe) return false;

      const root = iframe.closest('.ab-iam-root, [role="complementary"]');
      if (root instanceof HTMLElement) {
        root.remove();
        return true;
      }

      iframe.remove();
      return true;
    }, iframeSelector);

    if (removed) {
      await page.waitForTimeout(500);
      info("Dismissed blocking modal by removing overlay from DOM");
      return true;
    }
  } catch {
    // ignore and fall through
  }

  warn("Detected blocking modal iframe, but could not dismiss it automatically");
  return false;
}

export async function clickRefreshButton(page: Page): Promise<RefreshResult> {
  debug("Looking for refresh button...");

  // Navigate to home and click refresh button
  await page.goto(mfUrls.home);
  await page.waitForLoadState("networkidle");

  await dismissBlockingModal(page);

  const refreshButton = page.locator('a:has-text("更新")').first();
  try {
    await refreshButton.click({ timeout: 5000 });
  } catch (error) {
    const dismissed = await dismissBlockingModal(page);
    if (!dismissed) {
      throw error;
    }
    await refreshButton.click({ timeout: 5000 });
  }

  info("Refreshing accounts...");

  // Wait for refresh to start
  await page.waitForTimeout(3000);

  // Navigate to accounts page to check update status
  await navigateToAccountsPage(page);

  info("Waiting for all updates to complete on /accounts page...");

  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
    // Count accounts with "更新中" status (exclude cells that also have "正常" - hidden text)
    const statusCells = page.locator("#account-table td.account-status");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    info(`[${elapsed}s] 残り: ${updatingCount}`);

    if (updatingCount === 0) {
      info("All updates completed!");
      return { completed: true, incompleteAccounts: [] };
    }

    // Wait and navigate to accounts page again to get fresh status
    // Using goto instead of reload to avoid ERR_ABORTED when frame is detached
    await page.waitForTimeout(POLL_INTERVAL_MS);
    await navigateToAccountsPage(page);
  }

  // Timeout: get list of accounts still updating
  const incompleteAccounts = await getUpdatingAccounts(page);

  warn(`Max wait time exceeded. ${incompleteAccounts.length} accounts still updating:`);
  for (const account of incompleteAccounts) {
    warn(`  - ${account}`);
  }

  return { completed: false, incompleteAccounts };
}
