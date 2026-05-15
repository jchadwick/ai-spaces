import pino from 'pino';

export const logger = pino({
  name: 'ai-spaces-server',
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.LOG_PRETTY === 'true'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
