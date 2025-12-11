import { Component } from 'react'

/**
 * Error Boundary component to catch and handle React rendering errors
 * Prevents the entire app from crashing due to component errors
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })

    // You could also log to an error reporting service here
    // Example: logErrorToService(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">⚠️</div>
            <h2>Something went wrong</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="error-boundary-details">
                <summary>Error Details (Development Only)</summary>
                <pre className="error-boundary-stack">
                  {this.state.error?.stack}
                  {'\n\n'}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="error-boundary-actions">
              <button
                className="btn btn-primary"
                onClick={this.handleReset}
              >
                Try Again
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
