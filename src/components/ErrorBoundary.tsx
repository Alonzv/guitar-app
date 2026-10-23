import React, { Suspense } from 'react';
import { T, btn } from '../theme';
import { TabLoader } from './TabLoader';

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    // Also the Suspense boundary for lazy-loaded (code-split) panels: while a
    // tab's chunk downloads, show the TabLoader instead of blanking.
    if (!this.state.hasError) {
      return <Suspense fallback={<TabLoader />}>{this.props.children}</Suspense>;
    }
    return (
      <div role="alert" style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '16px 0 24px' }}>
        <p className="su-poster" style={{ margin: '0 0 12px', fontSize: 56 }}>
          Off the line
        </p>
        <p style={{ fontSize: 13, color: T.text, margin: '0 0 6px' }}>
          Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}.
        </p>
        <p className="su-label" style={{ margin: '0 0 16px', textTransform: 'none', letterSpacing: '0.04em' }}>
          {this.state.error?.message}
        </p>
        <button onClick={() => this.setState({ hasError: false, error: null })} className="gc-no-bar" style={btn.primary(false)}>
          Try again
        </button>
      </div>
    );
  }
}
