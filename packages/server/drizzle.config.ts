import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.AI_SPACES_DB || '.ai-spaces.db',
  },
});