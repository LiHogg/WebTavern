"use client";

import { useState } from "react";

import { apiRequest } from "@/services/api/client";
import { getStoredToken } from "@/shared/lib/auth";

const initialForm = {
  name: "",
  city: "",
  address: "",
  short_description: "",
  description: ""
};

export default function PartnerPage() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const token = getStoredToken();
    if (!token) {
      setError("Сначала войдите под владельцем, затем вернитесь к форме добавления заведения.");
      return;
    }

    try {
      const venue = await apiRequest<{ slug: string; name: string }>("/venues/", {
        method: "POST",
        token,
        body: form
      });
      setMessage(`Черновик «${venue.name}» создан. Его можно донастроить в кабинете владельца.`);
      setForm(initialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания заведения");
    }
  }

  return (
    <section className="page-stack narrow-page">
      <section className="card">
        <span className="section-kicker">Добавление заведения</span>
        <h1>Создать черновик площадки</h1>
        <p>Эта форма уже работает. После входа под владельцем она создаёт новое заведение через API.</p>
      </section>
      <section className="card">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Название</span>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
          </label>
          <div className="grid grid-two">
            <label className="field">
              <span>Город</span>
              <input value={form.city} onChange={(event) => updateField("city", event.target.value)} required />
            </label>
            <label className="field">
              <span>Адрес</span>
              <input value={form.address} onChange={(event) => updateField("address", event.target.value)} required />
            </label>
          </div>
          <label className="field">
            <span>Краткое описание</span>
            <input value={form.short_description} onChange={(event) => updateField("short_description", event.target.value)} />
          </label>
          <label className="field">
            <span>Полное описание</span>
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows={5} />
          </label>
          <button className="button button-primary" type="submit">
            Создать черновик
          </button>
        </form>
        {message && <p className="success-text top-gap">{message}</p>}
        {error && <p className="error-text top-gap">{error}</p>}
      </section>
    </section>
  );
}
