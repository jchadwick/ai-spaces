import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'

interface BaseErrorProps {
  title: string
  description?: string
  icon?: string
  onRetry?: () => void
  retryLabel?: string
  onSecondary?: () => void
  secondaryLabel?: string
}

function BaseErrorCard({ title, description, icon, onRetry, retryLabel = 'Try Again', onSecondary, secondaryLabel }: BaseErrorProps) {
  return (
    <div className="min-h-[200px] flex items-center justify-center p-8">
      <Card className="max-w-md w-full shadow-ambient">
        <CardHeader className="text-center pb-0">
          {icon && (
            <div className="flex justify-center mb-md">
              <div className="w-14 h-14 rounded-full bg-error-container flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-2xl">{icon}</span>
              </div>
            </div>
          )}
          <CardTitle className="text-title-md">{title}</CardTitle>
          {description && (
            <CardDescription className="text-body-md mt-xs">
              {description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-md">
          <div className="flex flex-col gap-sm">
            {onRetry && (
              <Button variant="default" className="w-full" onClick={onRetry}>
                <span className="material-symbols-outlined mr-xs text-lg">refresh</span>
                {retryLabel}
              </Button>
            )}
            {onSecondary && (
              <Button variant="outline" className="w-full" onClick={onSecondary}>
                {secondaryLabel}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function GenericError({ 
  onRetry,
  onSecondary,
  secondaryLabel 
}: { 
  onRetry?: () => void
  onSecondary?: () => void
  secondaryLabel?: string
}) {
  return (
    <BaseErrorCard
      icon="error"
      title="Something went wrong"
      description="An unexpected error occurred. Please try again."
      onRetry={onRetry}
      retryLabel="Try Again"
      onSecondary={onSecondary}
      secondaryLabel={secondaryLabel}
    />
  )
}

export function LoadingError({ 
  onRetry,
  itemName = "content"
}: { 
  onRetry?: () => void
  itemName?: string
}) {
  return (
    <BaseErrorCard
      icon="cloud_off"
      title="Failed to load"
      description={`Unable to load ${itemName}. Please check your connection and try again.`}
      onRetry={onRetry}
      retryLabel="Retry"
    />
  )
}

export function ConnectionError({ 
  onRetry,
  onSecondary,
  secondaryLabel = "Go Back"
}: { 
  onRetry?: () => void
  onSecondary?: () => void
  secondaryLabel?: string
}) {
  return (
    <BaseErrorCard
      icon="wifi_off"
      title="Connection lost"
      description="Unable to connect to the server. Please check your internet connection."
      onRetry={onRetry}
      retryLabel="Reconnect"
      onSecondary={onSecondary}
      secondaryLabel={secondaryLabel}
    />
  )
}

export function WebSocketError({ 
  onRetry,
  onSecondary,
  secondaryLabel = "Go Back"
}: { 
  onRetry?: () => void
  onSecondary?: () => void
  secondaryLabel?: string
}) {
  return (
    <BaseErrorCard
      icon="link_off"
      title="Chat disconnected"
      description="Lost connection to the AI chat. Your messages may not have been sent."
      onRetry={onRetry}
      retryLabel="Reconnect"
      onSecondary={onSecondary}
      secondaryLabel={secondaryLabel}
    />
  )
}

export function EditorError({ 
  onRetry,
  fileName
}: { 
  onRetry?: () => void
  fileName?: string
}) {
  return (
    <BaseErrorCard
      icon="warning"
      title="Editor error"
      description={fileName 
        ? `Failed to load ${fileName}. The file may have been moved or deleted.`
        : "Failed to load the file. It may have been moved or deleted."
      }
      onRetry={onRetry}
      retryLabel="Retry"
    />
  )
}