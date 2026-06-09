"use client";

import { useEffect, useRef, useState } from "react";

import type { AuthResponse } from "@/entities/auth/model/types";
import { apiRequest } from "@/services/api/client";
import { getStoredToken, storeAuthSession } from "@/shared/lib/auth";

type DemoAccount = {
  label: string;
  email: string;
  password: string;
  hint: string;
};

const demoAccounts: DemoAccount[] = [
  {
    label: "Владелец",
    email: "owner@webtavern.local",
    password: "DemoPass123!",
    hint: "Подходит для проверки кабинета владельца и редактирования схем залов."
  },
  {
    label: "Клиент",
    email: "client@webtavern.local",
    password: "DemoPass123!",
    hint: "Подходит для проверки пользовательского профиля и каталога заведений."
  }
];

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validateLoginFields(email: string, password: string): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return "Введите email.";
  if (!emailPattern.test(normalizedEmail)) return "Введите email на латинице и обязательно со знаком @.";
  if (!password) return "Введите пароль.";
  return null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState<{ email: string } | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setMessage("Вы уже авторизованы. Можно сразу открыть профиль.");
    }

    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoginSuccess(null);
    setRedirecting(false);

    const formData = new FormData(event.currentTarget);
    const rawEmail = String(formData.get("email") ?? email);
    const rawPassword = String(formData.get("password") ?? password);
    const normalizedEmail = rawEmail.trim().toLowerCase();

    if (rawEmail !== email) setEmail(normalizedEmail);
    if (rawPassword !== password) setPassword(rawPassword);

    const validationError = validateLoginFields(normalizedEmail, rawPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest<AuthResponse>("/auth/login/", {
        method: "POST",
        body: { email: normalizedEmail, password: rawPassword }
      });

      storeAuthSession(result.token, result.user);
      setLoginSuccess({ email: result.user.email });
      setRedirecting(true);
      setMessage(`Вход выполнен. Сейчас откроется профиль для ${result.user.email}.`);

      redirectTimerRef.current = window.setTimeout(() => {
        window.location.href = "/account";
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-stack narrow-page">
      <section className="card">
        <span className="section-kicker">Вход в систему</span>
        <h1>Авторизация</h1>
        <p>Введите email и пароль или подставьте готовый демо-аккаунт для быстрой проверки основных страниц проекта.</p>
      </section>

      <section className="grid grid-two">
        <article className="card compact-card">
          <h2>Демо-аккаунты</h2>
          <div className="demo-list">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                className="demo-account"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                  setMessage(`Подставлены данные для роли: ${account.label.toLowerCase()}.`);
                  setError(null);
                }}
              >
                <strong>{account.label}</strong>
                <span>{account.email}</span>
                <small>{account.hint}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="card compact-card">
          <h2>Форма входа</h2>
          <form className="form" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span>Email</span>
              <input
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value.replace(/[^A-Za-z0-9._%+@\-]/g, "").toLowerCase())}
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="mail@example.com"
                required
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Введите пароль"
                required
              />
            </label>
            <button className="button button-primary" type="submit" disabled={loading || redirecting}>
              {loading ? "Входим..." : redirecting ? "Переходим в профиль..." : "Войти"}
            </button>
          </form>
          {loginSuccess && (
            <div className="auth-success top-gap" role="status" aria-live="polite">
              <span className="auth-success-icon" aria-hidden="true">✓</span>
              <div className="auth-success-copy">
                <strong>Вход прошёл успешно</strong>
                <span>Аккаунт {loginSuccess.email} подтверждён. Сейчас откроется страница профиля.</span>
              </div>
            </div>
          )}
          <div className="top-gap helper-links">
            <span className="muted-block">Нет аккаунта?</span>
            <a className="text-link" href="/register">Перейти к регистрации</a>
          </div>
          {message && <p className="success-text top-gap">{message}</p>}
          {error && <p className="error-text top-gap pre-line">{error}</p>}
        </article>
      </section>
    </section>
  );
}
