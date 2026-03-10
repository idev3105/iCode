import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 400);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 6;

    const fitsAbove = triggerRect.top - tipRect.height - gap > 0;
    const top = fitsAbove
      ? triggerRect.top - tipRect.height - gap
      : triggerRect.bottom + gap;
    const left = Math.max(4, Math.min(triggerRect.left + triggerRect.width / 2 - tipRect.width / 2, window.innerWidth - tipRect.width - 4));

    setStyle({ left, top });
  }, [visible]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <span
      ref={triggerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible &&
        createPortal(
          <span
            ref={tooltipRef}
            className="fixed px-2 py-1 text-[11px] rounded-[var(--radius)] bg-[var(--popover)] text-[var(--popover-foreground)] border border-[var(--border)] shadow-md whitespace-nowrap z-50 pointer-events-none"
            style={style}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
}

export { Tooltip };
