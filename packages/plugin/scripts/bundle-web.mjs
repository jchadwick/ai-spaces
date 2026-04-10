import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(__dirname, '..');
const sharedDist = resolve(pluginDir, '../shared/dist');
const webDist = resolve(pluginDir, '../web/dist');
const pluginDist = resolve(__dirname, '../dist');
const pluginWebDist = resolve(pluginDist, 'web');

// Bundle shared package
const sharedTarget = resolve(pluginDist, 'shared');
if (existsSync(sharedDist)) {
  mkdirSync(sharedTarget, { recursive: true });
  cpSync(sharedDist, sharedTarget, { recursive: true });
  console.log('Bundled shared package into plugin');
} else {
  console.log('Shared dist not found, skipping bundle');
}

// Bundle web assets
if (existsSync(webDist)) {
  mkdirSync(pluginWebDist, { recursive: true });
  cpSync(webDist, pluginWebDist, { recursive: true });
  console.log('Bundled web assets into plugin');
} else {
  console.log('Web dist not found, skipping bundle');
}