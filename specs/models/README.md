# Data Models

Core data structures for AI Spaces.

## Model Index

| Model | Description | Storage |
|-------|-------------|---------|
| [SpaceConfig.md](./SpaceConfig.md) | Space configuration file | `.space/spaces.json` |
| [Space.md](./Space.md) | Discovered space | In-memory (SpaceManager) |
| [Share.md](./Share.md) | Share link | `~/.openclaw/data/ai-spaces/shares.json` |
| [ShareStore.md](./ShareStore.md) | Share storage | `~/.openclaw/data/ai-spaces/shares.json` |
| [SessionContext.md](./SessionContext.md) | Scoped session | In-memory (Gateway sessions) |
| [FileHistory.md](./FileHistory.md) | Edit history (Post-MVP) | `.space/history.json` |
| [ChatHistory.md](./ChatHistory.md) | Chat history (Post-MVP) | `.space/chat-history.json` |