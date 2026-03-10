import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
	const extensionUri = context.extensionUri;

	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));

	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
	<link href="${styleUri}" rel="stylesheet">
	<title>iCode</title>
</head>
<body>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}
