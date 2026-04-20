import { defineConfig } from 'drizzle-kit';
import { config } from './src/config.js';

export default defineConfig({
  schema: './src/db/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: config.AI_SPACES_DB,
  },
});