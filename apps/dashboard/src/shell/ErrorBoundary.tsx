import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Failed } from './Notices';

interface Props {
  /** The friendly explanation shown in place of the content that crashed. */
  text: string;
  reloadLabel: string;
  /** When this changes (a new route, say) a shown error is cleared and the children get another go. */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Catches a crash while rendering, most often a lazy chunk that 404s after a new deploy or on a
 * dropped connection, so staff see a card with a Reload button instead of a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Dashboard crashed while rendering', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <Failed text={this.props.text} retryLabel={this.props.reloadLabel} onRetry={() => location.reload()} />;
  }
}
