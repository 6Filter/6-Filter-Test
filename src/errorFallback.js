/** Plain details for the ErrorBoundary fallback — no React, so tests can import it. */
export function errorFallbackDetails(error) {
  if (error == null) return { message: "Unknown error", stack: "" };
  if (typeof error === "string") return { message: error, stack: "" };
  return {
    message: String(error.message || error),
    stack: String(error.stack || ""),
  };
}
