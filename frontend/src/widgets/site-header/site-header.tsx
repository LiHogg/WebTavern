"use client";

import { useEffect, useMemo, useState } from "react";

import type { User } from "@/entities/auth/model/types";
import { apiRequest } from "@/services/api/client";
import { clearAuthSession, getStoredToken, getStoredUser, setStoredUser } from "@/shared/lib/auth";

type NavLink = {
  href: string;
  label: string;
};

const guestLinks: NavLink[] = [
  { href: "/", label: "Главная" },
  { href: "/venues", label: "Заведения" },
  { href: "/login", label: "Вход" },
  { href: "/register", label: "Регистрация" }
];

function getRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Владелец";
    case "manager":
      return "Менеджер";
    case "moderator":
      return "Модератор";
    case "platform_admin":
      return "Администратор";
    default:
      return "Клиент";
  }
}

export function SiteHeader() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }

    apiRequest<User>("/auth/me/", { token })
      .then((profile) => {
        setStoredUser(profile);
        setUser(profile);
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
      });
  }, []);

  const links = useMemo(() => {
    if (!user) return guestLinks;

    return [
      { href: "/", label: "Главная" },
      { href: "/venues", label: "Заведения" }
    ];
  }, [user]);

  const displayModes = (user?.available_modes || (user?.role ? [user.role] : [])).filter((mode) => mode !== "client");

  const modeHrefMap: Record<string, string> = {
    owner: "/owner",
    manager: "/manager",
    moderator: "/platform-admin",
    platform_admin: "/platform-admin"
  };

  return (
    <header className="site-header">
      <a className="brand" href="/">
        <span className="brand-mark">WT</span>
        <span className="brand-copy">
          <strong>WebTavern</strong>
          <small>Платформа поиска заведений и бронирования столов</small>
        </span>
      </a>

      <nav className="nav" aria-label="Основная навигация">
        {links.map((item) => (
          <a key={item.href} className="nav-link" href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="header-actions">
        {user ? (
          <>
            <div className="header-user">
              <a className="header-user-name" href="/account">{user.first_name || user.email}</a>
              {displayModes.length ? (
                <span className="header-user-role">
                  {displayModes.map((mode, index) => {
                    const label = getRoleLabel(mode);
                    const href = modeHrefMap[mode];
                    return (
                      <span key={mode}>
                        {index > 0 ? " · " : ""}
                        {href ? <a className="header-mode-link" href={href}>{label}</a> : label}
                      </span>
                    );
                  })}
                </span>
              ) : null}
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                clearAuthSession();
                window.location.href = "/login";
              }}
            >
              Выйти
            </button>
          </>
        ) : (
          <a className="button button-primary" href="/login">
            Войти
          </a>
        )}
      </div>
    </header>
  );
}
