const browserOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

function buildWsBase(origin: string) {
  if (origin.startsWith("https://")) return origin.replace("https://", "wss://") + "/ws";
  if (origin.startsWith("http://")) return origin.replace("http://", "ws://") + "/ws";
  return "ws://localhost:8080/ws";
}

export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "WebTavern",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? `${browserOrigin}/api/v1`,
  wsBaseUrl: process.env.NEXT_PUBLIC_WS_BASE_URL ?? buildWsBase(browserOrigin)
};
