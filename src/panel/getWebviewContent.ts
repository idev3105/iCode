import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
	const distPath = path.join(context.extensionPath, 'dist');
	const scriptContent = fs.readFileSync(path.join(distPath, 'webview.js'), 'utf8');
	const styleContent = fs.readFileSync(path.join(distPath, 'webview.css'), 'utf8');

	const codiconFontUri = webview.asWebviewUri(
		vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.ttf')
	);

	// Read codicon CSS and rewrite the font url to use the webview URI
	const codiconCssPath = path.join(context.extensionPath, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css');
	const codiconCss = fs.readFileSync(codiconCssPath, 'utf8')
		.replace(/url\([^)]+\)/g, `url('${codiconFontUri}')`);

	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'unsafe-inline';">
	<style>${codiconCss}</style>
	<style>${styleContent}</style>
	<title>iCode</title>
</head>
<body>
	<script>${scriptContent}</script>
</body>
</html>`;
}
