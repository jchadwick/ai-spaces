{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "opencode-go/minimax-m2.5",
      "workspace": "${OPENCLAW_SANDBOX_HOME}/workspace",
      "skipBootstrap": true,
      "models": {
        "opencode-go/minimax-m2.5": {
          "alias": "MiniMax"
        }
      },
      "heartbeat": {
        "every": "0"
      }
    },
    "list": [
      { "id": "main", "workspace": "${OPENCLAW_SANDBOX_HOME}/workspace" },
      { "id": "home", "workspace": "${OPENCLAW_SANDBOX_HOME}/workspaces/home" },
      { "id": "travel", "workspace": "${OPENCLAW_SANDBOX_HOME}/workspaces/travel" },
    ]
  },
  "auth": {
    "profiles": {
      "opencode-go:default": {
        "provider": "opencode-go",
        "mode": "api_key"
      }
    }
  }
}
