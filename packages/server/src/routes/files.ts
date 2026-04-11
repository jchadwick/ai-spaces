import { Router, type Request, type Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const filesRouter = Router();

const DEFAULT_ROOT = process.env.AI_SPACES_ROOT || path.join(process.env.HOME || '', 'ai-spaces-workspace');

filesRouter.get('/read', (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  
  if (!filePath) {
    res.status(400).json({ error: 'Path is required' });
    return;
  }
  
  const fullPath = path.join(DEFAULT_ROOT, filePath);
  
  if (!isPathSafe(fullPath, DEFAULT_ROOT)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

filesRouter.post('/write', (req: Request, res: Response) => {
  const { path: filePath, content } = req.body;
  
  if (!filePath || content === undefined) {
    res.status(400).json({ error: 'Path and content are required' });
    return;
  }
  
  const fullPath = path.join(DEFAULT_ROOT, filePath);
  
  if (!isPathSafe(fullPath, DEFAULT_ROOT)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

filesRouter.get('/list', (req: Request, res: Response) => {
  const dirPath = req.query.path as string || '';
  
  const fullPath = path.join(DEFAULT_ROOT, dirPath);
  
  if (!isPathSafe(fullPath, DEFAULT_ROOT)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Directory not found' });
    return;
  }
  
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

function isPathSafe(requestedPath: string, rootPath: string): boolean {
  const normalizedRequested = path.normalize(path.resolve(requestedPath));
  const normalizedRoot = path.normalize(path.resolve(rootPath));
  return normalizedRequested.startsWith(normalizedRoot);
}