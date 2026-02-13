import {
  getAssetBreakdownByCategory,
  getLiabilityBreakdownByCategory,
  getLatestTotalAssets,
} from "@mf-dashboard/db";
import { Scale } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { BalanceSheetChartClient } from "./balance-sheet-chart.client";

interface BalanceSheetChartProps {
  groupId?: string;
}

export function BalanceSheetChart({ groupId }: BalanceSheetChartProps) {
  const assets = getAssetBreakdownByCategory(groupId);
  const liabilities = getLiabilityBreakdownByCategory(groupId);
  const totalAssets = getLatestTotalAssets(groupId);

  if (totalAssets === null) {
    return <EmptyState icon={Scale} title="バランスシート" />;
  }

  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
  const netAssets = totalAssets - totalLiabilities;

  return (
    <BalanceSheetChartClient assets={assets} liabilities={liabilities} netAssets={netAssets} />
  );
}
