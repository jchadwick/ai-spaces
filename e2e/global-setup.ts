import { mkdir } from 'fs/promises';

export default async function globalSetup() {
  await mkdir('/tmp/openclaw-test', { recursive: true });
  await mkdir('/tmp/ai-spaces-test-data', { recursive: true });
}
