import { config } from "../config.js";
import { loadRegistrationState } from "../registration.js";
import { getSpace } from "../space-store.js";

interface InviteOptions {
  role?: string;
  json?: boolean;
}

export async function createInvite(spaceId: string, options: InviteOptions = {}) {
  // Validate role
  const validRoles = ["owner", "editor", "viewer"];
  const role = options.role ?? "editor";
  if (!validRoles.includes(role)) {
    if (options.json) {
    } else {
    }
    return;
  }

  // Check space exists locally
  const space = getSpace(spaceId);
  if (!space) {
    if (options.json) {
    } else {
    }
    return;
  }

  // Load registration state for authentication
  const registration = loadRegistrationState();
  if (!registration) {
    if (options.json) {
    } else {
    }
    return;
  }

  try {
    const response = await fetch(`${config.AI_SPACES_URL}/api/internal/invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spaceId,
        role,
        serverId: registration.serverId,
        callbackToken: registration.callbackToken,
      }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        if (options.json) {
        } else {
        }
        return;
      }
      if (response.status === 404) {
        if (options.json) {
        } else {
        }
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const _data = (await response.json()) as { inviteId: string; inviteUrl: string };

    if (options.json) {
    } else {
    }
  } catch (_error) {
    if (options.json) {
    } else {
    }
  }
}
