import * as crypto from 'crypto';

export function computeSpaceId(agentId: string, relativePath: string): string {
  return crypto.createHash('sha256').update(`${agentId}:${relativePath}`).digest('hex');
}
