import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function getWebviewContent(_webview: vscode.Webview, context: vscode.ExtensionContext): string {
	const distPath = path.join(context.extensionPath, 'dist');
	const scriptContent = fs.readFileSync(path.join(distPath, 'webview.js'), 'utf8');
	const styleContent = fs.readFileSync(path.join(distPath, 'webview.css'), 'utf8');

	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
	<style>${styleContent}</style>
	<title>iCode</title>
</head>
<body>
	<script>${scriptContent}</script>
</body>
</html>`;
}
