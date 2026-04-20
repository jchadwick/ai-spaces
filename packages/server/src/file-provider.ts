import * as fs from 'fs';
import * as path from 'path';
import type { FileProvider, FileEntry } from '@ai-spaces/shared';
import { config } from './config.js';

export class LocalFileProvider implements FileProvider {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.normalize(path.resolve(rootPath));
  }

  private validatePath(requestedPath: string): string {
    const fullPath = path.normalize(path.resolve(this.rootPath, requestedPath));
    
    if (!fullPath.startsWith(this.rootPath)) {
      throw new Error('Access denied: path outside root directory');
    }
    
    return fullPath;
  }

  async read(filePath: string): Promise<string> {
    const fullPath = this.validatePath(filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }
    
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      throw new Error('Cannot read directory as file');
    }
    
    return fs.readFileSync(fullPath, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    const fullPath = this.validatePath(filePath);
    
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  async list(dirPath: string): Promise<FileEntry[]> {
    const fullPath = this.validatePath(dirPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('Directory not found');
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
    
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.validatePath(filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }
    
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.validatePath(filePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }
}

export function createFileProvider(): FileProvider {
  return new LocalFileProvider(config.AI_SPACES_ROOT);
}