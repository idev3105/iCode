import { useEffect, useRef, memo, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { FileCode, Save, Loader2, Check } from "lucide-react";
import { ipc } from "@/services/ipc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getLanguageExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return javascript({
        typescript: ext === "ts" || ext === "tsx",
        jsx: ext === "jsx" || ext === "tsx",
      });
    case "rs":
      return rust();
    case "py":
      return python();
    case "css":
      return css();
    case "html":
      return html();
    case "json":
      return json();
    case "md":
      return markdown();
    default:
      return javascript();
  }
}

interface CodeEditorProps {
  filename: string;
  path: string;
}

export const CodeEditor = memo(function CodeEditor({
  filename,
  path,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [content, setContent] = useState("");
  const contentRef = useRef("");

  // Load file content
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await ipc.readFileContent(path);
        if (active) {
          setContent(res);
          contentRef.current = res;
        }
      } catch (err) {
        console.error("Failed to read file:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [path]);

  // Initialize/Update CodeMirror
  useEffect(() => {
    if (!containerRef.current || loading) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        getLanguageExtension(filename),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            contentRef.current = update.state.doc.toString();
            if (saved) setSaved(false);
          }
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13px",
            backgroundColor: "#1d2021",
            color: "#ebdbb2",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          },
          ".cm-gutters": {
            backgroundColor: "#1d2021",
            color: "#928374",
            border: "none",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "#3c3836",
            color: "#ebdbb2",
          },
          ".cm-activeLine": {
            backgroundColor: "#3c383633",
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: "#504945 !important",
          },
          ".cm-cursor": {
            borderLeftColor: "#fe8019",
          },
          ".cm-content": { paddingBottom: "200px" },
        }, { dark: true }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [filename, loading]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.writeFileContent(path, contentRef.current);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save file:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/30 shrink-0 select-none">
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground uppercase tracking-widest font-semibold">
          <FileCode className="h-3.5 w-3.5 text-primary/70" />
          <span className="truncate max-w-[300px]">{filename}</span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleSave}
          disabled={saving || loading}
          className={cn(
            "h-7 text-[10px] font-bold gap-1.5 px-3 transition-all",
            saved ? "text-green-500 hover:text-green-500 bg-green-500/10" : "text-primary hover:bg-primary/10"
          )}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          {saving ? "SAVING..." : saved ? "SAVED" : "SAVE"}
        </Button>
      </div>
      
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-[#1d2021]">
          <Loader2 className="h-6 w-6 animate-spin opacity-20" />
          <span className="text-xs font-mono italic opacity-40">Loading source...</span>
        </div>
      ) : (
        <div
          className="flex-1 overflow-hidden bg-[#1d2021] [&>div]:h-full"
          ref={containerRef}
        />
      )}
    </div>
  );
});

export function EditorPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground bg-background">
      <FileCode className="w-16 h-16 opacity-10" strokeWidth={1} />
      <div className="text-center space-y-1">
        <p className="text-sm font-medium opacity-40 uppercase tracking-widest">No file selected</p>
        <p className="text-[11px] opacity-30 italic">
          Select a file from the explorer to view or edit
        </p>
      </div>
    </div>
  );
}
