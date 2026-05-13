export const SpaceRoles = ['owner', 'editor', 'viewer'] as const;
export type SpaceRole = (typeof SpaceRoles)[number];

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

export function hasPermission(role: SpaceRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}

export function toSpaceRole(x: unknown): SpaceRole {
  if (typeof x === 'string' && SpaceRoles.includes(x as SpaceRole)) {
    return x as SpaceRole;
  }
  return 'viewer';
}
