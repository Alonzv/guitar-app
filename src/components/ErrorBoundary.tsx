import React, { Suspense } from 'react';
import { T } from '../theme';
import { IconWarn } from './Icons';
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
      <div style={{
        padding: 32, textAlign: 'center',
        border: `1px dashed ${T.border}`, borderRadius: 0, margin: 8,
      }}>
        <div style={{ marginBottom: 12, color: T.textMuted }}><IconWarn size={32} /></div>
        <p style={{ fontWeight: 400, color: T.text, marginBottom: 6, margin: '0 0 6px' }}>
          Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}
        </p>
        <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>
          {this.state.error?.message}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            padding: '8px 20px', borderRadius: 0, border: 'none',
            background: T.primary, color: T.white, fontWeight: 400, cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }
}
