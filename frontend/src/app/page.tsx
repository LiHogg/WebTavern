"use client";

import { useEffect, useState } from "react";

import type { User } from "@/entities/auth/model/types";
import { getStoredUser } from "@/shared/lib/auth";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return (
    <section className="page-stack">
      <section className="hero hero-home hero-minimal">
        <span className="section-kicker">WebTavern</span>
        <h1>Платформа для поиска заведений и бронирования столов с понятной схемой зала</h1>
        <p className="hero-text">
          Теперь каталог учитывает города, районы, координаты и расстояние до пользователя, а заведения могут иметь собственную тему оформления.
        </p>
        <div className="button-row">
          {!user && <a className="button button-primary" href="/register">Создать аккаунт</a>}
          <a className="button button-secondary" href="/venues">Открыть каталог</a>
          {user && <a className="button button-primary" href="/account">Мой профиль</a>}
        </div>
        {user && (
          <p className="muted-block top-gap">
            Вы вошли как {user.first_name}. {user.city ? `Город проживания: ${user.city}.` : "Город проживания можно указать в профиле."}
          </p>
        )}
      </section>

      <section className="card compact-card">
        <div className="card-inline">
          <div>
            <span className="section-kicker">Проверка системы</span>
            <h2>Быстрый сценарий</h2>
            <p>Профиль → определение города → каталог с фильтрами → карточка заведения → выбор зала и стола.</p>
          </div>
          <a className="button button-secondary" href={user ? "/account" : "/login"}>{user ? "Открыть профиль" : "Перейти ко входу"}</a>
        </div>
      </section>
    </section>
  );
}
