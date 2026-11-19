import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Names the part of the app for the message, e.g. "Pharmacology". */
  readonly area: string
  readonly children: ReactNode
}

interface State {
  readonly failed: boolean
}

/** Keeps one broken tab from blanking the whole app during a demo. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.area} crashed`, error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="status status--error" role="alert">
        <p>
          Something went wrong showing {this.props.area}. The other tabs still work.{' '}
          <button type="button" className="button" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        </p>
      </div>
    )
  }
}
