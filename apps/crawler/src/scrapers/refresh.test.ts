import type { Page } from "playwright";
import { afterEach, describe, expect, test, vi } from "vitest";
import { info } from "../logger.js";
import { runRefreshStage } from "./refresh-diagnostics.js";
import {
  clickRefreshButton,
  getMaxWaitMinutes,
  getRefreshStatus,
  navigateToAccountsPage,
  prepareRefreshPage,
  summarizeRefreshRows,
  type RefreshStatusRow,
} from "./refresh.js";

function diagnosticEventMethods() {
  return { on: vi.fn<() => void>(), off: vi.fn<() => void>() };
}

function diagnostics(event: string) {
  return vi
    .mocked(info)
    .mock.calls.map(([message]) => message)
    .filter(
      (message): message is string =>
        typeof message === "string" && message.startsWith("MF_CRAWLER_DIAGNOSTIC "),
    )
    .map((message) => JSON.parse(message.slice("MF_CRAWLER_DIAGNOSTIC ".length)))
    .filter((record) => record.event === event);
}

function navigationDecisions() {
  return diagnostics("accounts_navigation_decision");
}

function preparationPage() {
  const button = {
    waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const goto = vi.fn<Page["goto"]>().mockResolvedValue(null);
  const waitForLoadState = vi
    .fn<Page["waitForLoadState"]>()
    .mockRejectedValue(new Error("page.waitForLoadState: Timeout 30000ms exceeded"));
  const page = {
    ...diagnosticEventMethods(),
    goto,
    waitForLoadState,
    isClosed: () => false,
    locator: (selector: string) => {
      if (selector === 'a:has-text("一括更新")') return { first: () => button };
      if (selector === 'iframe[title="Modal Message"]')
        return { first: () => ({ count: async () => 0 }) };
      throw new Error(`Unexpected locator: ${selector}`);
    },
  } as unknown as Page;
  return { page, button, goto, waitForLoadState };
}

afterEach(() => vi.mocked(info).mockClear());

describe("getMaxWaitMinutes", () => {
  test.each([undefined, "", "0", "-1", "Infinity", "NaN"])(
    "invalid MAX_WAIT_MINUTES=%s は default 値を返す",
    (value) => {
      expect(getMaxWaitMinutes({ MAX_WAIT_MINUTES: value })).toBe(20);
    },
  );

  test("有限の正数を返す", () => {
    expect(getMaxWaitMinutes({ MAX_WAIT_MINUTES: "12.5" })).toBe(12.5);
  });
});

describe("summarizeRefreshRows", () => {
  test.each<{
    expected: { incompleteAccounts: string[]; remainingCount: number };
    name: string;
    rows: RefreshStatusRow[];
  }>([
    {
      name: "更新中のアカウント名と件数を返す",
      rows: [
        { name: "Institution A", statuses: ["更新中"] },
        { name: "Institution B", statuses: ["正常"] },
        { name: "Institution C", statuses: ["更新中"] },
      ],
      expected: {
        incompleteAccounts: ["Institution A", "Institution C"],
        remainingCount: 2,
      },
    },
    {
      name: "複数の状態セルに更新中があれば1件として数える",
      rows: [{ name: "Institution A", statuses: ["更新中", "正常"] }],
      expected: { incompleteAccounts: ["Institution A"], remainingCount: 1 },
    },
    {
      name: "完全一致しない状態は更新中として数えない",
      rows: [
        { name: "Institution A", statuses: ["更新中 → 一時停止中"] },
        { name: "Institution B", statuses: ["再更新中"] },
      ],
      expected: { incompleteAccounts: [], remainingCount: 0 },
    },
    {
      name: "空の行一覧は0件を返す",
      rows: [],
      expected: { incompleteAccounts: [], remainingCount: 0 },
    },
    {
      name: "名称がない更新中行も件数には含める",
      rows: [{ name: null, statuses: [" 更新中 "] }],
      expected: { incompleteAccounts: [], remainingCount: 1 },
    },
    {
      name: "空白のみの名称は除外し更新中行を件数には含める",
      rows: [{ name: " \t ", statuses: ["更新中"] }],
      expected: { incompleteAccounts: [], remainingCount: 1 },
    },
  ])("$name", ({ rows, expected }) => {
    expect(summarizeRefreshRows(rows)).toEqual(expected);
  });
});

describe("getRefreshStatus", () => {
  test("service linkがない更新中行は先頭セルの名称を使う", async () => {
    const statusCells = {
      allTextContents: vi.fn<() => Promise<string[]>>().mockResolvedValue(["更新中"]),
    };
    const nameLink = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    };
    const firstCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue(" Institution A "),
    };
    const allCells = {
      first: vi.fn<() => typeof firstCell>().mockReturnValue(firstCell),
    };
    const nameLinkLocator = {
      first: vi.fn<() => typeof nameLink>().mockReturnValue(nameLink),
    };
    const row = {
      locator: vi.fn<
        (selector: string) => typeof statusCells | typeof nameLinkLocator | typeof allCells
      >((selector) => {
        if (selector === "td.account-status") return statusCells;
        if (selector === "td.service a") return nameLinkLocator;
        return allCells;
      }),
    };
    const rows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      nth: vi.fn<() => typeof row>().mockReturnValue(row),
    };
    const page = {
      ...diagnosticEventMethods(),
      locator: vi.fn<() => typeof rows>().mockReturnValue(rows),
    } as unknown as Page;

    await expect(getRefreshStatus(page)).resolves.toEqual({
      incompleteAccounts: ["Institution A"],
      remainingCount: 1,
    });
    expect(firstCell.textContent).toHaveBeenCalledOnce();
  });
});

