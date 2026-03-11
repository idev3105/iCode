import * as http from 'http';
import * as vscode from 'vscode';

export class HookServer implements vscode.Disposable {
  private server: http.Server;
  private output: vscode.OutputChannel;
  private _port: number = 0;
  private onEvent: ((event: Record<string, unknown>) => void) | undefined;
  /** Resolves with the actual port once the server is listening. */
  readonly ready: Promise<number>;

  get port(): number { return this._port; }

  constructor(onEvent?: (event: Record<string, unknown>) => void) {
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

    this.ready = new Promise<number>((resolve, reject) => {
      this.server.once('listening', () => {
        const addr = this.server.address();
        this._port = typeof addr === 'object' && addr ? addr.port : 0;
        this.output.appendLine(`iCode Hook Server listening on port ${this._port}`);
        resolve(this._port);
      });

      this.server.once('error', reject);

      this.server.listen(0);
    });
  }

  dispose(): void {
    this.server.close();
    this.output.dispose();
  }
}
