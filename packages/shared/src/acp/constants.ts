import type { SpaceRole } from '../permissions.js';

/**
 * ACP extension method names for workspace file operations.
 * These are custom methods (client → agent direction) since the plugin
 * owns the workspace filesystem — the inverse of standard ACP fs/* methods.
 */
export const ACP_WORKSPACE_METHODS = {
  LIST_FILES: 'workspace/list_files',
  READ_FILE: 'workspace/read_file',
  WRITE_FILE: 'workspace/write_file',
  DELETE_FILE: 'workspace/delete_file',
  RENAME: 'workspace/rename',
  CREATE_DIRECTORY: 'workspace/create_directory',
  DELETE_DIRECTORY: 'workspace/delete_directory',
  GET_METADATA: 'workspace/get_metadata',
  PATCH_METADATA: 'workspace/patch_metadata',
} as const;

export type AcpWorkspaceMethod = (typeof ACP_WORKSPACE_METHODS)[keyof typeof ACP_WORKSPACE_METHODS];

/** ACP extension notification for file change events pushed by the plugin. */
export const ACP_WORKSPACE_NOTIFICATIONS = {
  FILE_CHANGED: 'workspace/file_changed',
} as const;

export type AcpWorkspaceNotification =
  (typeof ACP_WORKSPACE_NOTIFICATIONS)[keyof typeof ACP_WORKSPACE_NOTIFICATIONS];

/** Capabilities the plugin advertises in the initialize response. */
export interface AcpWorkspaceCapabilities {
  workspace: {
    listFiles?: boolean;
    readFile?: boolean;
    writeFile?: boolean;
    deleteFile?: boolean;
    rename?: boolean;
    createDirectory?: boolean;
    deleteDirectory?: boolean;
    metadata?: boolean;
  };
}

/** Payload types for workspace extension methods */
export interface WorkspaceListFilesParams {
  spaceId: string;
  path: string;
  role: SpaceRole;
}

export interface WorkspaceReadFileParams {
  spaceId: string;
  path: string;
}

export interface WorkspaceWriteFileParams {
  spaceId: string;
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface WorkspaceDeleteFileParams {
  spaceId: string;
  path: string;
}

export interface WorkspaceRenameParams {
  spaceId: string;
  path: string;
  newPath: string;
}

export interface WorkspaceCreateDirectoryParams {
  spaceId: string;
  path: string;
}

export interface WorkspaceDeleteDirectoryParams {
  spaceId: string;
  path: string;
}

export interface WorkspaceGetMetadataParams {
  spaceId: string;
}

export interface WorkspacePatchMetadataParams {
  spaceId: string;
  files: Record<string, unknown>;
}

/** Payload for file change notifications */
export interface WorkspaceFileChangedPayload {
  spaceId: string;
  path: string;
  action: 'modified' | 'deleted' | 'created';
  triggeredBy: 'agent' | 'user';
}
