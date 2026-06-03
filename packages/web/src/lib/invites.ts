export const PENDING_INVITE_TOKEN_KEY = "pendingInviteToken";

export type InviteFetch = (url: string, options?: RequestInit) => Promise<Response>;

export type InviteRedemptionResult = {
  spaceId?: string;
  role?: string;
};

export interface InviteRedemptionError extends Error {
  status?: number;
  code?: string;
}

export function readInviteTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;

  const token = new URLSearchParams(raw).get("token");
  return token && token.length > 0 ? token : null;
}

export function stripInviteHashFromUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function savePendingInviteToken(token: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
  } catch {
    // sessionStorage may be unavailable in some environments
  }
}

export function peekPendingInviteToken(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInviteToken(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch {
    // sessionStorage may be unavailable in some environments
  }
}

export function isInviteRedemptionError(error: unknown): error is InviteRedemptionError {
  return error instanceof Error && typeof (error as InviteRedemptionError).status === "number";
}

export function isTerminalInviteError(error: unknown): boolean {
  if (!isInviteRedemptionError(error)) return false;
  return [400, 404, 409].includes(error.status ?? -1);
}

export function createBearerFetch(accessToken: string): InviteFetch {
  return async (url, options = {}) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
      },
    });
}

function buildInviteError(message: string, status?: number, code?: string): InviteRedemptionError {
  const error = new Error(message) as InviteRedemptionError;
  error.name = "InviteRedemptionError";
  if (typeof status === "number") error.status = status;
  if (code) error.code = code;
  return error;
}

async function readResponsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { error: text };
  }
}

function getErrorMessage(payload: Record<string, unknown>, fallback: string): string {
  const error = payload["error"];
  const message = payload["message"];
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  return fallback;
}

export async function redeemInvite(fetchLike: InviteFetch, token: string): Promise<InviteRedemptionResult> {
  const response = await fetchLike("/api/invites/redeem", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    const error = buildInviteError(
      getErrorMessage(payload, `Invite redemption failed (${response.status})`),
      response.status,
      typeof payload["code"] === "string" ? payload["code"] : undefined,
    );
    throw error;
  }

  return {
    spaceId: typeof payload["spaceId"] === "string" ? payload["spaceId"] : undefined,
    role: typeof payload["role"] === "string" ? payload["role"] : undefined,
  };
}
