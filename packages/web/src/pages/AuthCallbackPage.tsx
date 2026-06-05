import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AgentGlyph from "@/components/AgentGlyph";
import { useAuth } from "@/contexts/AuthContext";
import {
  clearPendingInviteToken,
  createBearerFetch,
  isTerminalInviteError,
  peekPendingInviteToken,
  redeemInvite,
} from "@/lib/invites";

function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      if (processedRef.current) return;
      processedRef.current = true;

      const accessToken = searchParams.get("accessToken");
      const refreshToken = searchParams.get("refreshToken");

      if (!accessToken || !refreshToken) {
        setError("Invalid authentication response");
        setTimeout(() => navigate("/login?error=Invalid authentication response"), 2000);
        return;
      }

      try {
        await loginWithTokens(accessToken, refreshToken);

        const pendingToken = peekPendingInviteToken();
        if (pendingToken) {
          try {
            const invite = await redeemInvite(createBearerFetch(accessToken), pendingToken);
            clearPendingInviteToken();
            navigate(invite.spaceId ? `/spaces?space=${invite.spaceId}` : "/spaces", {
              replace: true,
            });
            return;
          } catch (inviteError) {
            if (isTerminalInviteError(inviteError)) {
              clearPendingInviteToken();
            }
            const message =
              inviteError instanceof Error ? inviteError.message : "Invite redemption failed";
            setError(`Signed in, but the invite could not be accepted: ${message}`);
            return;
          }
        }

        navigate("/spaces", { replace: true });
      } catch (err) {
        console.error("[AuthCallback] Error:", err);
        setError("Authentication failed");
        setTimeout(() => navigate("/login?error=Authentication failed"), 2000);
      }
    };

    handleCallback();
  }, [loginWithTokens, searchParams, navigate]);

  return (
    <div className="min-h-screen bg-t-bg font-sans text-t-ink flex items-center justify-center px-lg py-xl">
      <main className="w-full max-w-sm">
        <div className="mb-xl flex flex-col items-center gap-md text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-t-ink text-t-bg">
            <AgentGlyph size={23} color="var(--t-bg)" />
          </div>
          <div>
            <h1 className="text-title-lg font-semibold text-t-ink">AI Spaces</h1>
            <p className="mt-xs text-body-sm text-t-ink-dim">Completing your sign-in</p>
          </div>
        </div>

        <div className="rounded-xl border border-t-hair bg-t-bg-raised p-xl text-center shadow-ambient">
          {error ? (
            <div className="space-y-md">
              <span className="material-symbols-outlined text-destructive text-4xl">error</span>
              <p className="text-body-md text-t-ink-dim">{error}</p>
            </div>
          ) : (
            <div className="space-y-md">
              <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent mx-auto"></div>
              <p className="text-body-md text-t-ink-dim">Completing sign-in...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AuthCallbackPage;
