import { useState, useEffect } from "react";
import { FolderOpen, ChevronRight, ChevronDown, FileText, Code2, FileJson, FileCode, Settings } from "lucide-react";
import { ipc } from "@/services/ipc";
import type { FileEntry } from "@/services/ipc/types";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  rootPath: string;
  activePath?: string;
  onFileClick: (name: string, path: string) => void;
}

function FileIcon({ name, isDir }: { name: string, isDir: boolean }) {
  if (isDir) return <FolderOpen className="h-3.5 w-3.5 text-primary/70" />;
  
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode className="h-3.5 w-3.5 text-blue-400" />;
    case 'json':
      return <FileJson className="h-3.5 w-3.5 text-yellow-400" />;
    case 'rs':
      return <Code2 className="h-3.5 w-3.5 text-orange-400" />;
    case 'css':
    case 'scss':
      return <FileText className="h-3.5 w-3.5 text-pink-400" />;
    case 'toml':
    case 'yaml':
    case 'yml':
    case 'config':
      return <Settings className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-muted-foreground/70" />;
  }
}

function TreeEntry({ entry, level, activePath, onFileClick }: { entry: FileEntry, level: number, activePath?: string, onFileClick: (name: string, path: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const isActive = activePath === entry.path;

  const toggle = async () => {
    if (!entry.is_dir) {
      onFileClick(entry.name, entry.path);
      return;
    }

    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen && children.length === 0) {
      setLoading(true);
      try {
        const res = await ipc.readDir(entry.path);
        setChildren(res);
      } catch (err) {
        console.error("Failed to read dir:", err);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col">
      <div 
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded hover:bg-accent/20 cursor-pointer select-none transition-colors",
          isOpen && entry.is_dir && "bg-accent/10",
          isActive && "bg-primary/20 text-primary border-r-2 border-primary"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={toggle}
      >
        <span className="w-3.5 flex items-center justify-center shrink-0">
          {entry.is_dir && (
            isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
        <FileIcon name={entry.name} isDir={entry.is_dir} />
        <span className={cn(
          "text-[11px] truncate flex-1",
          entry.is_dir ? "font-bold text-foreground/90" : "text-foreground/70",
          isActive && "text-primary font-bold"
        )}>
          {entry.name}
        </span>
      </div>
      
      {isOpen && entry.is_dir && (
        <div className="flex flex-col">
          {loading ? (
            <div className="py-1 px-8 text-[10px] text-muted-foreground italic animate-pulse">loading...</div>
          ) : (
            children.map(child => (
              <TreeEntry key={child.path} entry={child} level={level + 1} activePath={activePath} onFileClick={onFileClick} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({ rootPath, activePath, onFileClick }: FileExplorerProps) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await ipc.readDir(rootPath);
        if (active) setRootEntries(res);
      } catch (err) {
        console.error("Failed to load root:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [rootPath]);

  return (
    <div className="flex flex-col h-full font-mono overflow-y-auto no-scrollbar py-2">
      {loading ? (
        <div className="p-4 text-xs text-muted-foreground italic animate-pulse text-center">Reading directory...</div>
      ) : (
        rootEntries.map(entry => (
          <TreeEntry key={entry.path} entry={entry} level={0} activePath={activePath} onFileClick={onFileClick} />
        ))
      )}
    </div>
  );
}
