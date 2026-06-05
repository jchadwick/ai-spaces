import type { SpaceRole } from "@ai-spaces/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAPI } from "@/hooks/useAPI";

interface ShareSpaceDialogProps {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLES: { value: SpaceRole; label: string; description: string }[] = [
  {
    value: "viewer",
    label: "Viewer",
    description: "Can view files and chat with the agent",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Can view, edit, and create files",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Full access including managing members",
  },
];

export default function ShareSpaceDialog({ spaceId, open, onOpenChange }: ShareSpaceDialogProps) {
  const apiFetch = useAPI();
  const [selectedRole, setSelectedRole] = useState<SpaceRole>("editor");
  const [isLoading, setIsLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setIsLoading(true);
    setError(null);
    setInviteUrl(null);

    try {
      const response = await apiFetch(`/api/spaces/${spaceId}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 403) {
          throw new Error("Only space owners can create invites");
        }
        throw new Error(data.error || "Failed to create invite");
      }

      const data = (await response.json()) as { inviteUrl?: string };
      if (!data.inviteUrl) {
        throw new Error("Failed to create invite");
      }
      setInviteUrl(data.inviteUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setTimeout(() => {
        setInviteUrl(null);
        setError(null);
        setCopied(false);
      }, 200);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[24rem]">
        <DialogHeader>
          <DialogTitle>Share Space</DialogTitle>
          <DialogDescription>
            Create an invite link to share this space with others.
          </DialogDescription>
        </DialogHeader>

        {!inviteUrl ? (
          <div className="flex flex-col gap-4 py-2">
            {/* Role Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as SpaceRole)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {ROLES.find((r) => r.value === selectedRole)?.description}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Invite Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteUrl}
                  readOnly
                  className="flex-1 h-10 px-3 rounded-lg border border-input bg-muted text-sm text-foreground font-mono truncate"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  title={copied ? "Copied!" : "Copy link"}
                >
                  {copied ? (
                    <svg
                      className="size-4 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with anyone you want to invite. The link expires in 7 days.
            </p>
          </div>
        )}

        <DialogFooter>
          {!inviteUrl ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Invite"}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
