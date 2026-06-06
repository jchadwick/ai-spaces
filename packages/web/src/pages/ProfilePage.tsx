import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useAPI } from "@/hooks/useAPI";

type Profile = {
  id: string;
  email: string;
  displayName?: string;
  serverRole: "admin" | "user";
};

function ProfilePage() {
  const apiFetch = useAPI();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const pageClass = "mx-auto w-full max-w-190 flex-1 overflow-auto bg-t-bg p-8";
  const sectionClass = "rounded-[10px] border border-t-hair bg-t-bg-raised p-5";
  const headingClass = "mb-4 font-sans text-lg font-semibold text-t-ink";
  const inputClass = "rounded-lg border border-t-hair bg-t-bg-well px-2.5 py-2 text-t-ink";
  const buttonClass =
    "rounded-lg border border-t-hair bg-t-ink px-3 py-1.5 text-[13px] font-medium text-t-bg disabled:cursor-default disabled:opacity-70";

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const response = await apiFetch("/api/auth/me");
        if (!response.ok) {
          const data = await response.json().catch(() => ({}) as { error?: string });
          throw new Error(data.error ?? "Failed to load profile");
        }

        const data = (await response.json()) as Profile;
        if (!cancelled) {
          setProfile(data);
          setDisplayName(data.displayName ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : "Failed to load profile", "error", 4000);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [apiFetch, showToast]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const response = await apiFetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error ?? "Failed to update profile");
      }

      const data = (await response.json()) as Profile;
      setProfile(data);
      setDisplayName(data.displayName ?? "");
      showToast("Profile updated", "success", 3000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update profile", "error", 4000);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      showToast("New password and confirm password do not match", "error", 4000);
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await apiFetch("/api/auth/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error ?? "Failed to change password");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password changed", "success", 3000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to change password", "error", 4000);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <main className={pageClass}>
        <div className="pt-2 font-sans text-t-ink-mid">Loading profile…</div>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <h1 className="mb-6 font-sans text-[28px] font-bold text-t-ink">Profile</h1>

      <section className={`${sectionClass} mb-5`}>
        <h2 className={headingClass}>Account</h2>
        <div className="mb-4 grid grid-cols-[140px_1fr] gap-x-3 gap-y-2.5">
          <div className="text-[13px] text-t-ink-dim">Email</div>
          <div className="text-sm text-t-ink">{profile?.email ?? "—"}</div>
          <div className="text-[13px] text-t-ink-dim">Role</div>
          <div className="text-sm capitalize text-t-ink">{profile?.serverRole ?? "user"}</div>
        </div>

        <form onSubmit={handleSaveProfile}>
          <label htmlFor="display-name" className="mb-1.5 block text-[13px] text-t-ink-dim">
            Display Name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="Your name"
            className={`${inputClass} mb-3.5 w-full max-w-90`}
          />
          <div>
            <button type="submit" disabled={isSavingProfile} className={buttonClass}>
              {isSavingProfile ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Change Password</h2>
        <form onSubmit={handleChangePassword}>
          <div className="grid max-w-90 gap-2.5">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              required
              className={inputClass}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              minLength={8}
              required
              className={inputClass}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              minLength={8}
              required
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={isChangingPassword} className={`${buttonClass} mt-3.5`}>
            {isChangingPassword ? "Updating…" : "Change Password"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default ProfilePage;
