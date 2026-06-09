"use client";

import { useEffect, useState } from "react";

import type { User } from "@/entities/auth/model/types";
import { apiRequest } from "@/services/api/client";
import { clearAuthSession, getStoredToken, getStoredUser, setStoredUser } from "@/shared/lib/auth";

type DetectedCity = {
  city: string;
  district?: string;
  distance_km: number;
  venue_name: string;
};

function getRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Владелец";
    case "manager":
      return "Менеджер";
    case "moderator":
      return "Модератор";
    case "platform_admin":
      return "Администратор платформы";
    default:
      return "Клиент";
  }
}

function getAccountTypeLabel(accountType: string): string {
  return accountType === "legal" ? "Юридическое лицо" : "Физическое лицо";
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Браузер не поддерживает геолокацию."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 5 * 60 * 1000,
    });
  });
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [city, setCity] = useState(() => getStoredUser()?.city ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setError("Сначала войдите в систему или зарегистрируйтесь.");
      setLoading(false);
      return;
    }

    apiRequest<User>("/auth/me/", { token })
      .then((profile) => {
        setStoredUser(profile);
        setUser(profile);
        setCity(profile.city ?? "");
      })
      .catch((err) => {
        clearAuthSession();
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveCity(nextCity = city) {
    const token = getStoredToken();
    if (!token || !user) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiRequest<User>("/auth/me/", {
        method: "PATCH",
        token,
        body: { city: nextCity.trim() },
      });
      setStoredUser(updated);
      setUser(updated);
      setCity(updated.city ?? "");
      setMessage("Город проживания сохранён. Каталог сможет использовать его как основной фильтр.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить город.");
    } finally {
      setSaving(false);
    }
  }

  async function detectCity() {
    setDetecting(true);
    setError(null);
    setMessage(null);
    try {
      const position = await getPosition();
      const detected = await apiRequest<DetectedCity>(
        `/venues/detect_city/?lat=${position.coords.latitude}&lng=${position.coords.longitude}`
      );
      setCity(detected.city);
      await saveCity(detected.city);
      setMessage(`Определили город: ${detected.city}. Ближайшая демо-точка — ${detected.venue_name}, ${detected.distance_km} км.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось определить город.");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <section className="page-stack narrow-page">
      <section className="card">
        <span className="section-kicker">Личный кабинет</span>
        <h1>Профиль пользователя</h1>
        <p className="hero-text">В профиле можно указать город проживания или определить его автоматически по геолокации браузера.</p>
      </section>

      {loading && <section className="card">Загружаем профиль...</section>}

      {error && !loading && <section className="card error-card"><p>{error}</p></section>}
      {message && !loading && <section className="card success-card"><p>{message}</p></section>}

      {error && !loading && !user && (
        <section className="card">
          <div className="button-row">
            <a className="button button-primary" href="/login">Войти</a>
            <a className="button button-secondary" href="/register">Регистрация</a>
          </div>
        </section>
      )}

      {user && !loading && (
        <section className="card">
          <div className="definition-list">
            <div><span>ФИО</span><strong>{[user.last_name, user.first_name, user.middle_name].filter(Boolean).join(" ")}</strong></div>
            <div><span>Email</span><strong>{user.email}</strong></div>
            <div><span>Телефон</span><strong>{user.phone || "Не указан"}</strong></div>
            <div><span>Город проживания</span><strong>{user.city || "Не указан"}</strong></div>
            <div><span>Роль</span><strong>{getRoleLabel(user.role)}</strong></div>
            <div><span>Тип аккаунта</span><strong>{getAccountTypeLabel(user.account_type)}</strong></div>
            <div><span>Дата рождения</span><strong>{user.date_of_birth || "Не указана"}</strong></div>
          </div>

          <form className="form top-gap" onSubmit={(event) => { event.preventDefault(); void saveCity(); }}>
            <div className="grid grid-2">
              <label className="field">
                <span>Город проживания</span>
                <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Например: Нижний Новгород" />
              </label>
              <div className="account-city-actions">
                <button className="button button-primary" type="submit" disabled={saving || detecting}>
                  {saving ? "Сохраняем…" : "Сохранить город"}
                </button>
                <button className="button button-secondary" type="button" disabled={saving || detecting} onClick={detectCity}>
                  {detecting ? "Определяем…" : "Определить автоматически"}
                </button>
              </div>
            </div>
          </form>

          <div className="button-row top-gap">
            <a className="button button-secondary" href={user.city ? `/venues?city=${encodeURIComponent(user.city)}` : "/venues"}>Открыть каталог</a>
            {user.available_modes?.includes("owner") && <a className="button button-secondary" href="/owner">В кабинет владельца</a>}
            {user.available_modes?.includes("manager") && <a className="button button-secondary" href="/manager">В кабинет менеджера</a>}
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                clearAuthSession();
                window.location.href = "/login";
              }}
            >
              Выйти
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
