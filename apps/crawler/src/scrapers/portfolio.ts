import type { Portfolio, PortfolioItem } from "@mf-dashboard/db/types";
import type { Locator, Page } from "playwright";
import { ASSET_CATEGORIES } from "@mf-dashboard/meta/categories";
import { mfUrls } from "@mf-dashboard/meta/urls";
import { debug } from "../logger.js";
import { parseDecimalNumber, parseJapaneseNumber, parsePercentage } from "../parsers.js";

// Asset category constants
const POINT =
  ASSET_CATEGORIES.find((category) => category === "ポイント・マイル") ?? "ポイント・マイル";
const UNKNOWN_CATEGORY = "不明";
const FX_CATEGORY = ASSET_CATEGORIES.find((category) => category === "FX") ?? "FX";

// Column indices for each table type
const CELL_TIMEOUT = 1000;

const DEPOSIT_COLUMNS = { NAME: 0, BALANCE: 1, INSTITUTION: 2 } as const;
const STOCK_COLUMNS = {
  CODE: 0,
  NAME: 1,
  QUANTITY: 2,
  AVG_COST: 3,
  UNIT_PRICE: 4,
  BALANCE: 5,
  DAILY_CHANGE: 6,
  UNREALIZED_GAIN: 7,
  UNREALIZED_GAIN_PCT: 8,
  INSTITUTION: 9,
} as const;
const FUND_COLUMNS = {
  NAME: 0,
  QUANTITY: 1,
  AVG_COST: 2,
  UNIT_PRICE: 3,
  BALANCE: 4,
  DAILY_CHANGE: 5,
  UNREALIZED_GAIN: 6,
  UNREALIZED_GAIN_PCT: 7,
  INSTITUTION: 8,
} as const;
// Insurance and Pension share the same 8-column structure
const INSURANCE_PENSION_COLUMNS = {
  NAME: 0,
  AVG_COST: 1,
  BALANCE: 2,
  UNREALIZED_GAIN: 3,
  UNREALIZED_GAIN_PCT: 4,
} as const;
const POINT_COLUMNS = { NAME: 0, BALANCE: 4, INSTITUTION: 6 } as const;
const FX_BALANCE_COLUMNS = { INSTITUTION: 0, NAME: 1, BALANCE: 2 } as const;
const FX_POSITION_COLUMNS = {
  PAIR: 0,
  QUANTITY: 1,
  CONTRACT_RATE: 2,
  CURRENT_RATE: 3,
  UNREALIZED_GAIN: 4,
  INSTITUTION: 5,
} as const;

// Helper functions
async function getCellText(cells: Locator, index: number, defaultValue = ""): Promise<string> {
  try {
    const text = await cells.nth(index).textContent({ timeout: CELL_TIMEOUT });
    return text?.trim() || defaultValue;
  } catch {
    return defaultValue;
  }
}

async function getInstitutionFromCell(cells: Locator, index: number): Promise<string> {
  const cell = cells.nth(index);
  const link = cell.locator("a").first();

  try {
    if ((await link.count()) > 0) {
      const text = await link.textContent({ timeout: CELL_TIMEOUT });
      return text?.trim() || "";
    }
    const text = await cell.textContent({ timeout: CELL_TIMEOUT });
    return text?.trim() || "";
  } catch {
    return "";
  }
}

// Parse deposits from .table-depo
async function parseDeposits(page: Page): Promise<PortfolioItem[]> {
  const rows = page.locator("#portfolio_det_depo table.table-depo tbody tr");
  const count = await rows.count();
  const items: PortfolioItem[] = [];

  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator("td");
    // 並列取得
    const [name, institution, balanceText] = await Promise.all([
      getCellText(cells, DEPOSIT_COLUMNS.NAME),
      getInstitutionFromCell(cells, DEPOSIT_COLUMNS.INSTITUTION),
      getCellText(cells, DEPOSIT_COLUMNS.BALANCE, "0"),
    ]);
    if (!name) continue;

    items.push({
      name,
      type: "預金・現金・暗号資産",
      institution,
      balance: parseJapaneseNumber(balanceText),
    });
  }
  return items;
}

