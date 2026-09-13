import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="recovery-screen"><span className="brand">mochess.</span><h1>Let’s get you back to the board.</h1><p>Something went wrong displaying this page. Reload to return to the home page and check for your saved game.</p><button className="primary-action" onClick={() => window.location.reload()}>Reload the site</button></main>
    return this.props.children
  }
}
