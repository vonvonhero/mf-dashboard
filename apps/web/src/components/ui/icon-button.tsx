import { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface IconButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  type?: "button" | "submit" | "reset";
  href?: string;
  isExternal?: boolean;
}

export function IconButton({
  icon,
  onClick,
  ariaLabel,
  className,
  type = "button",
  href,
  isExternal = false,
}: IconButtonProps) {
  const baseClassName = cn(
    "p-2 rounded-lg hover:bg-muted hover:opacity-100 transition-colors cursor-pointer",
    className,
  );

  if (href) {
    return (
      <Link
        href={href as Route}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className={baseClassName}
        aria-label={ariaLabel}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={baseClassName} aria-label={ariaLabel} type={type}>
      {icon}
    </button>
  );
}
