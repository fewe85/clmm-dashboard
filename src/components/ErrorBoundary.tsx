import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Dashboard error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            color: 'var(--accent-red)',
            fontFamily: "'Outfit', system-ui, sans-serif",
            gap: '1rem',
            padding: '2rem',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dashboard Error</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', maxWidth: '400px' }}>
            {this.state.error || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--accent-red)',
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--accent-red)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
