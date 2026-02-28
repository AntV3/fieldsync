import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo })
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // Check if this is a chunk loading failure (stale deployment)
    const isChunkError = error?.message?.includes('Failed to fetch dynamically imported module') ||
                         error?.message?.includes('Loading chunk') ||
                         error?.message?.includes('Loading CSS chunk')

    if (isChunkError) {
      console.warn('[ErrorBoundary] Chunk load failure detected, clearing cache and reloading...')
      // Clear caches and reload to get fresh assets
      if ('caches' in window) {
        caches.keys().then((names) => {
          Promise.all(names.map((name) => caches.delete(name))).then(() => {
            window.location.reload()
          })
        }).catch(err => {
          console.warn('[ErrorBoundary] Cache clear failed, reloading anyway:', err.message)
          window.location.reload()
        })
      } else {
        window.location.reload()
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon"><AlertTriangle size={48} /></div>
            <h2>Something went wrong</h2>
            <p>We're sorry, but something unexpected happened. Please try again.</p>

            <div className="error-actions">
              <button className="btn btn-primary" onClick={this.handleRetry}>
                Try Again
              </button>
              <button className="btn btn-secondary" onClick={this.handleReload}>
                Reload Page
              </button>
            </div>

            {/* Show error details in development */}
            {import.meta.env.DEV && this.state.error && (
              <details className="error-details">
                <summary>Error Details (Development Only)</summary>
                <pre>{this.state.error.toString()}</pre>
                <pre>{this.state.errorInfo?.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
