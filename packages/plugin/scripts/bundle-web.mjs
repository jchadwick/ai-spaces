import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(__dirname, '../../web/dist');
const pluginDist = resolve(__dirname, '../dist/web');

if (existsSync(webDist)) {
  mkdirSync(pluginDist, { recursive: true });
  cpSync(webDist, pluginDist, { recursive: true });
  console.log('Bundled web assets into plugin');
} else {
  console.log('Web dist not found, skipping bundle');
}