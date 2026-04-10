import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Button } from './ui/button'

export type AuthErrorType = 'expired' | 'invalid' | 'missing' | 'wrong_space' | 'revoked';

interface AuthErrorPageProps {
  type: AuthErrorType
  expiresAt?: string
  spaceName?: string
}

interface ErrorContent {
  icon: string
  title: string
  description: string
  showExpiry?: boolean
  showContact?: boolean
}

function getErrorContent(type: AuthErrorType): ErrorContent {
  switch (type) {
    case 'expired':
      return {
        icon: 'schedule',
        title: 'Share Link Expired',
        description: 'This share link has expired and is no longer valid.',
        showExpiry: true,
        showContact: true,
      }
    case 'revoked':
      return {
        icon: 'link_off',
        title: 'Share Link Revoked',
        description: 'This share link has been revoked by the space owner and is no longer valid.',
        showContact: true,
      }
    case 'invalid':
      return {
        icon: 'link_off',
        title: 'Invalid Link',
        description: 'This share link is not valid. It may have been revoked or never existed.',
        showContact: true,
      }
    case 'missing':
      return {
        icon: 'lock',
        title: 'Access Required',
        description: 'You need a valid share link to access this space.',
        showContact: true,
      }
    case 'wrong_space':
      return {
        icon: 'wrong_location',
        title: 'Wrong Space',
        description: 'This share link is for a different space.',
      }
  }
}

function formatExpiry(expiresAt: string): string {
  const expiry = new Date(expiresAt)
  return expiry.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AuthErrorPage({ type, expiresAt, spaceName }: AuthErrorPageProps) {
  const content = getErrorContent(type)

  return (
    <div className="min-h-screen bg-surface font-ui text-on-surface flex items-center justify-center p-lg">
      <Card className="max-w-md w-full shadow-elevated">
        <CardHeader className="text-center pb-0">
          <div className="flex justify-center mb-md">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-3xl">{content.icon}</span>
            </div>
          </div>
          <CardTitle className="text-title-lg">{content.title}</CardTitle>
          <CardDescription className="text-body-md mt-xs">
            {content.description}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-md">
          {content.showExpiry && expiresAt && (
            <div className="bg-surface-container-high rounded-lg p-md mb-md">
              <div className="flex items-center gap-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-lg">event_busy</span>
                <div>
                  <p className="text-label-sm text-on-surface-variant">Expired on</p>
                  <p className="text-body-md font-medium text-error">{formatExpiry(expiresAt)}</p>
                </div>
              </div>
            </div>
          )}

          {spaceName && (
            <div className="bg-surface-container-high rounded-lg p-md mb-md">
              <div className="flex items-center gap-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-lg">workspaces</span>
                <div>
                  <p className="text-label-sm text-on-surface-variant">Space</p>
                  <p className="text-body-md font-medium text-on-surface">{spaceName}</p>
                </div>
              </div>
            </div>
          )}

          {content.showContact && (
            <div className="bg-surface-container-high rounded-lg p-md mb-md">
              <p className="text-body-sm text-on-surface-variant">
                Contact the space owner for a new share link if you need continued access.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-sm mt-md">
            <Button 
              variant="default" 
              className="w-full"
              onClick={() => { window.location.href = '/' }}
            >
              <span className="material-symbols-outlined mr-xs">home</span>
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}