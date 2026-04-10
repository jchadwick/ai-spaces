import { Component, type ReactNode } from 'react'
import { WebSocketError } from './ErrorComponents'

interface Props {
  children: ReactNode
  onRetry?: () => void
  showInline?: boolean
}

interface State {
  hasError: boolean
  errorMessage: string | null
}

export class WebSocketErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: null }
  }

  static getDerivedStateFromError(error: Error): State {
    if (import.meta.env.DEV) {
      console.error('WebSocket error caught:', error)
    }
    return { 
      hasError: true, 
      errorMessage: error.message || 'Connection failed'
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.showInline) {
        return (
          <div className="p-4 bg-error-container/10 rounded-lg">
            <div className="flex items-center gap-sm text-error mb-sm">
              <span className="material-symbols-outlined">link_off</span>
              <span className="text-body-md font-medium">Chat disconnected</span>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-sm">
              Lost connection to the AI chat.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="text-body-sm text-primary hover:underline"
            >
              Reconnect
            </button>
          </div>
        )
      }

      return (
        <WebSocketError 
          onRetry={this.handleRetry}
        />
      )
    }

    return this.props.children
  }
}