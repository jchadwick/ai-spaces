export function computeSpaceId(_agentId: string, relativePath: string): string {
  return relativePath
    .toLowerCase()
    .replace(/[/\\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}
