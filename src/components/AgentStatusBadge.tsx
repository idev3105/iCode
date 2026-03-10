import type { AgentStatus } from "@/services/ipc/types";
import { cn } from "@/lib/utils";

interface Props {
  status: AgentStatus;
}

export function AgentStatusBadge({ status }: Props) {
  return (
    <span className="inline-flex items-center justify-center">
      <span
        className={cn(
          "w-[7px] h-[7px] rounded-full",
          status === "idle" && "bg-[#928374]",
          status === "error" && "bg-[#cc241d]",
          status === "running" &&
            "bg-[#fe8019] animate-pulse shadow-[0_0_8px_rgba(254,128,25,0.5)]",
        )}
      />
    </span>
  );
}
