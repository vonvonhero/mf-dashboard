import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prepareRefreshPage } from "../../src/scrapers/refresh.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("refresh page readiness", () => {
  test("実ページで更新ボタンの表示まで準備できる（一括更新は押さない）", async () => {
    // Structure-only coverage of preparation; no refresh click or data crawl.
    await withNewPage(context, async (page) => {
      await prepareRefreshPage(page);
      expect(await page.locator('a:has-text("一括更新")').first().isVisible()).toBe(true);
    });
  });
});