// Parse FX balances from #portfolio_det_fx
async function parseFx(page: Page): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];

  // FX balance table uses table-depo class but has different column order from deposits.
  const balanceRows = page.locator("#portfolio_det_fx table.table-depo tbody tr");
  const balanceCount = await balanceRows.count();
  for (let i = 0; i < balanceCount; i++) {
    const cells = balanceRows.nth(i).locator("td");
    const [name, institution, balanceText] = await Promise.all([
      getCellText(cells, FX_BALANCE_COLUMNS.NAME),
      getCellText(cells, FX_BALANCE_COLUMNS.INSTITUTION),
      getCellText(cells, FX_BALANCE_COLUMNS.BALANCE, "0"),
    ]);
    if (!name) continue;

    items.push({
      name,
      type: FX_CATEGORY,
      institution,
      balance: parseJapaneseNumber(balanceText),
    });
  }

  const positionRows = page.locator("#portfolio_det_fx table.table-fx tbody tr");
  const positionCount = await positionRows.count();
  for (let i = 0; i < positionCount; i++) {
    const cells = positionRows.nth(i).locator("td");
    const [name, institution, quantityText, contractRateText, currentRateText, unrealizedGainText] =
      await Promise.all([
        getCellText(cells, FX_POSITION_COLUMNS.PAIR),
        getCellText(cells, FX_POSITION_COLUMNS.INSTITUTION),
        getCellText(cells, FX_POSITION_COLUMNS.QUANTITY),
        getCellText(cells, FX_POSITION_COLUMNS.CONTRACT_RATE),
        getCellText(cells, FX_POSITION_COLUMNS.CURRENT_RATE),
        getCellText(cells, FX_POSITION_COLUMNS.UNREALIZED_GAIN),
      ]);
    if (!name) continue;
    const unrealizedGain = parseJapaneseNumber(unrealizedGainText);

    items.push({
      name,
      type: FX_CATEGORY,
      institution,
      // MF上のFX合計は、残高テーブルに加えて通貨ペアの評価損益も反映されるため、
      // 通貨ペア行は評価損益を資産寄与額(amount)として保持する。
      balance: unrealizedGain,
      quantity: parseFxQuantity(quantityText),
      avgCostPrice: parseFxRate(contractRateText),
      unitPrice: parseFxRate(currentRateText),
      unrealizedGain: unrealizedGain || undefined,
    });
  }

  return items;
}

export function parseFxQuantity(quantityText: string): number | undefined {
  if (!quantityText) return undefined;
  const match = quantityText.match(/\d[\d,]*/);
  if (!match) return undefined;
  const quantity = parseDecimalNumber(match[0]);
  if (!quantity) return undefined;
  return quantityText.includes("売") ? -quantity : quantity;
}

export function parseFxRate(rateText: string): number | undefined {
  if (!rateText) return undefined;
  const match = rateText.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return undefined;
  const rate = parseDecimalNumber(match[0]);
  return rate || undefined;
}

// Helper to convert 0 to undefined only for optional numeric fields
function orUndefined(value: number): number | undefined {
  return value || undefined;
}

