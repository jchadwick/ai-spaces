export { LocalFileProvider } from '@ai-spaces/shared';
import { LocalFileProvider } from '@ai-spaces/shared';
import type { FileProvider } from '@ai-spaces/shared';
import { config } from './config.js';

export function createFileProvider(): FileProvider {
  return new LocalFileProvider(config.AI_SPACES_ROOT);
}
