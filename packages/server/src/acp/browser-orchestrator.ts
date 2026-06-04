import type { SpaceRecord } from '../space-store.js';
import type { SpaceRole } from '@ai-spaces/shared';
import { buildTopicPromptContext } from '../context/topic-context.js';
import { getActiveTopic, normalizeTopicPath, type TopicTargetType } from '../topics/topic-store.js';

type Packet = {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

const ALLOWED_BROWSER_METHODS = new Set([
  'initialize',
  'authenticate',
  'session/new',
  'session/load',
  'session/prompt',
  'session/cancel',
]);

function cwdToTopicPath(cwd: unknown): string {
  if (typeof cwd !== 'string') throw new Error('Session cwd is required');
  return normalizeTopicPath(cwd);
}

export class BrowserAcpOrchestrator {
  private readonly pendingNewTopics = new Map<string | number, string>();
  private readonly sessionTopics = new Map<string, string>();

  constructor(private readonly space: SpaceRecord, private readonly role: SpaceRole) {}

  async filterClientChunk(chunk: Buffer): Promise<{ forward?: Buffer; response?: Buffer }> {
    const packet = JSON.parse(chunk.toString('utf8').trim()) as Packet;
    if (!packet.method) return { forward: chunk };
    if (!ALLOWED_BROWSER_METHODS.has(packet.method)) {
      return { response: this.error(packet.id, 'Browser ACP method is not allowed') };
    }

    if (packet.method === 'session/new' || packet.method === 'session/load') {
      const params = packet.params ?? {};
      const topicPath = cwdToTopicPath(params.cwd);
      const topic = this.requireActiveTopic(topicPath);
      if (packet.method === 'session/load') {
        const sessionId = String(params.sessionId ?? '');
        if (!sessionId || (topic.acpSessionId && topic.acpSessionId !== sessionId)) {
          return { response: this.error(packet.id, 'Session does not belong to active topic') };
        }
        this.sessionTopics.set(sessionId, topicPath);
      } else if (packet.id !== undefined) {
        this.pendingNewTopics.set(packet.id, topicPath);
      }
      packet.params = {
        ...params,
        cwd: topicPath === '/' ? '' : topicPath.slice(1),
        _meta: { aiSpacesSystemContext: await buildTopicPromptContext(this.space, topicPath, topic.targetType as TopicTargetType, this.role) },
      };
    }

    if (packet.method === 'session/prompt') {
      const params = packet.params ?? {};
      const sessionId = String(params.sessionId ?? '');
      const topicPath = this.sessionTopics.get(sessionId);
      if (!topicPath) return { response: this.error(packet.id, 'Prompt session is not active') };
      const topic = this.requireActiveTopic(topicPath);
      packet.params = {
        ...params,
        _meta: { aiSpacesSystemContext: await buildTopicPromptContext(this.space, topicPath, topic.targetType as TopicTargetType, this.role) },
      };
    }

    return { forward: Buffer.from(`${JSON.stringify(packet)}\n`) };
  }

  observeGatewayChunk(chunk: Buffer): void {
    const packet = JSON.parse(chunk.toString('utf8').trim()) as Packet;
    if (packet.id === undefined || !packet.result) return;
    const topicPath = this.pendingNewTopics.get(packet.id);
    const sessionId = packet.result.sessionId;
    if (topicPath && typeof sessionId === 'string') {
      this.sessionTopics.set(sessionId, topicPath);
      this.pendingNewTopics.delete(packet.id);
    }
  }

  private requireActiveTopic(topicPath: string) {
    if (topicPath === '/') return { topicPath: '/', targetType: 'root', acpSessionId: null };
    const topic = getActiveTopic(this.space.id, topicPath);
    if (!topic) throw new Error('Topic is not active');
    return topic;
  }

  private error(id: Packet['id'], message: string): Buffer {
    return Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message } })}\n`);
  }
}
