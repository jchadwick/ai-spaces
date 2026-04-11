import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { setupWebSocket } from './ws-server.js';
import { authRouter } from './routes/auth.js';
import { spacesRouter } from './routes/spaces.js';
import { filesRouter } from './routes/files.js';
import { chatRouter } from './routes/chat.js';
import { auditRouter } from './routes/audit.js';
import { seedAdmin } from './seed-admin.js';
import { authMiddleware } from './middleware/auth.js';

const PORT = parseInt(process.env.AI_SPACES_PORT || '3001', 10);
const WEB_DIST = process.env.WEB_DIST || path.join(process.env.HOME || '', 'ai-spaces', 'packages', 'web', 'dist');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/spaces', authMiddleware, spacesRouter);
app.use('/api/files', authMiddleware, filesRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/audit', auditRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  
  app.get('*', (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
  
  console.log(`Serving static files from: ${WEB_DIST}`);
}

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

setupWebSocket(wss);

server.listen(PORT, () => {
  console.log(`AI Spaces server running on port ${PORT}`);
  seedAdmin();
});

export { app, server };