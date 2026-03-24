import * as vscode from 'vscode';

import { COMMAND_EXPORT_DEFAULT_LAYOUT, COMMAND_SHOW_PANEL, VIEW_ID } from './constants.js';
import { startOpenClawWatcher, stopOpenClawWatcher } from './openclawWatcher.js';
import { PixelAgentsViewProvider } from './PixelAgentsViewProvider.js';

let providerInstance: PixelAgentsViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  const provider = new PixelAgentsViewProvider(context);
  providerInstance = provider;

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider));

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_PANEL, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_EXPORT_DEFAULT_LAYOUT, () => {
      provider.exportDefaultLayout();
    }),
  );

  // Start watching ~/.openclaw/agents/ for OpenClaw agent sessions (DECISIONS.md D8).
  // Runs alongside the existing Claude Code fileWatcher — both are unaffected by each other.
  // M5: Push a Disposable so VS Code cleans up on extension deactivation / uninstall,
  // in addition to the explicit stopOpenClawWatcher() call in deactivate().
  startOpenClawWatcher(context, provider);
  context.subscriptions.push({ dispose: () => stopOpenClawWatcher() });
}

export function deactivate() {
  stopOpenClawWatcher();
  providerInstance?.dispose();
}
