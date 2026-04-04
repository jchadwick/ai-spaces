import {
  createChannelPluginBase,
  type OpenClawConfig,
} from 'openclaw/plugin-sdk/core';

export type ResolvedAccount = {
  accountId: string | null;
};

function resolveAccountId(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): string {
  return params.accountId ?? '';
}

export const aiSpacesPlugin = createChannelPluginBase({
  id: 'ai-spaces',

  meta: {
    id: 'ai-spaces',
    label: 'AI Spaces',
    selectionLabel: 'AI Spaces',
    docsPath: '/plugins/ai-spaces',
    blurb: 'Share portions of your agent workspace with collaborators.',
  },

  capabilities: {
    chatTypes: ['direct'],
  },

  setup: {
    resolveAccountId,
    applyAccountConfig: (params: { cfg: OpenClawConfig; accountId: string; input: unknown }) => {
      return params.cfg;
    },
  },
});

console.log('[ai-spaces] Plugin loaded');