import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AgentGlyph from "@/components/AgentGlyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const displayNameId = useId();

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || undefined,
        }),
      });

      if (response.status === 409) {
        setError("Email already registered.");
        return;
      }

      if (!response.ok) {
        let errMsg = `Registration failed: ${response.status}`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) errMsg = data.error;
        } catch {
          // ignore
        }
        setError(errMsg);
        return;
      }

      try {
        await login(email, password);
        navigate("/spaces");
      } catch {
        navigate("/login?registered=true");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-t-bg font-sans text-t-ink flex items-center justify-center px-lg py-xl">
      <main className="w-full max-w-sm">
        <div className="mb-xl flex flex-col items-center gap-md text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-t-ink text-t-bg">
            <AgentGlyph size={23} color="var(--t-bg)" />
          </div>
          <div>
            <h1 className="text-title-lg font-semibold text-t-ink">AI Spaces</h1>
            <p className="mt-xs text-body-sm text-t-ink-dim">Create an account for shared rooms</p>
          </div>
        </div>

        <div className="rounded-xl border border-t-hair bg-t-bg-raised p-xl shadow-ambient">
          <div className="text-center mb-xl">
            <h2 className="font-sans text-title-md font-semibold text-t-ink mb-sm">
              Create Account
            </h2>
            <p className="text-body-md text-t-ink-dim">Sign up to access your spaces</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-lg">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-md">
                <div className="flex items-center gap-sm text-destructive">
                  <span className="material-symbols-outlined">error</span>
                  <span className="text-body-sm font-medium">{error}</span>
                </div>
              </div>
            )}

            <div className="space-y-sm">
              <label htmlFor={emailId} className="block text-body-sm font-medium text-t-ink">
                Email
              </label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isSubmitting}
                className="w-full h-10 bg-t-bg-raised"
              />
            </div>

            <div className="space-y-sm">
              <label htmlFor={displayNameId} className="block text-body-sm font-medium text-t-ink">
                Display Name <span className="text-t-ink-dim font-normal">(optional)</span>
              </label>
              <Input
                id={displayNameId}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                disabled={isSubmitting}
                className="w-full h-10 bg-t-bg-raised"
              />
            </div>

            <div className="space-y-sm">
              <label htmlFor={passwordId} className="block text-body-sm font-medium text-t-ink">
                Password
              </label>
              <Input
                id={passwordId}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                disabled={isSubmitting}
                className="w-full h-10 bg-t-bg-raised"
              />
            </div>

            <div className="space-y-sm">
              <label
                htmlFor={confirmPasswordId}
                className="block text-body-sm font-medium text-t-ink"
              >
                Confirm Password
              </label>
              <Input
                id={confirmPasswordId}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                disabled={isSubmitting}
                className="w-full h-10 bg-t-bg-raised"
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full h-10 justify-center">
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-sm">
                  <div className="animate-spin rounded-full w-4 h-4 border-2 border-t-primary-foreground border-t-transparent"></div>
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <p className="text-center text-body-sm text-t-ink-dim mt-lg">
            Already have an account?{" "}
            <Link to="/login" className="text-t-accent hover:underline">
              Sign in instead
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default RegisterPage;
