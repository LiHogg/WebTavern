import { env } from "@/shared/lib/env";

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
};

function flattenApiError(errorPayload: unknown): string | null {
  if (!errorPayload) {
    return null;
  }

  if (typeof errorPayload === "string") {
    return errorPayload;
  }

  if (Array.isArray(errorPayload)) {
    return errorPayload.map((item) => flattenApiError(item)).filter(Boolean).join(" ");
  }

  if (typeof errorPayload === "object") {
    const entries = Object.entries(errorPayload as Record<string, unknown>);
    const normalized = entries
      .map(([key, value]) => {
        const message = flattenApiError(value);
        if (!message) {
          return null;
        }
        return key === "detail" || key === "non_field_errors" ? message : `${key}: ${message}`;
      })
      .filter(Boolean);
    return normalized.length ? normalized.join("\n") : null;
  }

  return null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Token ${options.token}` } : {})
    },
    cache: "no-store",
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(flattenApiError(data) ?? `Request failed: ${response.status}`);
  }

  return data as T;
}
