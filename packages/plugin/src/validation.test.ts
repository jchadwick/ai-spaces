import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validatePath, isPathContained, sanitizeFilename } from './validation.js';

describe('validatePath', () => {
  let tempDir: string;
  let spaceRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-test-'));
    spaceRoot = path.join(tempDir, 'space');
    fs.mkdirSync(spaceRoot, { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, 'test.txt'), 'content');
    fs.mkdirSync(path.join(spaceRoot, 'subdir'));
    fs.writeFileSync(path.join(spaceRoot, 'subdir', 'nested.txt'), 'nested content');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should allow valid paths inside space root', () => {
    const result = validatePath('test.txt', spaceRoot);
    expect(result.valid).toBe(true);
    expect(result.resolvedPath).toBe(path.join(spaceRoot, 'test.txt'));
  });

  it('should allow nested paths inside space root', () => {
    const result = validatePath('subdir/nested.txt', spaceRoot);
    expect(result.valid).toBe(true);
    expect(result.resolvedPath).toBe(path.join(spaceRoot, 'subdir', 'nested.txt'));
  });

  it('should allow paths with ./ prefix', () => {
    const result = validatePath('./test.txt', spaceRoot);
    expect(result.valid).toBe(true);
    expect(result.resolvedPath).toBe(path.join(spaceRoot, 'test.txt'));
  });

  it('should block path traversal with ..', () => {
    const result = validatePath('../outside.txt', spaceRoot);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Access denied');
    expect(result.resolvedPath).toBeNull();
  });

  it('should block obfuscated traversal patterns', () => {
    const result = validatePath('./subdir/../../outside.txt', spaceRoot);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Access denied');
  });

  it('should block paths with null bytes', () => {
    const result = validatePath('test\0.txt', spaceRoot);
    expect(result.valid).toBe(false);
  });

  it('should block empty path', () => {
    const result = validatePath('', spaceRoot);
    expect(result.valid).toBe(false);
  });

  it('should handle non-existent paths', () => {
    const result = validatePath('nonexistent.txt', spaceRoot);
    expect(result.valid).toBe(true); // Path is valid even if file doesn't exist
  });

  describe('symlink handling', () => {
    it('should allow symlinks within space root', () => {
      const linkPath = path.join(spaceRoot, 'link.txt');
      fs.symlinkSync(path.join(spaceRoot, 'test.txt'), linkPath);
      
      const result = validatePath('link.txt', spaceRoot);
      expect(result.valid).toBe(true);
      
      fs.unlinkSync(linkPath);
    });

    it('should block symlinks pointing outside space root', () => {
      const outsideDir = path.join(tempDir, 'outside');
      fs.mkdirSync(outsideDir);
      fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');
      
      const linkPath = path.join(spaceRoot, 'escaped.txt');
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), linkPath);
      
      const result = validatePath('escaped.txt', spaceRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Access denied');
      
      fs.unlinkSync(linkPath);
    });
  });
});

describe('isPathContained', () => {
  it('should return true for paths inside container', () => {
    expect(isPathContained('/space/file.txt', '/space')).toBe(true);
    expect(isPathContained('/space/subdir/file.txt', '/space')).toBe(true);
  });

  it('should return false for paths outside container', () => {
    expect(isPathContained('/outside/file.txt', '/space')).toBe(false);
    expect(isPathContained('/space/../outside/file.txt', '/space')).toBe(false);
  });

  it('should handle paths with trailing slashes', () => {
    expect(isPathContained('/space/file.txt', '/space/')).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('should allow valid filenames', () => {
    expect(sanitizeFilename('test.txt')).toBe('test.txt');
    expect(sanitizeFilename('my-file.md')).toBe('my-file.md');
    expect(sanitizeFilename('file_123.json')).toBe('file_123.json');
  });

  it('should block null bytes', () => {
    expect(sanitizeFilename('test\0.txt')).toBeNull();
  });

  it('should block path separators', () => {
    expect(sanitizeFilename('test/file.txt')).toBeNull();
    expect(sanitizeFilename('test\\file.txt')).toBeNull();
  });

  it('should block parent directory references', () => {
    expect(sanitizeFilename('..')).toBeNull();
    expect(sanitizeFilename('.')).toBeNull();
  });

  it('should block empty input', () => {
    expect(sanitizeFilename('')).toBeNull();
  });
});