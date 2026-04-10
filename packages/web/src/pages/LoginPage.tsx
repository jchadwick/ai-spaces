import { useState, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const emailId = useId()
  const passwordId = useId()
  
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate('/spaces')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface font-ui text-on-surface flex flex-col">
      <header className="bg-surface-container-lowest border-b border-outline-variant/20 px-xl py-lg">
        <div className="max-w-6xl mx-auto flex items-center gap-md">
          <span className="material-symbols-outlined text-primary text-2xl">workspaces</span>
          <h1 className="font-display text-title-lg text-on-surface">AI Spaces</h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-lg py-xl">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl p-2xl shadow-ambient">
            <div className="text-center mb-xl">
              <h2 className="font-display text-title-lg text-on-surface mb-sm">Sign In</h2>
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

              <div className="space-y-sm">
                <label htmlFor={emailId} className="block text-body-sm font-medium text-on-surface">
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
                  className="w-full"
                />
              </div>

              <div className="space-y-sm">
                <label htmlFor={passwordId} className="block text-body-sm font-medium text-on-surface">
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
                  'Sign In'
                )}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

export default LoginPage