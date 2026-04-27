export { LocalFileProvider } from '@ai-spaces/shared';
import type { FileProvider } from '@ai-spaces/shared';
import { LocalFileProvider } from '@ai-spaces/shared';
import { config } from './config.js';

export function createFileProvider(rootPath?: string): FileProvider {
  const root = rootPath || config.AI_SPACES_ROOT;
  return new LocalFileProvider(root);
}
