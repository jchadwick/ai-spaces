import { describe, expect, it } from 'vitest';
import type { FileNodeType, SpaceMetadata } from '@ai-spaces/shared';
import { filterRestrictedNodes, isPathRestricted, restrictedAncestorForPath } from './restricted-paths.js';

const metadata: SpaceMetadata = {
  files: {
    Secret: { restricted: true },
    'Room/private.md': { restricted: true },
    'Room/public.md': { summary: 'Allowed file' },
  },
};

describe('restricted path helpers', () => {
  it('matches exact restricted paths and descendants', () => {
    expect(restrictedAncestorForPath(metadata, 'Secret')).toBe('Secret');
    expect(restrictedAncestorForPath(metadata, 'Secret/notes.md')).toBe('Secret');
    expect(restrictedAncestorForPath(metadata, 'Room/private.md')).toBe('Room/private.md');
  });

  it('normalizes leading and trailing slashes', () => {
    expect(isPathRestricted(metadata, '/Secret/notes.md')).toBe(true);
    expect(isPathRestricted(metadata, 'Secret/notes.md/')).toBe(true);
    expect(isPathRestricted(metadata, '/Room/public.md')).toBe(false);
  });

  it('filters restricted nodes and descendants from file trees', () => {
    const nodes: FileNodeType[] = [
      {
        name: 'Secret',
        path: 'Secret',
        type: 'directory',
        children: [{ name: 'notes.md', path: 'Secret/notes.md', type: 'file' }],
      },
      {
        name: 'Room',
        path: 'Room',
        type: 'directory',
        children: [
          { name: 'public.md', path: 'Room/public.md', type: 'file' },
          { name: 'private.md', path: 'Room/private.md', type: 'file' },
        ],
      },
    ];

    expect(filterRestrictedNodes(nodes, metadata)).toEqual([
      {
        name: 'Room',
        path: 'Room',
        type: 'directory',
        children: [{ name: 'public.md', path: 'Room/public.md', type: 'file' }],
      },
    ]);
  });
});
