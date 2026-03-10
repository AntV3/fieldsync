import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary:${this.props.section || 'unknown'}]`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-content">
            <AlertCircle size={32} className="error-boundary-icon" />
            <h3 className="error-boundary-title">
              Something went wrong{this.props.section ? ` in ${this.props.section}` : ''}
            </h3>
            <p className="error-boundary-message">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              className="btn btn-secondary btn-small"
              onClick={this.handleReset}
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
