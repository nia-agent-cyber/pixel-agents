import type * as vscode from 'vscode';

export interface AgentState {
  id: number;
  /** Discriminates between Claude Code agents (terminal-based) and OpenClaw agents (JSONL-only). */
  source: 'claude-code' | 'openclaw';
  /** Present for claude-code source only; undefined for openclaw source. */
  terminalRef?: vscode.Terminal;
  /** OpenClaw agent identifier (e.g. 'bakkt-coder'). Present for openclaw source only. */
  agentId?: string;
  /** OpenClaw session key. Present for openclaw source only. */
  sessionKey?: string;
  projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>; // parentToolId → active sub-tool IDs
  activeSubagentToolNames: Map<string, Map<string, string>>; // parentToolId → (subToolId → toolName)
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
}

export interface PersistedAgent {
  id: number;
  source?: 'claude-code' | 'openclaw';
  /** Claude Code: terminal name used to re-match on restore. Optional for openclaw source. */
  terminalName?: string;
  /** OpenClaw: agent identifier for re-discovery on restore. */
  agentId?: string;
  /** OpenClaw: session key for re-discovery on restore. */
  sessionKey?: string;
  jsonlFile: string;
  projectDir: string;
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
}
