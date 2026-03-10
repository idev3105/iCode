import * as http from 'http';
import * as vscode from 'vscode';

export class HookServer implements vscode.Disposable {
  private server: http.Server;
  private output: vscode.OutputChannel;
  readonly port: number;
  private onEvent: ((event: Record<string, unknown>) => void) | undefined;

  constructor(port = 3500, onEvent?: (event: Record<string, unknown>) => void) {
    this.port = port;
    this.onEvent = onEvent;
    this.output = vscode.window.createOutputChannel('iCode Hooks');
    this.server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const event = JSON.parse(body) as Record<string, unknown>;
            this.output.appendLine(`[${event.hook_event_name ?? 'event'}] ${JSON.stringify(event, null, 2)}`);
            this.onEvent?.(event);
          } catch {
            this.output.appendLine(`[raw] ${body}`);
          }
          res.writeHead(200).end();
        });
      } else {
        res.writeHead(405).end();
      }
    });
    this.server.listen(port);
  }

  dispose(): void {
    this.server.close();
    this.output.dispose();
  }
}
