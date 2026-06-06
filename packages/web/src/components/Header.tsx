import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useHeader } from "@/contexts/HeaderContext";
import AgentGlyph from "./AgentGlyph";

function getBuildLabel(): string {
  if (typeof document === "undefined") return "";
  const fromBuildMeta = document
    .querySelector('meta[name="ai-spaces-build"]')
    ?.getAttribute("content")
    ?.trim();
  if (fromBuildMeta) return fromBuildMeta;

  const tag = document.querySelector('meta[name="ai-spaces-tag"]')?.getAttribute("content")?.trim();
  if (tag) return tag;

  const branch = document
    .querySelector('meta[name="ai-spaces-branch"]')
    ?.getAttribute("content")
    ?.trim();
  const sha = document.querySelector('meta[name="ai-spaces-sha"]')?.getAttribute("content")?.trim();
  if (branch && sha) return `${branch}-${sha}`;
  return "";
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const buildLabel = getBuildLabel();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    await logout();
    navigate("/login");
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid size-8 cursor-pointer place-items-center rounded-full border border-t-hair bg-t-bg-well text-t-ink-mid"
        aria-label="Profile menu"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[100] min-w-40 rounded-[10px] border border-t-hair bg-t-bg-raised py-1 font-sans shadow-[0_4px_16px_rgba(26,23,20,0.12)]">
          <button
            onClick={() => {
              setOpen(false);
              navigate("/profile");
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3.5 py-2 text-left text-sm text-t-ink hover:bg-t-bg-well"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="5.5" r="2.5" />
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" />
            </svg>
            Profile
          </button>
          <div className="my-1 h-px bg-t-hair" />
          <button
            onClick={handleSignOut}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3.5 py-2 text-left text-sm text-t-ink hover:bg-t-bg-well"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
              <polyline points="7 11 10 8 7 5" />
              <line x1="10" y1="8" x2="2" y2="8" />
            </svg>
            Sign Out
          </button>
          {buildLabel && (
            <>
              <div className="my-1 h-px bg-t-hair" />
              <div className="px-3.5 pb-2 pt-1.5 font-mono text-[11px] tracking-[0.2px] text-t-ink-dim">
                {buildLabel}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { user } = useAuth();
  const { headerContent } = useHeader();

  return (
    <header className="flex h-header shrink-0 items-center justify-between border-b border-t-hair bg-t-bg pl-5 pr-4 font-sans">
      {/* Left: Logo */}
      <div className="flex items-center gap-3.5">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <div className="grid size-[22px] shrink-0 place-items-center rounded-md bg-t-ink">
            <AgentGlyph size={12} color="var(--t-bg)" />
          </div>
          <span className="text-lg font-bold leading-none tracking-normal text-t-ink">Spaces</span>
        </Link>
      </div>

      {/* Middle: Page-specific content via portal */}
      {headerContent && (
        <div className="flex min-w-0 flex-1 items-center justify-center">{headerContent}</div>
      )}

      {/* Right: User actions */}
      <div className="flex items-center gap-2.5">
        {user?.serverRole === "admin" && (
          <Link
            to="/admin"
            className="rounded-md border border-t-hair px-2.5 py-1 font-sans text-[13px] text-t-ink-mid no-underline hover:text-t-ink"
          >
            Admin
          </Link>
        )}
        <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[1px] text-t-ink-dim">
          <span className="inline-block size-1.5 rounded-full bg-t-agent" />
          live
        </div>
        <ProfileMenu />
      </div>
    </header>
  );
}
