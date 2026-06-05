import { getSpace } from "../space-store.js";

export async function showSpace(spaceId: string, options: { json?: boolean } = {}) {
  const space = getSpace(spaceId);

  if (!space) {
    if (options.json) {
    } else {
    }
    return;
  }

  if (options.json) {
  } else {
    if (space.config.description) {
    }

    if (space.config.agent) {
      if (space.config.agent.capabilities && space.config.agent.capabilities.length > 0) {
      }
      if (space.config.agent.denied && space.config.agent.denied.length > 0) {
      }
    }
  }
}
