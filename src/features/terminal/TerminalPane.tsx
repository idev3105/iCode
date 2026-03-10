import { useEffect, useRef, memo, useCallback } from "react";
import type { Terminal } from "xterm";
import { useTerminalInstance } from "./hooks/useTerminalInstance";
import { ipc } from "@/services/ipc";

interface TerminalPaneProps {
  agent: string;
  data: string;
  isActive: boolean;
  taskId: string;
}

export const TerminalPane = memo(function TerminalPane({
  data,
  isActive,
  taskId,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const lastDataLen = useRef(0);

  const handleData = useCallback((input: string) => {
    ipc.sendInput(taskId, input).catch(console.error);
  }, [taskId]);

  const handleResize = useCallback((rows: number, cols: number) => {
    ipc.resizeTerminal(taskId, rows, cols).catch(console.error);
  }, [taskId]);

  useTerminalInstance(containerRef, (term) => {
    termRef.current = term;
    // Write any buffered data
    if (data) {
      term.write(data);
      lastDataLen.current = data.length;
    }
    if (isActive) {
      term.focus();
    }
  }, handleData, handleResize);

  // Focus when active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive]);

  // Write new data chunks as they stream in
  useEffect(() => {
    if (!termRef.current) return;
    if (data.length > lastDataLen.current) {
      const newData = data.slice(lastDataLen.current);
      termRef.current.write(newData);
      lastDataLen.current = data.length;
    } else if (data.length < lastDataLen.current) {
      // Data was cleared or reset
      termRef.current.reset();
      termRef.current.write(data);
      lastDataLen.current = data.length;
    }
  }, [data]);

  return (
    <div
      className="h-full w-full p-2 bg-[#1d2021]"
      style={{ display: isActive ? "block" : "none" }}
    >
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden"
      />
    </div>
  );
});
