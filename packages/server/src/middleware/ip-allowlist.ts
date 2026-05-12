import { createMiddleware } from 'hono/factory';
import * as crypto from 'crypto';
import type { IncomingMessage } from 'http';

function ipToNum(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function ipInCidr(ip: string, cidr: string): boolean {
  if (cidr === '::1') return ip === '::1';
  const [range, bits] = cidr.split('/');
  const maskBits = parseInt(bits, 10);
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  const ipNum = ipToNum(ip);
  const rangeNum = ipToNum(range);
  if (ipNum === null || rangeNum === null) return false;
  return (ipNum >>> 0 & mask) === (rangeNum >>> 0 & mask);
}

const ALLOWED_CIDRS = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1'];

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

function isAllowedIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  return ALLOWED_CIDRS.some(cidr => ipInCidr(ip, cidr));
}

function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createInternalMiddleware(gatewayToken: string) {
  return createMiddleware(async (c, next) => {
    const env = c.env as { incoming?: IncomingMessage };
    const remoteIp = env?.incoming?.socket?.remoteAddress ?? '';

    if (!isAllowedIp(remoteIp)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const auth = c.req.header('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!timingSafeEqual(token, gatewayToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  });
}
