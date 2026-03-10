import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const Separator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("shrink-0 h-px bg-[var(--border)]", className)}
      {...props}
    />
  )
);
Separator.displayName = "Separator";

export { Separator };
