import { getAssetHistoryWithCategories } from "@mf-dashboard/db";
import { LineChart } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { AssetHistoryChartClient } from "./asset-history-chart.client";

interface AssetHistoryChartProps {
  groupId?: string;
}

export function AssetHistoryChart({ groupId }: AssetHistoryChartProps) {
  const data = getAssetHistoryWithCategories({ groupId })
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date))
    .reverse();

  if (data.length === 0) {
    return <EmptyState icon={LineChart} title="資産推移" />;
  }

  return <AssetHistoryChartClient data={data} />;
}
