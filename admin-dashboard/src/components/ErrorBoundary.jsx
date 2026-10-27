import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="app-error" role="alert">
      <h1>Something went wrong</h1>
      <p>The workspace could not finish loading. Reload to try again.</p>
      <button className="ui-button ui-button-primary" type="button" onClick={() => window.location.reload()}>Reload workspace</button>
    </main>;
  }
}
