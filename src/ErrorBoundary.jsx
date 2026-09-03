import React from "react";
import { errorFallbackDetails } from "./errorFallback.js";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[primus] render crash", error, info?.componentStack);
  }

  componentDidMount() {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("debugError") === "1") {
      this.setState({
        error: new Error("Debug ErrorBoundary test — remove ?debugError=1 from the URL after reporting."),
      });
    }
  }

  render() {
    if (this.state.error) {
      const { message, stack } = errorFallbackDetails(this.state.error);
      return (
        <div
          className="error-fallback"
          style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "64px auto", padding: 24 }}
        >
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#555", lineHeight: 1.5, margin: "0 0 16px" }}>
            The page hit an unexpected error. Refresh and try again.
          </p>
          <details style={{ margin: "0 0 16px", color: "#333" }}>
            <summary style={{ cursor: "pointer" }}>Technical details (for reporting this)</summary>
            <pre
              style={{
                marginTop: 10,
                padding: 12,
                background: "#f4f1ea",
                borderRadius: 8,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {`${message}\n${stack}`}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: 0,
              background: "#006CB4",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