describe("navigateToAccountsPage", () => {
  test.each([
    "page.goto: net::ERR_ABORTED at https://moneyforward.com/accounts",
    "page.goto: Timeout 30000ms exceeded.",
    'page.goto: Navigation to "https://moneyforward.com/accounts" is interrupted by another navigation to "https://moneyforward.com/accounts"',
  ])("一時的な遷移エラーを1回だけ再試行する: %s", async (message) => {
    const goto = vi
      .fn<(...args: any[]) => any>()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce(null);
    const isClosed = vi.fn<(...args: any[]) => any>().mockReturnValue(false);
    const retryPage = { ...diagnosticEventMethods(), goto, isClosed } as unknown as Page;

    await navigateToAccountsPage(retryPage, { retryDelayMs: 0 });

    expect(goto).toHaveBeenCalledTimes(2);
    expect(goto).toHaveBeenCalledWith(
      "https://moneyforward.com/accounts",
      expect.objectContaining({ timeout: 60000, waitUntil: "domcontentloaded" }),
    );
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "retry",
        decision_reason: "retryable_error",
        attempt: 1,
        max_attempts: 2,
        retry_delay_ms: 0,
      }),
    ]);
  });

  test("Page crashedは再試行せず元のエラーを返す", async () => {
    const error = new Error("page.goto: Page crashed");
    const goto = vi.fn<(...args: any[]) => any>().mockRejectedValue(error);
    const page = {
      ...diagnosticEventMethods(),
      goto,
      isClosed: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    } as unknown as Page;

    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(error);
    expect(goto).toHaveBeenCalledOnce();
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "stop",
        decision_reason: "error_not_retryable",
        failure_kind: "page_crashed",
      }),
    ]);
  });

  test.each([
    ["Execution context was destroyed", "execution_context_destroyed"],
    ["Frame was detached", "frame_detached"],
    ["timeout 1000ms exceeded", "timeout"],
  ])("復帰対象外のエラーは再試行しない: %s", async (message, kind) => {
    const failure = new Error(message);
    const goto = vi.fn<Page["goto"]>().mockRejectedValue(failure);
    const page = { ...diagnosticEventMethods(), goto, isClosed: () => false } as unknown as Page;
    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
    expect(goto).toHaveBeenCalledOnce();
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "stop",
        decision_reason: "error_not_retryable",
        failure_kind: kind,
        retry_delay_ms: null,
      }),
    ]);
  });

  test.each([
    "net::ERR_ABORTED",
    "Timeout 60000ms exceeded",
    "Navigation is interrupted by another navigation",
  ])("再試行の上限と操作IDを記録する: %s", async (message) => {
    const failure = new Error(message);
    const goto = vi.fn<Page["goto"]>().mockRejectedValue(failure);
    const page = { ...diagnosticEventMethods(), goto, isClosed: () => false } as unknown as Page;
    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
    expect(goto).toHaveBeenCalledTimes(2);
    const records = navigationDecisions();
    expect(records).toEqual([
      expect.objectContaining({
        attempt: 1,
        max_attempts: 2,
        decision: "retry",
        decision_reason: "retryable_error",
      }),
      expect.objectContaining({
        attempt: 2,
        max_attempts: 2,
        decision: "stop",
        decision_reason: "attempts_exhausted",
      }),
    ]);
    expect(records[0].operation_id).toBe(records[1].operation_id);
    expect(records[0].operation_id).toMatch(/^[a-f0-9-]{36}$/);
  });

  test("閉じたページは再試行対象のエラーでも停止理由を記録する", async () => {
    const failure = new Error("net::ERR_ABORTED");
    const goto = vi.fn<Page["goto"]>().mockRejectedValue(failure);
    const page = { ...diagnosticEventMethods(), goto, isClosed: () => true } as unknown as Page;
    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
    expect(goto).toHaveBeenCalledOnce();
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({ decision: "stop", decision_reason: "page_closed" }),
    ]);
  });
});

