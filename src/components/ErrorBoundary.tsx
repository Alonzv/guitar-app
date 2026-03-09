import React from 'react';
import { T } from '../theme';

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
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        padding: 32, textAlign: 'center',
        border: `1px dashed ${T.border}`, borderRadius: 14, margin: 8,
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <p style={{ fontWeight: 700, color: T.text, marginBottom: 6, margin: '0 0 6px' }}>
          Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}
        </p>
        <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>
          {this.state.error?.message}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: T.primary, color: T.white, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }
}
