import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class DiffManager {
	private tempDir: string;

	constructor() {
		this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icode-'));
	}

	async showDiff(originalUri: vscode.Uri, label?: string): Promise<void> {
		const originalContent = await vscode.workspace.fs.readFile(originalUri);
		const fileName = path.basename(originalUri.fsPath);
		const tempPath = path.join(this.tempDir, `${Date.now()}-${fileName}`);

		fs.writeFileSync(tempPath, originalContent);
		const snapshotUri = vscode.Uri.file(tempPath);

		await vscode.commands.executeCommand(
			'vscode.diff',
			snapshotUri,
			originalUri,
			label ?? `iCode: ${fileName} (before → after)`
		);
	}

	async snapshotFile(fileUri: vscode.Uri): Promise<vscode.Uri> {
		const originalContent = await vscode.workspace.fs.readFile(fileUri);
		const fileName = path.basename(fileUri.fsPath);
		const tempPath = path.join(this.tempDir, `snapshot-${Date.now()}-${fileName}`);
		fs.writeFileSync(tempPath, originalContent);
		return vscode.Uri.file(tempPath);
	}

	async showDiffBetween(beforeUri: vscode.Uri, afterUri: vscode.Uri, label?: string): Promise<void> {
		const fileName = path.basename(afterUri.fsPath);
		await vscode.commands.executeCommand(
			'vscode.diff',
			beforeUri,
			afterUri,
			label ?? `iCode: ${fileName} (before → after)`
		);
	}

	dispose(): void {
		try {
			fs.rmSync(this.tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
}
