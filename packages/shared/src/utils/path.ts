import * as path from 'path';
import * as fs from 'fs';

export interface PathValidationResult {
  valid: boolean;
  resolvedPath: string | null;
  error?: string;
}

export function validatePath(
  userPath: string,
  spaceRoot: string
): PathValidationResult {
  if (!userPath || typeof userPath !== 'string') {
    return { valid: false, resolvedPath: null, error: 'Invalid path' };
  }

  if (userPath.includes('\0')) {
    return { valid: false, resolvedPath: null, error: 'Invalid path' };
  }

  if (path.isAbsolute(userPath)) {
    return { valid: false, resolvedPath: null, error: 'Access denied' };
  }

  const normalizedSpaceRoot = path.resolve(spaceRoot);

  let resolvedPath: string;
  try {
    resolvedPath = path.resolve(normalizedSpaceRoot, userPath);
  } catch {
    return { valid: false, resolvedPath: null, error: 'Invalid path' };
  }

  if (!isPathContained(resolvedPath, normalizedSpaceRoot)) {
    return { valid: false, resolvedPath: null, error: 'Access denied' };
  }

  return resolveWorkspacePath(resolvedPath, normalizedSpaceRoot);
}

function canonicalizeExistingPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function realpathExistingSymlink(filePath: string): string | null {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
}

function resolveWorkspacePath(resolvedLogicalPath: string, normalizedSpaceRoot: string): PathValidationResult {
  const realSpaceRoot = canonicalizeExistingPath(normalizedSpaceRoot);
  const relativePath = path.relative(normalizedSpaceRoot, resolvedLogicalPath);
  const segments = relativePath.split(path.sep).filter(Boolean);
  const visitedSymlinks = new Set<string>();

  let currentRealPath = realSpaceRoot;

  try {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const candidateRealPath = path.join(currentRealPath, segment);

      let stats: fs.Stats;
      try {
        stats = fs.lstatSync(candidateRealPath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          return { valid: false, resolvedPath: null, error: 'Invalid path' };
        }
        const targetPath = path.join(currentRealPath, ...segments.slice(index));
        return isPathContained(targetPath, realSpaceRoot)
          ? { valid: true, resolvedPath: targetPath }
          : { valid: false, resolvedPath: null, error: 'Access denied' };
      }

      if (!stats.isSymbolicLink()) {
        currentRealPath = candidateRealPath;
        continue;
      }

      const symlinkRealPath = realpathExistingSymlink(candidateRealPath);
      if (!symlinkRealPath) {
        return { valid: false, resolvedPath: null, error: 'Invalid path' };
      }
      if (visitedSymlinks.has(symlinkRealPath)) {
        return { valid: false, resolvedPath: null, error: 'Invalid path' };
      }
      visitedSymlinks.add(symlinkRealPath);

      if (!isPathContained(symlinkRealPath, realSpaceRoot)) {
        return { valid: false, resolvedPath: null, error: 'Access denied' };
      }

      currentRealPath = symlinkRealPath;
    }

    return isPathContained(currentRealPath, realSpaceRoot)
      ? { valid: true, resolvedPath: currentRealPath }
      : { valid: false, resolvedPath: null, error: 'Access denied' };
  } catch {
    return { valid: false, resolvedPath: null, error: 'Invalid path' };
  }
}

export function isPathContained(resolvedPath: string, containerPath: string): boolean {
  const canonicalResolved = path.resolve(resolvedPath);
  const canonicalContainer = path.resolve(containerPath);

  const containerWithSep = canonicalContainer.endsWith(path.sep)
    ? canonicalContainer
    : canonicalContainer + path.sep;

  const lowerResolved = canonicalResolved.toLowerCase();
  const lowerContainerWithSep = containerWithSep.toLowerCase();

  return (
    lowerResolved === canonicalContainer.toLowerCase() ||
    lowerResolved.startsWith(lowerContainerWithSep)
  );
}

export function validateSymlink(
  filePath: string,
  spaceRoot: string
): PathValidationResult {
  try {
    let currentPath = filePath;
    const visitedPaths = new Set<string>();

    while (true) {
      if (visitedPaths.has(currentPath)) {
        return { valid: false, resolvedPath: null, error: 'Invalid path' };
      }
      visitedPaths.add(currentPath);

      const stats = fs.lstatSync(currentPath);

      if (stats.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(currentPath);
        const resolvedTarget = path.resolve(path.dirname(currentPath), linkTarget);

        if (!isPathContained(resolvedTarget, spaceRoot)) {
          return { valid: false, resolvedPath: null, error: 'Access denied' };
        }

        currentPath = resolvedTarget;
      } else {
        break;
      }
    }

    return { valid: true, resolvedPath: currentPath };
  } catch {
    return { valid: false, resolvedPath: null, error: 'Invalid path' };
  }
}

export function sanitizeFilename(filename: string): string | null {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  if (filename.includes('\0')) {
    return null;
  }

  const dangerousPatterns = ['../', '..\\', '/', '\\', '<', '>', ':', '"', '|', '?', '*'];
  for (const pattern of dangerousPatterns) {
    if (filename.includes(pattern)) {
      return null;
    }
  }

  if (filename === '.' || filename === '..') {
    return null;
  }

  return filename;
}
