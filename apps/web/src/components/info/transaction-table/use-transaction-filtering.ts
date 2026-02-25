import { useMemo, useState } from "react";
import { countBy, filterTransactions, sortTransactions } from "../../../lib/transaction-utils";
import type { SortColumn, Transaction, TransactionKpi } from "./types";

interface UseTransactionFilteringOptions {
  transactions: Transaction[];
  selectedDate: string | null;
  pageSize: number;
}

const TYPE_OPTIONS = ["income", "expense", "transfer"];

function getSortedCountMap<T>(
  items: T[],
  getKey: (item: T) => string,
): { keys: string[]; countMap: Map<string, number> } {
  const countMap = countBy(items, getKey);
  const keys = Array.from(countMap.keys()).sort(
    (a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0),
  );
  return { keys, countMap };
}

function computeTransactionKpi(transactions: Transaction[]): TransactionKpi {
  let totalIncome = 0;
  let totalExpense = 0;
  let count = 0;
  const expenseAmounts: number[] = [];

  for (const t of transactions) {
    // 計算対象外のトランザクションはKPIから除外
    if (t.isExcludedFromCalculation) continue;

    if (t.type === "income") {
      totalIncome += t.amount;
      count++;
    } else if (t.type === "expense") {
      totalExpense += t.amount;
      expenseAmounts.push(t.amount);
      count++;
    }
  }

  // 中央値計算
  let medianExpense = 0;
  if (expenseAmounts.length > 0) {
    const sorted = [...expenseAmounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianExpense =
      sorted.length % 2 === 0 ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    count,
    medianExpense,
  };
}

export function useTransactionFiltering({
  transactions,
  selectedDate,
  pageSize,
}: UseTransactionFilteringOptions) {
  const [searchText, setSearchText] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Get unique categories with count, sorted by count descending
  const { keys: categories, countMap: categoryCount } = useMemo(
    () => getSortedCountMap(transactions, (t) => t.category ?? "振替"),
    [transactions],
  );

  // Get unique accounts with count, sorted by count descending
  const { keys: accounts, countMap: accountCount } = useMemo(
    () => getSortedCountMap(transactions, (t) => t.accountName ?? "不明"),
    [transactions],
  );

  // Filter and sort transactions using pure functions
  const filteredAndSortedTransactions = useMemo(() => {
    const filtered = filterTransactions(transactions, {
      searchText,
      categories: selectedCategories,
      types: selectedTypes,
      accounts: selectedAccounts,
      date: selectedDate,
    });
    return sortTransactions(filtered, sortColumn, sortDirection);
  }, [
    transactions,
    searchText,
    selectedCategories,
    selectedTypes,
    selectedAccounts,
    selectedDate,
    sortColumn,
    sortDirection,
  ]);

  // KPI summary (excludes transfers and isExcludedFromCalculation)
  const kpi = useMemo(
    () => computeTransactionKpi(filteredAndSortedTransactions),
    [filteredAndSortedTransactions],
  );

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTransactions.length / pageSize);
  const paginatedTransactions = filteredAndSortedTransactions.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  const resetPage = () => {
    setCurrentPage(0);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column as SortColumn);
      setSortDirection("desc");
    }
    resetPage();
  };

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    resetPage();
  };

  const handleCategoriesChange = (categories: string[]) => {
    setSelectedCategories(categories);
    resetPage();
  };

  const handleTypesChange = (types: string[]) => {
    setSelectedTypes(types);
    resetPage();
  };

  const handleAccountsChange = (accounts: string[]) => {
    setSelectedAccounts(accounts);
    resetPage();
  };

  const handleRemoveCategory = (category: string) => {
    setSelectedCategories((values) => values.filter((item) => item !== category));
    resetPage();
  };

  const handleRemoveType = (type: string) => {
    setSelectedTypes((values) => values.filter((item) => item !== type));
    resetPage();
  };

  const handleRemoveAccount = (account: string) => {
    setSelectedAccounts((values) => values.filter((item) => item !== account));
    resetPage();
  };

  const handleClearFilters = (onDateChange?: (date: string | null) => void) => {
    setSelectedCategories([]);
    setSelectedTypes([]);
    setSelectedAccounts([]);
    onDateChange?.(null);
    resetPage();
  };

  return {
    // State
    searchText,
    selectedCategories,
    selectedTypes,
    selectedAccounts,
    currentPage,
    sortColumn,
    sortDirection,
    // Computed
    categories,
    categoryCount,
    accounts,
    accountCount,
    typeOptions: TYPE_OPTIONS,
    filteredAndSortedTransactions,
    paginatedTransactions,
    kpi,
    totalPages,
    // Handlers
    handleSort,
    handleSearchChange,
    handleCategoriesChange,
    handleTypesChange,
    handleAccountsChange,
    handleRemoveCategory,
    handleRemoveType,
    handleRemoveAccount,
    handleClearFilters,
    setCurrentPage,
  };
}
