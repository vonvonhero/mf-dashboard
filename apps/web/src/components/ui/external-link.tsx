import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import type { AnchorHTMLAttributes, Ref } from "react";
import { cn } from "../../lib/utils";

interface ExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  text?: string;
  showIcon?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

function ExternalLink({
  className,
  children,
  text,
  showIcon = true,
  ref,
  ...props
}: ExternalLinkProps) {
  return (
    <a
      ref={ref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 hover:opacity-70", className)}
      {...props}
    >
      {text && <span>{text}</span>}
      {children}
      {showIcon && <ExternalLinkIcon className="h-3.5 w-3.5" />}
    </a>
  );
}

export { ExternalLink };
