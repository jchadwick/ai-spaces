import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logFileModification, getRecentModifications, getFileModifications } from './file-history.js';

describe('file-history', () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let originalOpenclawHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'file-history-test-'));
    originalHome = process.env.HOME;
    originalOpenclawHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_HOME = tempHome;
    
    const workspaceDir = path.join(tempHome, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'test-space'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalOpenclawHome !== undefined) {
      process.env.OPENCLAW_HOME = originalOpenclawHome;
    } else {
      delete process.env.OPENCLAW_HOME;
    }
  });

  describe('logFileModification', () => {
    it('should create .space directory if it does not exist', () => {
      const spacePath = path.join(tempHome, 'workspace', 'new-space');
      fs.mkdirSync(spacePath, { recursive: true });

      logFileModification('new-space', 'test.txt', 'modified', 'session-1', 'agent');

      const historyFile = path.join(tempHome, 'workspace', 'new-space', '.space', 'history.json');
      expect(fs.existsSync(historyFile)).toBe(true);
    });

    it('should append modification to history file', () => {
      logFileModification('test-space', 'test.txt', 'modified', 'session-1', 'agent');

      const historyPath = path.join(tempHome, 'workspace', 'test-space', '.space', 'history.json');
      const historyContent = fs.readFileSync(historyPath, 'utf-8');
      const history = JSON.parse(historyContent);

      expect(history.modifications).toHaveLength(1);
      expect(history.modifications[0].path).toBe('test.txt');
      expect(history.modifications[0].action).toBe('modified');
      expect(history.modifications[0].sessionId).toBe('session-1');
      expect(history.modifications[0].triggeredBy).toBe('agent');
    });

    it('should track multiple modifications', () => {
      logFileModification('test-space', 'file1.txt', 'created', 'session-1', 'user');
      logFileModification('test-space', 'file2.md', 'modified', 'session-1', 'agent');
      logFileModification('test-space', 'file1.txt', 'modified', 'session-1', 'agent');

      const historyPath = path.join(tempHome, 'workspace', 'test-space', '.space', 'history.json');
      const historyContent = fs.readFileSync(historyPath, 'utf-8');
      const history = JSON.parse(historyContent);

      expect(history.modifications).toHaveLength(3);
    });

    it('should include timestamp for each modification', () => {
      const before = new Date().toISOString();
      
      logFileModification('test-space', 'test.txt', 'modified', 'session-1', 'agent');
      
      const historyPath = path.join(tempHome, 'workspace', 'test-space', '.space', 'history.json');
      const after = new Date().toISOString();
      const historyContent = fs.readFileSync(historyPath, 'utf-8');
      const history = JSON.parse(historyContent);
      const timestamp = history.modifications[0].timestamp;

      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });
  });

  describe('getRecentModifications', () => {
    it('should return empty array when no history exists', () => {
      const mods = getRecentModifications('nonexistent', 10);
      expect(mods).toEqual([]);
    });

    it('should return latest N modifications', () => {
      logFileModification('test-space', 'file1.txt', 'created', 'session-1', 'user');
      logFileModification('test-space', 'file2.md', 'modified', 'session-1', 'agent');
      logFileModification('test-space', 'file3.txt', 'created', 'session-1', 'user');

      const mods = getRecentModifications('test-space', 2);

      expect(mods).toHaveLength(2);
      expect(mods[0].path).toBe('file2.md');
      expect(mods[1].path).toBe('file3.txt');
    });

    it('should return all modifications when limit is greater than total', () => {
      logFileModification('test-space', 'file1.txt', 'created', 'session-1', 'user');
      logFileModification('test-space', 'file2.md', 'modified', 'session-1', 'agent');

      const mods = getRecentModifications('test-space', 100);

      expect(mods).toHaveLength(2);
    });
  });

  describe('getFileModifications', () => {
    it('should return modifications for specific file', () => {
      logFileModification('test-space', 'file1.txt', 'created', 'session-1', 'user');
      logFileModification('test-space', 'file2.md', 'modified', 'session-1', 'agent');
      logFileModification('test-space', 'file1.txt', 'modified', 'session-1', 'agent');

      const mods = getFileModifications('test-space', 'file1.txt');

      expect(mods).toHaveLength(2);
      expect(mods[0].path).toBe('file1.txt');
      expect(mods[1].path).toBe('file1.txt');
    });

    it('should return empty array for non-existent file', () => {
      logFileModification('test-space', 'file1.txt', 'created', 'session-1', 'user');

      const mods = getFileModifications('test-space', 'nonexistent.txt');

      expect(mods).toEqual([]);
    });
  });
});