// Parse stocks from .table-eq
async function parseStocks(page: Page): Promise<PortfolioItem[]> {
  const rows = page.locator("table.table-eq tbody tr");
  const count = await rows.count();
  const items: PortfolioItem[] = [];

  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator("td");
    // 並列取得
    const [
      name,
      code,
      institution,
      balanceText,
      quantityText,
      avgCostText,
      unitPriceText,
      dailyChangeText,
      unrealizedGainText,
      unrealizedGainPctText,
    ] = await Promise.all([
      getCellText(cells, STOCK_COLUMNS.NAME),
      getCellText(cells, STOCK_COLUMNS.CODE),
      getInstitutionFromCell(cells, STOCK_COLUMNS.INSTITUTION),
      getCellText(cells, STOCK_COLUMNS.BALANCE, "0"),
      getCellText(cells, STOCK_COLUMNS.QUANTITY),
      getCellText(cells, STOCK_COLUMNS.AVG_COST),
      getCellText(cells, STOCK_COLUMNS.UNIT_PRICE),
      getCellText(cells, STOCK_COLUMNS.DAILY_CHANGE),
      getCellText(cells, STOCK_COLUMNS.UNREALIZED_GAIN),
      getCellText(cells, STOCK_COLUMNS.UNREALIZED_GAIN_PCT),
    ]);
    if (!name) continue;

    // Parse daily change - keep 0 as valid value (only undefined if empty)
    const dailyChange = dailyChangeText ? parseJapaneseNumber(dailyChangeText) : undefined;

    items.push({
      name,
      code: code || undefined,
      type: "株式(現物)",
      institution,
      balance: parseJapaneseNumber(balanceText),
      quantity: orUndefined(parseDecimalNumber(quantityText)),
      avgCostPrice: orUndefined(parseDecimalNumber(avgCostText)),
      unitPrice: orUndefined(parseDecimalNumber(unitPriceText)),
      dailyChange,
      unrealizedGain: parseJapaneseNumber(unrealizedGainText) || undefined,
      unrealizedGainPct: parsePercentage(unrealizedGainPctText),
    });
  }
  return items;
}

// Parse mutual funds from .table-mf
async function parseFunds(page: Page): Promise<PortfolioItem[]> {
  const rows = page.locator("table.table-mf tbody tr");
  const count = await rows.count();
  const items: PortfolioItem[] = [];

  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator("td");
    // 並列取得
    const [
      name,
      institution,
      balanceText,
      quantityText,
      avgCostText,
      unitPriceText,
      dailyChangeText,
      unrealizedGainText,
      unrealizedGainPctText,
    ] = await Promise.all([
      getCellText(cells, FUND_COLUMNS.NAME),
      getInstitutionFromCell(cells, FUND_COLUMNS.INSTITUTION),
      getCellText(cells, FUND_COLUMNS.BALANCE, "0"),
      getCellText(cells, FUND_COLUMNS.QUANTITY),
      getCellText(cells, FUND_COLUMNS.AVG_COST),
      getCellText(cells, FUND_COLUMNS.UNIT_PRICE),
      getCellText(cells, FUND_COLUMNS.DAILY_CHANGE),
      getCellText(cells, FUND_COLUMNS.UNREALIZED_GAIN),
      getCellText(cells, FUND_COLUMNS.UNREALIZED_GAIN_PCT),
    ]);
    if (!name) continue;

    // Parse daily change - keep 0 as valid value (only undefined if empty)
    const dailyChange = dailyChangeText ? parseJapaneseNumber(dailyChangeText) : undefined;

    items.push({
      name,
      type: "投資信託",
      institution,
      balance: parseJapaneseNumber(balanceText),
      quantity: orUndefined(parseDecimalNumber(quantityText)),
      avgCostPrice: orUndefined(parseDecimalNumber(avgCostText)),
      unitPrice: orUndefined(parseDecimalNumber(unitPriceText)),
      dailyChange,
      unrealizedGain: parseJapaneseNumber(unrealizedGainText) || undefined,
      unrealizedGainPct: parsePercentage(unrealizedGainPctText),
    });
  }
  return items;
}

// Get category from section title (h1.heading-normal before the table)
// Returns the title if it's a valid asset category, otherwise returns "不明"
export function identifyTableTypeFromTitle(titleText: string): string {
  // ASSET_CATEGORIES: ["預金・現金・暗号資産", "株式(現物)", "投資信託", "保険", "年金", "ポイント・マイル"]
  const validCategories = new Set(ASSET_CATEGORIES);
  if (validCategories.has(titleText as (typeof ASSET_CATEGORIES)[number])) {
    return titleText;
  }
  return UNKNOWN_CATEGORY;
}

