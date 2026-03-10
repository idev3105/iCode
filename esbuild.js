const esbuild = require("esbuild");
const sveltePlugin = require("esbuild-svelte");
const sveltePreprocess = require("svelte-preprocess");
const postCSSPlugin = require("esbuild-postcss");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	// Extension build
	const extensionCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	// Webview build
	const webviewCtx = await esbuild.context({
		entryPoints: ['src/panel/webview/main.ts'],
		bundle: true,
		format: 'iife', // Browser-ready
		minify: production,
		sourcemap: !production,
		outfile: 'dist/webview.js',
		logLevel: 'silent',
		plugins: [
			postCSSPlugin(),
			sveltePlugin({
				preprocess: sveltePreprocess(),
				compilerOptions: {
					dev: false,
					css: 'injected'
				}
			}),
			esbuildProblemMatcherPlugin,
		],
	});

	if (watch) {
		await extensionCtx.watch();
		await webviewCtx.watch();
	} else {
		await extensionCtx.rebuild();
		await webviewCtx.rebuild();
		await extensionCtx.dispose();
		await webviewCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
