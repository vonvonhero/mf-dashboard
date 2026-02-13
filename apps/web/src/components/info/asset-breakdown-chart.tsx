import {
  getAssetBreakdownByCategory,
  getCategoryChangesForPeriod,
  getLatestTotalAssets,
  getLiabilityBreakdownByCategory,
} from "@mf-dashboard/db";
import { PieChart } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { AssetBreakdownChartClient } from "./asset-breakdown-chart.client";

interface AssetBreakdownChartProps {
  className?: string;
  groupId?: string;
}

export function AssetBreakdownChart({ className, groupId }: AssetBreakdownChartProps) {
  const data = getAssetBreakdownByCategory(groupId);

  if (data.length === 0) {
    return <EmptyState icon={PieChart} title="資産構成" />;
  }

  const totalAssets = getLatestTotalAssets(groupId);
  const liabilities = getLiabilityBreakdownByCategory(groupId);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
  const netAssets = totalAssets !== null ? totalAssets - totalLiabilities : null;

  const dailyChanges = getCategoryChangesForPeriod("daily", groupId);
  const weeklyChanges = getCategoryChangesForPeriod("weekly", groupId);
  const monthlyChanges = getCategoryChangesForPeriod("monthly", groupId);

  return (
    <AssetBreakdownChartClient
      data={data}
      dailyChanges={dailyChanges}
      weeklyChanges={weeklyChanges}
      monthlyChanges={monthlyChanges}
      netAssets={netAssets}
      className={className}
    />
  );
}
