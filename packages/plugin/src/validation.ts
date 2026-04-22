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

  if (fs.existsSync(resolvedPath)) {
    const symlinkValidation = validateSymlink(resolvedPath, normalizedSpaceRoot);
    if (!symlinkValidation.valid) {
      return symlinkValidation;
    }
  }

  return { valid: true, resolvedPath };
}

export function isPathContained(resolvedPath: string, containerPath: string): boolean {
  // Use path.resolve to canonicalize both paths (handles .., ., extra separators)
  const canonicalResolved = path.resolve(resolvedPath);
  const canonicalContainer = path.resolve(containerPath);

  // Ensure the container path ends with the separator so that a directory named
  // "/foo/barExtra" is not considered contained within "/foo/bar".
  const containerWithSep = canonicalContainer.endsWith(path.sep)
    ? canonicalContainer
    : canonicalContainer + path.sep;

  // On case-insensitive filesystems (macOS APFS/HFS+, Windows NTFS) the OS
  // treats paths differing only in case as identical.  A string comparison
  // without case normalisation can be bypassed by supplying a path whose
  // upper/lower-case letters differ from those of the resolved base directory.
  // Lowercasing both sides makes the containment check immune to that attack.
  const lowerResolved = canonicalResolved.toLowerCase();
  const lowerContainerWithSep = containerWithSep.toLowerCase();

  // The resolved path is contained if it equals the container dir exactly
  // (i.e. the path points to the root itself) or if it starts with the
  // container dir prefix (i.e. it is a file/dir inside).
  return (
    lowerResolved === canonicalContainer.toLowerCase() ||
    lowerResolved.startsWith(lowerContainerWithSep)
  );
}

function validateSymlink(
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