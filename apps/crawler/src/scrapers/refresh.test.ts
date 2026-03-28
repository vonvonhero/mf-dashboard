import { chromium, type Browser, type Page } from "playwright";
import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { clickRefreshButton } from "./refresh";

describe("refresh - 更新中セレクタ", () => {
  test("Modal Message iframe が出ていても閉じてから更新を押せる", async () => {
    const clicks: string[] = [];
    const refreshButton = {
      click: vi.fn(async () => {
        clicks.push("refresh");
      }),
    };
    const closeButton = {
      count: vi.fn(async () => 1),
      click: vi.fn(async () => {
        clicks.push("close");
      }),
    };
    const iframeLocator = {
      count: vi.fn(async () => 1),
    };
    const page = {
      goto: vi.fn(async () => undefined),
      waitForLoadState: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined),
      locator: vi.fn((selector: string) => {
        if (selector === 'a:has-text("更新")') return { first: () => refreshButton };
        if (selector === 'iframe[title="Modal Message"]') return { first: () => iframeLocator };
        if (selector === '#account-table td.account-status') return { count: async () => 0 };
        throw new Error(`Unexpected locator: ${selector}`);
      }),
      frameLocator: vi.fn(() => ({
        locator: vi.fn((selector: string) => ({
          first: () => {
            if (selector === 'button[aria-label="閉じる"]') return closeButton;
            return { count: async () => 0, click: async () => undefined };
          },
        })),
      })),
    } as unknown as Page;

    const result = await clickRefreshButton(page);

    expect(clicks).toEqual(["close", "refresh"]);
    expect(result).toEqual({ completed: true, incompleteAccounts: [] });
  });

  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("更新中のアカウントを正しくカウントする", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
      <tr>
        <td>SBI証券</td>
        <td>¥2,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(2);
  });

  test("更新中のアカウントがない場合は0を返す", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(0);
  });

  test("すべてのアカウントが更新中の場合", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>SBI証券</td>
        <td>¥2,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(3);
  });

  test("他のカラムに更新中という文字があっても状態カラムのみをカウントする", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>更新中銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>更新中</td>
        <td>正常</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    // 状態カラム（4番目）には「更新中」がないので0
    expect(updatingCount).toBe(0);
  });

  test("空のテーブルの場合は0を返す", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(0);
  });

  test("一時停止中のアカウントは更新中としてカウントしない", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>エポスカード</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>更新中 → 一時停止中</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥2,000,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    // 実際のコードと同じロジックでカウント
    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(1);
  });
});
