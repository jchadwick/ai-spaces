import { CopyIcon, PlusIcon, RefreshCwIcon, ServerIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  type AdminServer,
  type PairingRegistration,
  useAdminServers,
} from "@/hooks/useAdminServers";
import { cn } from "@/lib/utils";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "online" || normalized === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "revoked") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (normalized === "offline" || normalized === "unavailable") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-t-hair bg-t-bg-well text-t-ink-dim";
}

function getServerLabel(server: AdminServer): string {
  return server.name?.trim() || server.id;
}

export default function AdminServerManagement() {
  const { showToast } = useToast();
  const { servers, isLoading, loadError, reload, createPairingRegistration, revokeServer } =
    useAdminServers();
  const [pairing, setPairing] = useState<PairingRegistration | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [creatingPairing, setCreatingPairing] = useState(false);
  const [serverToRevoke, setServerToRevoke] = useState<AdminServer | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const aiSpacesUrl = useMemo(() => window.location.origin, []);
  const pairingCommand = pairing
    ? `openclaw ai-spaces pair --url ${aiSpacesUrl} --token ${pairing.registrationToken}`
    : "";

  const handleCreatePairing = async () => {
    setCreatingPairing(true);
    setPairingError(null);
    try {
      setPairing(await createPairingRegistration());
    } catch (err) {
      setPairingError(err instanceof Error ? err.message : "Failed to create pairing token");
    } finally {
      setCreatingPairing(false);
    }
  };

  const handleCopyPairingCommand = async () => {
    if (!pairingCommand) return;
    try {
      await navigator.clipboard.writeText(pairingCommand);
      showToast("Pairing command copied.", "success");
    } catch {
      showToast("Could not copy pairing command.", "error");
    }
  };

  const handleCopyToken = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.registrationToken);
      showToast("Pairing token copied.", "success");
    } catch {
      showToast("Could not copy pairing token.", "error");
    }
  };

  const handleClosePairingDialog = (open: boolean) => {
    if (!open) {
      setPairing(null);
      setPairingError(null);
    }
  };

  const handleRevokeServer = async () => {
    if (!serverToRevoke) return;
    setRevokingId(serverToRevoke.id);
    try {
      await revokeServer(serverToRevoke.id);
      showToast("Server revoked.", "success");
      setServerToRevoke(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to revoke server", "error");
    } finally {
      setRevokingId(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 font-sans text-t-ink-mid">Loading servers...</div>;
  }

  if (loadError) {
    return (
      <div className="font-sans">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-t-ink">Servers</h2>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
        <div className="rounded-[10px] border border-t-hair bg-t-bg-raised p-4 text-sm text-t-accent">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-t-ink">Servers</h2>
          <p className="m-0 mt-1 text-sm text-t-ink-dim">
            Registered agent runtimes available to AI Spaces.
          </p>
        </div>
        <Button onClick={handleCreatePairing} disabled={creatingPairing} size="sm">
          <PlusIcon />
          {creatingPairing ? "Creating..." : "Create Pairing"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-t-hair">
        <table className="min-w-[980px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-t-hair bg-t-bg-alt">
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Server
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Runtime
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Endpoint
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Status
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Last Seen
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Created
              </th>
              <th className="px-4 py-2.5 text-right font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Spaces
              </th>
              <th className="px-4 py-2.5 text-right font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {servers?.map((server, index) => (
              <tr
                key={server.id}
                className={cn(
                  "bg-t-bg-raised",
                  servers && index < servers.length - 1 ? "border-b border-t-hair" : "",
                )}
              >
                <td className="px-4 py-2.5 text-t-ink">
                  <div className="flex items-center gap-2">
                    <ServerIcon className="size-4 text-t-ink-dim" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{getServerLabel(server)}</div>
                      <div className="truncate font-mono text-[11px] text-t-ink-dim">
                        {server.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-t-ink-mid">{server.runtimeType}</td>
                <td className="max-w-64 px-4 py-2.5">
                  <span className="block truncate font-mono text-xs text-t-ink-mid">
                    {server.endpoint}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1px]",
                      getStatusClass(server.status),
                    )}
                  >
                    {server.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-t-ink-mid">{formatDate(server.lastSeenAt)}</td>
                <td className="px-4 py-2.5 text-t-ink-mid">{formatDate(server.createdAt)}</td>
                <td className="px-4 py-2.5 text-right text-t-ink-mid">
                  {server.spaceCount ?? "-"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={revokingId === server.id || server.status.toLowerCase() === "revoked"}
                    onClick={() => setServerToRevoke(server)}
                  >
                    <Trash2Icon />
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
            {servers?.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-t-ink-dim">
                  No servers registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!pairing || !!pairingError} onOpenChange={handleClosePairingDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>OpenClaw Pairing</DialogTitle>
            <DialogDescription>
              Use this one-time token to register an OpenClaw server with AI Spaces. It is only
              shown now.
            </DialogDescription>
          </DialogHeader>
          {pairingError ? (
            <div className="rounded-md border border-t-hair bg-t-bg-well p-3 text-sm text-t-accent">
              {pairingError}
            </div>
          ) : pairing ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase tracking-[1px] text-t-ink-dim">
                  AI Spaces URL
                </div>
                <div className="rounded-md border border-t-hair bg-t-bg-well px-3 py-2 font-mono text-xs text-t-ink">
                  {aiSpacesUrl}
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase tracking-[1px] text-t-ink-dim">
                  One-time token
                </div>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border border-t-hair bg-t-bg-well px-3 py-2 font-mono text-xs text-t-ink">
                    {pairing.registrationToken}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopyToken}>
                    <CopyIcon />
                    <span className="sr-only">Copy token</span>
                  </Button>
                </div>
                <p className="m-0 text-xs text-t-ink-dim">
                  Expires {formatDate(pairing.expiresAt)}.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase tracking-[1px] text-t-ink-dim">
                  OpenClaw setup
                </div>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border border-t-hair bg-t-bg-well px-3 py-2 font-mono text-xs text-t-ink">
                    {pairingCommand}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopyPairingCommand}>
                    <CopyIcon />
                    <span className="sr-only">Copy pairing command</span>
                  </Button>
                </div>
                <p className="m-0 text-xs text-t-ink-dim">
                  Run this in the OpenClaw environment, then refresh the server list.
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClosePairingDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!serverToRevoke} onOpenChange={(open) => !open && setServerToRevoke(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Server</DialogTitle>
            <DialogDescription>
              Revoking {serverToRevoke ? getServerLabel(serverToRevoke) : "this server"} disables
              its callback access. Existing spaces remain stored but become unavailable until the
              server is restored or those spaces are migrated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServerToRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeServer}
              disabled={!!serverToRevoke && revokingId === serverToRevoke.id}
            >
              {serverToRevoke && revokingId === serverToRevoke.id ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
