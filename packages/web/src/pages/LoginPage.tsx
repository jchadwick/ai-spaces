import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthProviders {
  password: boolean;
  google: boolean;
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authProviders, setAuthProviders] = useState<AuthProviders | null>(
    null,
  );

  const emailId = useId();
  const passwordId = useId();

  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch available auth providers
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then(setAuthProviders)
      .catch((err) => {
        console.error("[LoginPage] Failed to fetch auth providers:", err);
        // Default to password-only if fetch fails
        setAuthProviders({ password: true, google: false });
      });
  }, []);

  const handleGoogleLogin = () => {
    // Navigate to Google OAuth endpoint (full page redirect)
    const params = new URLSearchParams({ returnOrigin: window.location.origin });
    window.location.href = `/api/auth/google?${params.toString()}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);

      const pendingToken = sessionStorage.getItem("pendingInviteToken");
      if (pendingToken) {
        sessionStorage.removeItem("pendingInviteToken"); // delete immediately after reading
        await fetch("/api/invites/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token: pendingToken }),
        });
      }

      navigate("/spaces");
    } catch (err) {
      console.error("[LoginPage] Login error:", err);
      let message = "Login failed. Please try again.";
      if (err instanceof Error) {
        message = err.message;
        console.error("[LoginPage] Error message:", message);
      } else if (err && typeof err === "object") {
        message = JSON.stringify(err);
        console.error("[LoginPage] Object error:", message);
      } else if (typeof err === "string") {
        message = err;
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-ui text-on-surface flex flex-col">
      <header className="bg-surface-container-lowest border-b border-outline-variant/20 px-xl py-lg">
        <div className="max-w-6xl mx-auto flex items-center gap-md">
          <span className="material-symbols-outlined text-primary text-2xl">
            workspaces
          </span>
          <h1 className="font-display text-title-lg text-on-surface">
            AI Spaces
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-lg py-xl">
        <div className="bg-surface-container-lowest rounded-2xl p-2xl shadow-ambient">
          <div className="text-center mb-xl">
            <h2 className="font-display text-title-lg text-on-surface mb-sm">
              Sign In
            </h2>
            <p className="text-body-md text-on-surface-variant">
              Enter your credentials to access your spaces
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-lg">
            {error && (
              <div className="bg-error-container/10 border border-error/20 rounded-xl p-md">
                <div className="flex items-center gap-sm text-error">
                  <span className="material-symbols-outlined">error</span>
                  <span className="text-body-sm font-medium">{error}</span>
                </div>
              </div>
            )}

            {authProviders?.google && (
              <>
                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  variant="outline"
                  className="w-full h-10"
                >
                  <svg className="w-5 h-5 mr-sm" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign in with Google
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-outline-variant/30"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-surface-container-lowest px-md text-on-surface-variant">
                      Or continue with
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-sm">
              <label
                htmlFor={emailId}
                className="block text-body-sm font-medium text-on-surface"
              >
                Email
              </label>
              <Input
                id={emailId}
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div className="space-y-sm">
              <label
                htmlFor={passwordId}
                className="block text-body-sm font-medium text-on-surface"
              >
                Password
              </label>
              <Input
                id={passwordId}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-sm">
                  <div className="animate-spin rounded-full w-4 h-4 border-2 border-primary-foreground border-t-transparent"></div>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
