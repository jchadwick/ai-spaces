import { Users } from "lucide-react";
import { useState } from "react";

import { createSpaceInvite } from "@/api/spaceFiles";
import { RoomsButton } from "@/components/rooms/controls/RoomsButton";
import { useToast } from "@/components/ui/use-toast";

export function InviteButton({ spaceId }: { spaceId: string }) {
  const { showToast } = useToast();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function createInvite() {
    try {
      const next = await createSpaceInvite(spaceId, "editor");
      setInviteUrl(next);
      await navigator.clipboard?.writeText(next).catch(() => undefined);
      showToast("Invite link created", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create invite", "error");
    }
  }

  return (
    <>
      <RoomsButton variant="outline" size="sm" icon={<Users size={16} />} onClick={createInvite}>
        Invite link
      </RoomsButton>
      {inviteUrl && (
        <div className="fixed bottom-6 right-6 z-[70] max-w-[460px] rounded-xl bg-rooms-ink px-4 py-3 text-[13px] text-rooms-paper shadow-rooms-toast">
          <div className="mb-1.5 font-semibold">Invite link</div>
          <div className="overflow-hidden text-ellipsis">{inviteUrl}</div>
        </div>
      )}
    </>
  );
}