describe("runRefreshStage", () => {
  test("グループ切替の開始・成功を同じIDで記録する", async () => {
    await expect(runRefreshStage("group_switch", async () => true)).resolves.toBe(true);
    const started = diagnostics("refresh_stage_started")[0];
    const done = diagnostics("refresh_stage_done")[0];
    expect(started.stage).toBe("group_switch");
    expect(done.stage_id).toBe(started.stage_id);
    expect(done.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  test("失敗段階だけを記録し、例外文を保存せず元の例外を返す", async () => {
    const failure = new Error("page.goto: Timeout 30000ms exceeded: private-test-marker");
    await expect(
      runRefreshStage("home_navigation", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(diagnostics("refresh_stage_failed")).toEqual([
      expect.objectContaining({
        stage: "home_navigation",
        failure_kind: "timeout",
        timeout_ms: 30000,
      }),
    ]);
    expect(JSON.stringify(diagnostics("refresh_stage_failed"))).not.toContain(
      "private-test-marker",
    );
  });
});

describe("prepareRefreshPage", () => {
  test("通信終了を待たず、DOMとボタンの表示だけを確認する", async () => {
    const { page, button, goto, waitForLoadState } = preparationPage();
    await prepareRefreshPage(page, { retryDelayMs: 0 });
    expect(goto).toHaveBeenCalledExactlyOnceWith("https://moneyforward.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    expect(button.waitFor).toHaveBeenCalledExactlyOnceWith({ state: "visible", timeout: 15000 });
    expect(waitForLoadState).not.toHaveBeenCalled();
    expect(button.click).not.toHaveBeenCalled();
    expect(diagnostics("refresh_stage_done").map(({ stage }) => stage)).toEqual([
      "home_navigation",
      "modal_dismiss",
      "button_wait",
    ]);
  });

  test.each([
    "Timeout 60000ms exceeded",
    "Navigation is interrupted by another navigation",
    "net::ERR_ABORTED",
  ])("クリック前の一時的な失敗を1回再試行する: %s", async (message) => {
    const { page, button, goto } = preparationPage();
    goto.mockRejectedValueOnce(new Error(message));
    await prepareRefreshPage(page, { retryDelayMs: 0 });
    expect(goto).toHaveBeenCalledTimes(2);
    expect(button.waitFor).toHaveBeenCalledOnce();
    expect(button.click).not.toHaveBeenCalled();
    expect(diagnostics("refresh_preparation_decision")).toEqual([
      expect.objectContaining({ decision: "retry", attempt: 1, max_attempts: 2 }),
    ]);
  });

  test.each(["home_navigation", "button_wait"])(
    "%s のタイムアウトが続く場合は2回で止める",
    async (stage) => {
      const { page, button, goto } = preparationPage();
      const failure = new Error("Timeout 15000ms exceeded");
      if (stage === "home_navigation") goto.mockRejectedValue(failure);
      else button.waitFor.mockRejectedValue(failure);
      await expect(prepareRefreshPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
      expect(goto).toHaveBeenCalledTimes(2);
      expect(button.click).not.toHaveBeenCalled();
      expect(diagnostics("refresh_stage_failed")).toHaveLength(2);
      expect(diagnostics("refresh_stage_failed").every((record) => record.stage === stage)).toBe(
        true,
      );
      const decisions = diagnostics("refresh_preparation_decision");
      expect(decisions.map(({ decision }) => decision)).toEqual(["retry", "stop"]);
      expect(decisions[1].decision_reason).toBe("attempts_exhausted");
      expect(decisions[0].operation_id).toBe(decisions[1].operation_id);
    },
  );

  test.each([false, true])("クラッシュや閉じたページは再試行しない: closed=%s", async (closed) => {
    const { page, button, goto } = preparationPage();
    const failure = new Error(closed ? "Timeout 60000ms exceeded" : "Page crashed");
    page.isClosed = () => closed;
    goto.mockRejectedValue(failure);
    await expect(prepareRefreshPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
    expect(goto).toHaveBeenCalledOnce();
    expect(button.click).not.toHaveBeenCalled();
  });
});

describe("clickRefreshButton", () => {
  test("60秒間隔で監視し、遷移の割り込みから復帰しても一括更新を押し直さない", async () => {
    const refreshButton = {
      click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const rows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      nth: () => ({
        locator: (selector: string) =>
          selector === "td.account-status"
            ? { allTextContents: async () => ["更新中"] }
            : { first: () => ({ count: async () => 1, textContent: async () => "Institution A" }) },
      }),
    };
    const goto = vi
      .fn<Page["goto"]>()
      .mockResolvedValueOnce(null) // Home before the single refresh click.
      .mockResolvedValueOnce(null) // Initial status check.
      .mockRejectedValueOnce(new Error("Navigation is interrupted by another navigation"))
      .mockResolvedValueOnce(null); // Retry the accounts page only.
    const waitForTimeout = vi.fn<Page["waitForTimeout"]>().mockResolvedValue(undefined);
    const onWaiting =
      vi.fn<(progress: { remainingCount: number; nextCheckSeconds: number }) => void>();
    const page = {
      ...diagnosticEventMethods(),
      goto,
      isClosed: () => false,
      waitForLoadState: vi.fn<Page["waitForLoadState"]>().mockResolvedValue(undefined),
      waitForTimeout,
      locator: (selector: string) => {
        if (selector === 'a:has-text("一括更新")') return { first: () => refreshButton };
        if (selector === 'iframe[title="Modal Message"]')
          return { first: () => ({ count: async () => 0 }) };
        if (selector === "#account-table tr:has(td.account-status)") return rows;
        throw new Error(`Unexpected locator: ${selector}`);
      },
    } as unknown as Page;

    await expect(clickRefreshButton(page, { onWaiting })).resolves.toEqual({
      completed: true,
      incompleteAccounts: [],
    });
    expect(waitForTimeout.mock.calls).toEqual([[3000], [60000]]);
    expect(onWaiting).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ remainingCount: 1, nextCheckSeconds: 60 }),
    );
    expect(onWaiting).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ remainingCount: 0, nextCheckSeconds: 60 }),
    );
    expect(refreshButton.click).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledTimes(4);
    expect(
      goto.mock.calls.slice(1).every(([url]) => url === "https://moneyforward.com/accounts"),
    ).toBe(true);
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "retry",
        failure_kind: "navigation_interrupted",
        retry_delay_ms: 1000,
      }),
    ]);
  });

  test("Modal Message iframe が出ていても閉じてから更新を押せる", async () => {
    const clicks: string[] = [];
    const refreshButton = {
      waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      click: vi.fn<() => Promise<void>>(async () => {
        clicks.push("refresh");
      }),
    };
    const closeButton = {
      count: vi.fn<() => Promise<number>>(async () => 1),
      click: vi.fn<() => Promise<void>>(async () => {
        clicks.push("close");
      }),
    };
    const iframeLocator = {
      count: vi.fn<() => Promise<number>>(async () => 1),
    };
    const page = {
      ...diagnosticEventMethods(),
      goto: vi.fn<() => Promise<void>>(async () => undefined),
      waitForLoadState: vi.fn<() => Promise<void>>(async () => undefined),
      waitForTimeout: vi.fn<() => Promise<void>>(async () => undefined),
      locator: vi.fn<(selector: string) => unknown>((selector: string) => {
        if (selector === 'a:has-text("一括更新")') return { first: () => refreshButton };
        if (selector === 'iframe[title="Modal Message"]') return { first: () => iframeLocator };
        if (selector === "#account-table tr:has(td.account-status)")
          return { count: async () => 0 };
        throw new Error(`Unexpected locator: ${selector}`);
      }),
      frameLocator: vi.fn<() => unknown>(() => ({
        locator: vi.fn<(selector: string) => unknown>((selector: string) => ({
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
});
