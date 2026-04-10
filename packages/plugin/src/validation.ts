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
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedContainer = path.normalize(containerPath);
  
  const relativePath = path.relative(normalizedContainer, normalizedResolved);
  
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return false;
  }
  
  return true;
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