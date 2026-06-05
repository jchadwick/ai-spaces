import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAPI } from "@/hooks/useAPI";
import {
  clearPendingInviteToken,
  isTerminalInviteError,
  readInviteTokenFromHash,
  redeemInvite,
  savePendingInviteToken,
  stripInviteHashFromUrl,
} from "@/lib/invites";

type InviteStatus = "loading" | "error" | "requiresAuth";

export default function InvitePage() {
  const { isLoading, isAuthenticated } = useAuth();
  const apiFetch = useAPI();
  const navigate = useNavigate();
  const processedRef = useRef(false);
  const initialInviteToken =
    typeof window === "undefined" ? null : readInviteTokenFromHash(window.location.hash);

  const [status, setStatus] = useState<InviteStatus>(initialInviteToken ? "loading" : "error");
  const [error, setError] = useState<string | null>(
    initialInviteToken ? null : "Invalid invite link — no token found.",
  );
  const [inviteToken] = useState<string | null>(initialInviteToken);

  useEffect(() => {
    stripInviteHashFromUrl();
  }, []);

  useEffect(() => {
    if (!inviteToken || isLoading || processedRef.current) {
      return;
    }

    processedRef.current = true;

    const run = async () => {
      if (!isAuthenticated) {
        savePendingInviteToken(inviteToken);
        setStatus("requiresAuth");
        return;
      }

      try {
        const result = await redeemInvite(apiFetch, inviteToken);
        clearPendingInviteToken();
        navigate(result.spaceId ? `/spaces?space=${result.spaceId}` : "/spaces", { replace: true });
      } catch (err) {
        if (isTerminalInviteError(err)) {
          clearPendingInviteToken();
        }
        setStatus("error");
        setError(err instanceof Error ? err.message : "Invite redemption failed");
      }
    };

    run().catch((err: unknown) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Invite redemption failed");
    });
  }, [apiFetch, isAuthenticated, isLoading, inviteToken, navigate]);

  if (status === "loading" || isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--t-bg)",
          color: "var(--t-ink)",
          fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontSize: 16, color: "var(--t-inkMid)" }}>Validating invite...</p>
      </div>
    );
  }

  if (status === "requiresAuth") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--t-bg)",
          color: "var(--t-ink)",
          fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <p style={{ fontSize: 16, color: "var(--t-inkMid)" }}>
          Please log in to accept your invitation.
        </p>
        <a
          href="/login"
          style={{ fontSize: 14, color: "var(--t-accent)", textDecoration: "underline" }}
        >
          Go to login
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--t-bg)",
        color: "var(--t-ink)",
        fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p style={{ fontSize: 16, color: "var(--t-accent)" }}>{error}</p>
    </div>
  );
}
