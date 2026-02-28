import { eq, like, sql } from "drizzle-orm";
import type { Db } from "../index";
import { schema } from "../index";
import type { CashFlowItem } from "../types";
import { convertToIsoDate, now } from "../utils";

const BATCH_SIZE = 500;

export type TransactionSaveResult = "inserted" | "updated" | "skipped";

export async function saveTransaction(
  db: Db,
  item: CashFlowItem,
  accountIdMap?: Map<string, number>,
): Promise<TransactionSaveResult> {
  // Skip items without valid mfId
  if (!item.mfId || item.mfId.startsWith("unknown")) {
    return "skipped";
  }

  // 日付をISO形式に変換
  const isoDate = convertToIsoDate(item.date);

  // accountName から account_id をルックアップ
  let accountId: number | null = null;
  if (accountIdMap && item.accountName) {
    // 完全一致を試行
    accountId = accountIdMap.get(item.accountName) ?? null;
    // 完全一致しない場合、キーがaccountNameで始まるものを部分一致で探す
    if (!accountId) {
      for (const [key, id] of accountIdMap) {
        if (key.startsWith(item.accountName)) {
          accountId = id;
          break;
        }
      }
    }
  }

  // transferTarget から transfer_target_account_id をルックアップ
  let transferTargetAccountId: number | null = null;
  if (accountIdMap && item.transferTarget) {
    transferTargetAccountId = accountIdMap.get(item.transferTarget) ?? null;
    if (!transferTargetAccountId) {
      for (const [key, id] of accountIdMap) {
        if (key.startsWith(item.transferTarget)) {
          transferTargetAccountId = id;
          break;
        }
      }
    }
  }

  const data = {
    mfId: item.mfId,
    date: isoDate,
    accountId,
    category: item.category,
    subCategory: item.subCategory ?? null,
    description: item.description,
    amount: item.amount,
    type: item.type,
    isTransfer: item.isTransfer,
    isExcludedFromCalculation: item.isExcludedFromCalculation ?? false,
    transferTarget: item.transferTarget ?? null,
    transferTargetAccountId,
  };

  const existing = await db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.mfId, item.mfId))
    .get();

  if (existing) {
    await db
      .update(schema.transactions)
      .set({
        ...data,
        updatedAt: now(),
      })
      .where(eq(schema.transactions.mfId, item.mfId))
      .run();
    return "updated";
  }

  await db
    .insert(schema.transactions)
    .values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    })
    .run();

  return "inserted";
}

/**
 * 指定月にトランザクションが存在するかチェック
 * @param month "2026-01" 形式
 */
export async function hasTransactionsForMonth(db: Db, month: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(like(schema.transactions.date, `${month}%`))
    .get();
  return (result?.count ?? 0) > 0;
}

/**
 * 指定月のトランザクションを削除
 * @param month "2026-01" 形式
 */
export async function deleteTransactionsForMonth(db: Db, month: string): Promise<number> {
  const result = await db
    .delete(schema.transactions)
    .where(like(schema.transactions.date, `${month}%`))
    .run();
  return result.rowsAffected;
}

/**
 * accountName から account_id をルックアップ
 */
function lookupAccountId(
  accountIdMap: Map<string, number> | undefined,
  name: string | undefined,
): number | null {
  if (!accountIdMap || !name) return null;

  // 完全一致を試行
  const exactMatch = accountIdMap.get(name);
  if (exactMatch) return exactMatch;

  // 部分一致で探す
  for (const [key, id] of accountIdMap) {
    if (key.startsWith(name)) {
      return id;
    }
  }
  return null;
}

/**
 * CashFlowItem を DB レコード形式に変換
 */
function prepareTransactionData(
  item: CashFlowItem,
  accountIdMap?: Map<string, number>,
): {
  mfId: string;
  date: string;
  accountId: number | null;
  category: string | null;
  subCategory: string | null;
  description: string;
  amount: number;
  type: string;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
  transferTarget: string | null;
  transferTargetAccountId: number | null;
} {
  const isoDate = convertToIsoDate(item.date);
  const accountId = lookupAccountId(accountIdMap, item.accountName);
  const transferTargetAccountId = lookupAccountId(accountIdMap, item.transferTarget);

  return {
    mfId: item.mfId,
    date: isoDate,
    accountId,
    category: item.category,
    subCategory: item.subCategory ?? null,
    description: item.description,
    amount: item.amount,
    type: item.type,
    isTransfer: item.isTransfer,
    isExcludedFromCalculation: item.isExcludedFromCalculation ?? false,
    transferTarget: item.transferTarget ?? null,
    transferTargetAccountId,
  };
}

/**
 * 指定月のトランザクションを保存（既存データは削除して上書き）
 */
export async function saveTransactionsForMonth(
  db: Db,
  month: string,
  items: CashFlowItem[],
  accountIdMap?: Map<string, number>,
): Promise<number> {
  // 既存データを削除
  const deleted = await deleteTransactionsForMonth(db, month);
  if (deleted > 0) {
    console.log(`  Deleted ${deleted} existing transactions for ${month}`);
  }

  // 有効なトランザクションのみフィルタリング
  const validItems = items.filter((item) => item.mfId && !item.mfId.startsWith("unknown"));

  if (validItems.length === 0) {
    return 0;
  }

  // バルクinsert（BATCH_SIZE単位）
  const timestamp = now();

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const records = batch.map((item) => {
      const data = prepareTransactionData(item, accountIdMap);
      return {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });

    await db
      .insert(schema.transactions)
      .values(records)
      .onConflictDoUpdate({
        target: schema.transactions.mfId,
        set: {
          date: sql`excluded.date`,
          accountId: sql`excluded.account_id`,
          category: sql`excluded.category`,
          subCategory: sql`excluded.sub_category`,
          description: sql`excluded.description`,
          amount: sql`excluded.amount`,
          type: sql`excluded.type`,
          isTransfer: sql`excluded.is_transfer`,
          isExcludedFromCalculation: sql`excluded.is_excluded_from_calculation`,
          transferTarget: sql`excluded.transfer_target`,
          transferTargetAccountId: sql`excluded.transfer_target_account_id`,
          updatedAt: timestamp,
        },
      })
      .run();
  }

  return validItems.length;
}
