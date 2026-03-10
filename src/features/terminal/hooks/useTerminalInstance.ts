import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";

export function useTerminalInstance(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onReady: (term: Terminal) => void,
  onData?: (data: string) => void,
  onResize?: (rows: number, cols: number) => void,
) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#1d2021",
        foreground: "#ebdbb2",
        cursor: "#fe8019",
        selectionBackground: "#504945",
        black: "#282828",
        red: "#cc241d",
        green: "#98971a",
        yellow: "#d79921",
        blue: "#458588",
        magenta: "#b16286",
        cyan: "#689d6a",
        white: "#a89984",
        brightBlack: "#928374",
        brightRed: "#fb4934",
        brightGreen: "#b8bb26",
        brightYellow: "#fabd2f",
        brightBlue: "#83a598",
        brightMagenta: "#d3869b",
        brightCyan: "#8ec07c",
        brightWhite: "#ebdbb2",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      allowTransparency: true,
      convertEol: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    // Handle user input
    term.onData((data) => {
      if (onData) onData(data);
    });

    // Handle resize
    term.onResize(({ rows, cols }) => {
      if (onResize) onResize(rows, cols);
    });

    termRef.current = term;
    fitRef.current = fitAddon;
    onReady(term);

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  return { termRef, fitRef };
}
