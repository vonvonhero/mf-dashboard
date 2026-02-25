"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Tooltip } from "./tooltip";

interface MetricLabelProps {
  title: string;
  description?: ReactNode;
  className?: string;
}

export function MetricLabel({ title, description, className }: MetricLabelProps) {
  return (
    <div
      className={cn(
        "text-sm text-muted-foreground",
        description && "flex items-center gap-1",
        className,
      )}
    >
      {title}
      {description && (
        <Tooltip content={description} aria-label={`${title}の説明`}>
          <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/60" />
        </Tooltip>
      )}
    </div>
  );
}
