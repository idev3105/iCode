import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const DEV_SERVER_URL = 'http://localhost:5173';

function getCodiconStyles(context: vscode.ExtensionContext, webview: vscode.Webview): string {
	const codiconFontUri = webview.asWebviewUri(
		vscode.Uri.joinPath(context.extensionUri, 'dist', 'codicon.ttf')
	);
	const codiconCssPath = path.join(context.extensionPath, 'dist', 'codicon.css');
	return fs.readFileSync(codiconCssPath, 'utf8')
		.replace(/url\([^)]+\)/g, `url('${codiconFontUri}')`);
}

// for dev mode help hot reload UI changes, BUT NOT WORK :))
function getDevContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
	const codiconCss = getCodiconStyles(context, webview);

	// Dev mode: load from Vite dev server with HMR
	// CSP allows localhost for scripts/styles and ws: for HMR
	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' ${DEV_SERVER_URL}; font-src ${webview.cspSource}; script-src 'unsafe-inline' ${DEV_SERVER_URL}; connect-src ${DEV_SERVER_URL} ws://localhost:5173;">
	<style>${codiconCss}</style>
	<title>iCode (dev)</title>
</head>
<body>
	<script type="module">
		import RefreshRuntime from '${DEV_SERVER_URL}/@react-refresh';
		RefreshRuntime.injectIntoGlobalHook(window);
		window.$RefreshReg$ = () => {};
		window.$RefreshSig$ = () => (type) => type;
		window.__vite_plugin_react_preamble_installed__ = true;
	</script>
	<script type="module" src="${DEV_SERVER_URL}/main.tsx"></script>
</body>
</html>`;
}

function getProdContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css'));
	const codiconCss = getCodiconStyles(context, webview);

	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'unsafe-inline';">
	<style>
		body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); font-weight: var(--vscode-font-weight); }
		${codiconCss}
	</style>
	<link rel="stylesheet" href="${styleUri}">
	<title>iCode</title>
</head>
<body>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}

export function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext, devMode = false): string {
	return devMode
		? getProdContent(webview, context)
		: getProdContent(webview, context);
}
