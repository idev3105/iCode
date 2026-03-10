import { useDiffStore } from "@/stores/diffStore";
import { ipc } from "@/services/ipc";
import { useCallback } from "react";
import { CheckCircle, XCircle, GitCommit, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FileDiff, DiffHunk } from "@/services/ipc/types";

function HunkBlock({ hunk, filePath }: { hunk: DiffHunk; filePath: string }) {
  const acceptHunk = useDiffStore((s) => s.acceptHunk);
  const rejectHunk = useDiffStore((s) => s.rejectHunk);

  const handleAccept = useCallback(async () => {
    await ipc.acceptHunk(hunk.id);
    acceptHunk(filePath, hunk.id);
  }, [hunk.id, filePath]);

  const handleReject = useCallback(async () => {
    await ipc.rejectHunk(hunk.id);
    rejectHunk(filePath, hunk.id);
  }, [hunk.id, filePath]);

  const isResolved = hunk.status !== "pending";

  return (
    <div
      className={cn(
        "border border-border rounded overflow-hidden mt-2",
        hunk.status === "rejected" && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border text-xs font-mono text-muted-foreground">
        <span>{hunk.header}</span>
        {!isResolved && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-green-500 hover:text-green-600 hover:bg-green-500/10 border-green-500/20"
              onClick={handleAccept}
              title="Accept hunk"
            >
              <CheckCircle className="h-3 w-3" />
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
              onClick={handleReject}
              title="Reject hunk"
            >
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        )}
        {isResolved && (
          <Badge
            variant={hunk.status === "accepted" ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0 h-4"
          >
            {hunk.status === "accepted" ? "✓ Accepted" : "✗ Rejected"}
          </Badge>
        )}
      </div>
      <div className="flex flex-col text-xs font-mono whitespace-pre bg-card overflow-x-auto p-2 leading-tight">
        {hunk.lines.map((line, idx) => {
          const sign = line[0];
          const content = line.slice(1);
          let bgClass = "text-muted-foreground";
          let signColor = "text-muted-foreground";

          if (sign === "+") {
            bgClass = "bg-[#b8bb26]/10 text-[#b8bb26]";
            signColor = "text-[#b8bb26]";
          } else if (sign === "-") {
            bgClass = "bg-[#fb4934]/10 text-[#fb4934]";
            signColor = "text-[#fb4934]";
          }

          return (
            <div key={idx} className={cn("flex px-2 rounded-sm", bgClass)}>
              <span
                className={cn("w-4 shrink-0 select-none opacity-70", signColor)}
              >
                {sign}
              </span>
              <span>{content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilePanel({ diff }: { diff: FileDiff }) {
  const pendingCount = diff.hunks.filter((h) => h.status === "pending").length;
  return (
    <div className="mb-4 bg-card border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2 font-mono text-xs text-secondary-foreground font-medium">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          {diff.file_path}
        </div>
        <div className="flex items-center gap-2 text-xs font-mono font-medium">
          <span className="text-green-500">+{diff.added_lines}</span>
          <span className="text-red-500">-{diff.removed_lines}</span>
          {pendingCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] ml-2 text-orange-500 border-orange-500/30 bg-orange-500/10"
            >
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </div>
      <div className="p-2 pt-0 flex flex-col">
        {diff.hunks.map((hunk) => (
          <HunkBlock key={hunk.id} hunk={hunk} filePath={diff.file_path} />
        ))}
      </div>
    </div>
  );
}

export function DiffViewer() {
  const pendingDiffs = useDiffStore((s) => s.pendingDiffs);
  const diffList = Object.values(pendingDiffs);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex items-center gap-2 p-3 px-4 border-b border-border shrink-0 text-xs font-semibold tracking-wide text-secondary-foreground">
        <GitCommit className="h-4 w-4" />
        <span>Changes</span>
        {diffList.length > 0 && (
          <Badge
            variant="secondary"
            className="px-1.5 min-w-5 justify-center h-4 text-[10px]"
          >
            {diffList.length}
          </Badge>
        )}
      </div>
      {diffList.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground text-sm">
          <GitCommit className="h-8 w-8 text-muted/50" />
          <p>No pending changes</p>
          <p className="text-xs opacity-70">
            Agent file writes will appear here
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {diffList.map((diff) => (
            <FilePanel key={diff.file_path} diff={diff} />
          ))}
        </div>
      )}
    </div>
  );
}
