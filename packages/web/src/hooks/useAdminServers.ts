import { useCallback, useEffect, useState } from "react";
import { useAPI } from "@/hooks/useAPI";

export type AdminServerStatus = "online" | "offline" | "revoked" | "unknown" | string;

export interface AdminServer {
  id: string;
  name: string;
  runtimeType: string;
  endpoint: string;
  status: AdminServerStatus;
  lastSeenAt?: string | null;
  createdAt: string;
  spaceCount?: number;
}

export interface PairingRegistration {
  registrationToken: string;
  expiresAt: string;
}

function getErrorMessage(response: Response, fallback: string): Promise<string> {
  return response
    .clone()
    .json()
    .then((data: { error?: string; message?: string }) => data.error ?? data.message ?? fallback)
    .catch(() => fallback);
}

export function useAdminServers() {
  const apiFetch = useAPI();
  const [servers, setServers] = useState<AdminServer[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiFetch("/api/admin/servers");
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to fetch servers"));
      }
      const data = (await response.json()) as { servers: AdminServer[] };
      setServers(data.servers);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const createPairingRegistration = useCallback(async (): Promise<PairingRegistration> => {
    const response = await apiFetch("/api/admin/servers/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "Failed to create pairing token"));
    }
    return (await response.json()) as PairingRegistration;
  }, [apiFetch]);

  const revokeServer = useCallback(
    async (serverId: string): Promise<void> => {
      const response = await apiFetch(`/api/admin/servers/${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to revoke server"));
      }
      await loadServers();
    },
    [apiFetch, loadServers],
  );

  return {
    servers,
    isLoading,
    loadError,
    reload: loadServers,
    createPairingRegistration,
    revokeServer,
  };
}
