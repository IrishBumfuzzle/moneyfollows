import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * A crash anywhere below used to unmount the whole app and leave only the page background. This
 * shows a way back instead and logs the error (with the component stack) so it can be reported.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; lang: 'en' | 'hi' | string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[paisa] screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const hi = this.props.lang === 'hi';
    return (
      <div className="app-crash" role="alert">
        <p>{hi ? 'कुछ गड़बड़ हो गई।' : 'Something went wrong.'}</p>
        <button
          className="k-btn is-primary"
          onClick={() => {
            // Start again from the main screen; saved progress is kept. A demo stays a demo (its
            // own save), but without reset=1 or the other one-off params.
            const demo = new URLSearchParams(window.location.search).get('demo') === '1';
            window.history.replaceState(null, '', window.location.pathname + (demo ? '?demo=1' : ''));
            window.location.reload();
          }}
        >
          {hi ? 'मुख्य स्क्रीन पर जाओ' : 'Back to the main screen'}
        </button>
      </div>
    );
  }
}