// Parse insurance, pension, and points from .table-pns
async function parseInsuranceAndPoints(page: Page): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];
  const tables = page.locator("table.table-pns");
  const tableCount = await tables.count();

  for (let t = 0; t < tableCount; t++) {
    const table = tables.nth(t);

    // Get section title from preceding h1.heading-normal element
    const sectionTitle = await table.evaluate((el) => {
      // Look for h1.heading-normal in preceding siblings
      let prev = el.previousElementSibling;
      while (prev) {
        // Check if this element or its children contain h1.heading-normal
        const h1 = prev.tagName === "H1" ? prev : prev.querySelector("h1.heading-normal");
        if (h1) {
          return h1.textContent?.trim() || "";
        }
        prev = prev.previousElementSibling;
      }
      return "";
    });

    const category = identifyTableTypeFromTitle(sectionTitle);
    debug(`  .table-pns[${t}] title: "${sectionTitle}" -> ${category}`);

    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("td");

      if (category === POINT) {
        // 並列取得（ポイント）
        const [name, institution, balanceText] = await Promise.all([
          getCellText(cells, 0),
          getCellText(cells, POINT_COLUMNS.INSTITUTION),
          getCellText(cells, POINT_COLUMNS.BALANCE, "0"),
        ]);
        if (!name) continue;

        items.push({
          name,
          type: category,
          institution,
          balance: parseJapaneseNumber(balanceText),
        });
      } else {
        // 並列取得（保険・年金）
        const [name, balanceText, avgCostText, unrealizedGainText, unrealizedGainPctText] =
          await Promise.all([
            getCellText(cells, 0),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.BALANCE, "0"),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.AVG_COST),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.UNREALIZED_GAIN),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.UNREALIZED_GAIN_PCT),
          ]);
        if (!name) continue;

        // Insurance and Pension share the same 8-column structure
        items.push({
          name,
          type: category,
          institution: "",
          balance: parseJapaneseNumber(balanceText),
          avgCostPrice: orUndefined(parseJapaneseNumber(avgCostText)),
          unrealizedGain: parseJapaneseNumber(unrealizedGainText) || undefined,
          unrealizedGainPct: parsePercentage(unrealizedGainPctText),
        });
      }
    }
  }
  return items;
}

export async function getPortfolio(page: Page): Promise<Portfolio> {
  debug("Getting portfolio from /bs/portfolio page...");

  // Get official totalAssets from bs/history (more accurate than summing items)
  await page.goto(mfUrls.assetHistory, { waitUntil: "domcontentloaded" });
  // テーブルが表示されるまで待機
  await page.locator("table.table-bordered").waitFor({ state: "visible", timeout: 10000 });

  let totalAssets = 0;
  try {
    const firstRow = page.locator("table.table-bordered tbody tr").first();
    const totalText = await firstRow.locator("td").nth(0).textContent({ timeout: 3000 });
    totalAssets = parseJapaneseNumber(totalText || "0");
    debug(`  Official totalAssets from bs/history: ¥${totalAssets.toLocaleString()}`);
  } catch {
    debug("  Failed to get totalAssets from bs/history");
  }

  // Get individual items from bs/portfolio
  await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
  // ポートフォリオコンテンツが表示されるまで待機
  await page.locator("h1.heading-normal").first().waitFor({ state: "visible", timeout: 10000 });

  // パース関数を並列実行
  const [deposits, stocks, funds, insuranceAndPoints, fx] = await Promise.all([
    parseDeposits(page),
    parseStocks(page),
    parseFunds(page),
    parseInsuranceAndPoints(page),
    parseFx(page),
  ]);

  debug(`  .table-depo rows: ${deposits.length}`);
  debug(`  .table-eq rows: ${stocks.length}`);
  debug(`  .table-mf rows: ${funds.length}`);
  debug(`  .table-pns items: ${insuranceAndPoints.length}`);
  debug(`  FX items: ${fx.length}`);

  const items: PortfolioItem[] = [...deposits, ...stocks, ...funds, ...insuranceAndPoints, ...fx];

  if (totalAssets === 0) {
    totalAssets = items.reduce((sum, item) => sum + (item.balance || 0), 0);
    debug(`  Calculated totalAssets from items: ¥${totalAssets.toLocaleString()}`);
  }

  debug(`  Portfolio items: ${items.length}, totalAssets: ¥${totalAssets.toLocaleString()}`);

  return { items, totalAssets };
}
