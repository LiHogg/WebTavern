import type { User } from "@/entities/auth/model/types";

const TOKEN_KEY = "webtavern-token";
const USER_KEY = "webtavern-user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setStoredUser(user: User): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function storeAuthSession(token: string, user: User): void {
  setStoredToken(token);
  setStoredUser(user);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(TOKEN_KEY);
}

export function clearStoredUser(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(USER_KEY);
}

export function clearAuthSession(): void {
  clearStoredToken();
  clearStoredUser();
}
