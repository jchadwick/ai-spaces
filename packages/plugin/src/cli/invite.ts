import { config } from '../config.js';
import { getSpace } from '../space-store.js';
import { loadRegistrationState } from '../registration.js';
import * as crypto from 'crypto';

interface InviteOptions {
  role?: string;
  json?: boolean;
}

export async function createInvite(spaceId: string, options: InviteOptions = {}) {
  // Validate role
  const validRoles = ['owner', 'editor', 'viewer'];
  const role = options.role ?? 'editor';
  if (!validRoles.includes(role)) {
    if (options.json) {
      console.log(JSON.stringify({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, null, 2));
    } else {
      console.log(`Error: Invalid role '${role}'. Must be one of: ${validRoles.join(', ')}`);
    }
    return;
  }

  // Check space exists locally
  const space = getSpace(spaceId);
  if (!space) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Space not found', spaceId }, null, 2));
    } else {
      console.log(`Space not found: ${spaceId}`);
      console.log('');
      console.log('Use "openclaw spaces list" to see all available spaces.');
    }
    return;
  }

  // Load registration state for authentication
  const registration = loadRegistrationState();
  if (!registration) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Plugin not registered. Run "openclaw setup" first.' }, null, 2));
    } else {
      console.log('Error: Plugin not registered. Run "openclaw setup" first.');
    }
    return;
  }

  try {
    const response = await fetch(`${config.AI_SPACES_URL}/api/internal/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.GATEWAY_TOKEN}`,
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
          console.log(JSON.stringify({ error: 'Only space owners can create invites' }, null, 2));
        } else {
          console.log('Error: Only space owners can create invites');
        }
        return;
      }
      if (response.status === 404) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Space not found on server', spaceId }, null, 2));
        } else {
          console.log(`Error: Space not found on server: ${spaceId}`);
        }
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { inviteId: string; inviteUrl: string };

    if (options.json) {
      console.log(JSON.stringify({
        inviteId: data.inviteId,
        inviteUrl: data.inviteUrl,
        role,
        spaceId,
        spaceName: space.config.name,
      }, null, 2));
    } else {
      console.log('');
      console.log(`Invite created for: ${space.config.name}`);
      console.log('');
      console.log(`  Role:      ${role}`);
      console.log(`  Invite ID: ${data.inviteId}`);
      console.log('');
      console.log(`  Invite URL:`);
      console.log(`  ${data.inviteUrl}`);
      console.log('');
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to create invite' }, null, 2));
    } else {
      console.log(`Error: Failed to create invite: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}