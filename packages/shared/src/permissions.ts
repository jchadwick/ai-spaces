export type SpaceRole = 'owner' | 'editor' | 'viewer';

export type Permission =
  | 'files:read'
  | 'files:write'
  | 'files:read-internal'
  | 'files:write-internal'
  | 'space:manage';

const ROLE_PERMISSIONS: Record<SpaceRole, readonly Permission[]> = {
  owner: ['files:read', 'files:write', 'files:read-internal', 'files:write-internal', 'space:manage'],
  editor: ['files:read', 'files:write'],
  viewer: ['files:read'],
};

export function toSpaceRole(role: string): SpaceRole {
  if (role === 'admin' || role === 'owner') return 'owner';
  if (role === 'editor') return 'editor';
  return 'viewer';
}

export function hasPermission(role: SpaceRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
