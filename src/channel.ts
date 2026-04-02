/**
 * AI Spaces Channel Plugin
 * 
 * Creates the channel plugin for space-based sessions.
 */

import {
  createChannelPluginBase,
  createChatChannelPlugin,
} from 'openclaw/plugin-sdk/core';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/core';

export function createSpacesChannelPlugin() {
  const base = createChannelPluginBase({
    id: 'ai-spaces',
    
    setup: {
      resolveAccount(cfg: OpenClawConfig, accountId?: string | null) {
        const section = (cfg.channels as Record<string, unknown>)?.['ai-spaces'];
        return {
          accountId: accountId ?? null,
          enabled: (section as { enabled?: boolean })?.enabled ?? true,
          configured: true,
        };
      },
      
      inspectAccount(cfg: OpenClawConfig, accountId?: string | null) {
        const section = (cfg.channels as Record<string, unknown>)?.['ai-spaces'];
        return {
          enabled: (section as { enabled?: boolean })?.enabled ?? true,
          configured: true,
        };
      },
    },
  });

  return createChatChannelPlugin({
    base,
    
    // DM security: spaces use share tokens, not phone numbers
    security: {
      dm: {
        channelKey: 'ai-spaces',
        resolvePolicy: () => 'allowlist',
        resolveAllowFrom: () => [], // Share tokens handled separately
      },
    },
    
    // Threading: each space session is isolated
    threading: {
      topLevelReplyToMode: 'reply',
    },
    
    // Outbound: we don't send outbound messages directly
    // The agent uses the standard message tool
    outbound: {
      attachedResults: {
        sendText: async () => {
          // Spaces don't have outbound messaging
          // They use the share link web UI instead
          return { messageId: undefined };
        },
      },
    },
  });
}