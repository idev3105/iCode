import { useTerminalStore } from "@/stores/terminalStore";
import { TerminalPane } from "./TerminalPane";

interface Props {
  taskId: string;
}

export function CenterTerminal({ taskId }: Props) {
  const session = useTerminalStore((s) => s.sessions[taskId]);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1d2021] text-muted-foreground/20 font-mono italic">
        initializing session {taskId.slice(0, 8)}...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden relative">
        <TerminalPane
          agent={session.agent}
          data={session.data}
          isActive={true}
          taskId={taskId}
        />
      </div>
    </div>
  );
}
