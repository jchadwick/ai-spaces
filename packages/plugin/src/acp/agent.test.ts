import { describe, expect, it, vi } from 'vitest';

vi.mock('@agentclientprotocol/sdk', () => ({
  PROTOCOL_VERSION: '1',
}));

vi.mock('@ai-spaces/shared', () => ({
  ACP_WORKSPACE_METHODS: {
    RESOLVE_PATH: 'workspace/resolve_path',
    WRITE_FILE: 'workspace/write_file',
    DELETE_FILE: 'workspace/delete_file',
    RENAME: 'workspace/rename',
    CREATE_DIRECTORY: 'workspace/create_directory',
    DELETE_DIRECTORY: 'workspace/delete_directory',
    PATCH_METADATA: 'workspace/patch_metadata',
    LIST_FILES: 'workspace/list_files',
    READ_FILE: 'workspace/read_file',
    GET_METADATA: 'workspace/get_metadata',
  },
  toSpaceRole: () => 'viewer',
}));

vi.mock('../logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock('../space-store.js', () => ({
  getSpace: () => ({ id: 'space-1', agentId: 'main', path: 'p', config: {} }),
  resolveSpaceRoot: () => '/tmp/space',
  listSpaces: () => [{ id: 'space-1', agentId: 'main', path: 'p', config: {} }],
}));

vi.mock('../chat-history.js', () => ({
  getOrCreateSession: () => ({ id: 's' }),
  addMessageToSession: vi.fn(),
  getSessionMessages: () => [],
}));

const forwardPromptMock = vi.fn();
vi.mock('./openclaw-client.js', () => ({
  openClawAcpClient: {
    getOrCreateSession: vi.fn(async () => 'session-1'),
    forwardPrompt: (...args: unknown[]) => forwardPromptMock(...args),
    cancelPrompt: vi.fn(),
  },
}));

vi.mock('./chat-policy.js', () => ({
  buildChatSystemPrompt: () => 'sys',
  classifyPrompt: () => ({ action: 'allow' }),
  sanitizeAssistantText: (text: string) => text,
  formatWorkspaceSummary: () => 'summary',
  removeInternalFiles: (f: unknown) => f,
  REFUSAL_MESSAGE: 'refuse',
}));

vi.mock('./workspace-ops.js', () => ({
  listWorkspaceFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  renameWorkspacePath: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  deleteWorkspaceDirectory: vi.fn(),
  getWorkspaceMetadata: vi.fn(),
  patchWorkspaceMetadata: vi.fn(),
}));

describe('AISpacesAgent prompt resilience', () => {
  it('returns end_turn and emits error update when forwardPrompt fails', async () => {
    forwardPromptMock.mockRejectedValueOnce(new Error('gateway down'));
    const sessionUpdate = vi.fn(async () => undefined);

    const { AISpacesAgent } = await import('./agent.js');
    const agent = new AISpacesAgent({ sessionUpdate } as never, 'space-1', 'viewer');

    const { sessionId } = await agent.newSession({ cwd: '/tmp/space' } as never);

    const result = await agent.prompt({
      sessionId,
      prompt: [{ type: 'text', text: 'hello' }],
    } as never);

    expect(result.stopReason).toBe('end_turn');
    expect(sessionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      update: expect.objectContaining({ sessionUpdate: 'agent_message_chunk' }),
    }));
  });
});
