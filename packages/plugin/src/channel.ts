import { createChannelPluginBase, type OpenClawConfig } from "openclaw/plugin-sdk/core";

export type ResolvedAccount = {
  accountId: string | null;
};

function resolveAccountId(params: { cfg: OpenClawConfig; accountId?: string }): string {
  return params.accountId ?? "";
}

const pluginBase = createChannelPluginBase({
  id: "ai-spaces",

  meta: {
    id: "ai-spaces",
    label: "AI Spaces",
    selectionLabel: "AI Spaces",
    docsPath: "/plugins/ai-spaces",
    blurb: "Share portions of your agent workspace with collaborators.",
  },

  capabilities: {
    chatTypes: ["direct"],
  },

  setup: {
    resolveAccountId,
    applyAccountConfig: (params: { cfg: OpenClawConfig; accountId: string; input: unknown }) => {
      return params.cfg;
    },
  },
});

// SDK 2026.5+ requires config.listAccountIds and config.resolveAccount on channel plugins
export const aiSpacesPlugin = {
  ...pluginBase,
  config: {
    ...((pluginBase as Record<string, unknown>).config as object),
    listAccountIds: (_cfg: OpenClawConfig) => ["default"] as string[],
    resolveAccount: (_cfg: OpenClawConfig, _accountId?: string) => ({}) as Record<string, unknown>,
  },
};
