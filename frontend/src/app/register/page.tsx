"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthResponse } from "@/entities/auth/model/types";
import { apiRequest } from "@/services/api/client";
import { storeAuthSession } from "@/shared/lib/auth";

const initialForm = {
  first_name: "",
  last_name: "",
  middle_name: "",
  phone: "",
  email: "",
  date_of_birth: "",
  password: "",
  confirm_password: "",
  account_type: "individual",
  company_name: "",
  tax_number: "",
  registration_number: "",
  legal_address: ""
};

function capitalizeName(value: string): string {
  return value.replace(/(^|[\s-])([a-zA-Zа-яА-ЯёЁ])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  const local = digits.slice(1);
  let result = "+7";
  if (local.length > 0) result += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) result += ")";
  if (local.length > 3) result += ` ${local.slice(3, 6)}`;
  if (local.length > 6) result += `-${local.slice(6, 8)}`;
  if (local.length > 8) result += `-${local.slice(8, 10)}`;
  return result;
}

function normalizeInn(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validateRegisterForm(form: typeof initialForm): string | null {
  const normalizedEmail = form.email.trim().toLowerCase();
  if (!form.last_name.trim()) return "Укажите фамилию.";
  if (!form.first_name.trim()) return "Укажите имя.";
  if (!form.phone.trim()) return "Укажите телефон.";
  if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(form.phone.trim())) return "Введите телефон в формате +7 (999) 999-99-99.";
  if (!normalizedEmail) return "Укажите email.";
  if (!emailPattern.test(normalizedEmail)) return "Email должен быть на английском и обязательно содержать символ @.";
  if (!form.date_of_birth) return "Укажите дату рождения.";
  if (!form.password) return "Введите пароль.";
  if (form.password.length < 8) return "Пароль должен содержать минимум 8 символов.";
  if (!/[A-Za-z]/.test(form.password)) return "Пароль должен содержать хотя бы одну латинскую букву.";
  if (!/\d/.test(form.password)) return "Пароль должен содержать хотя бы одну цифру.";
  if (form.password !== form.confirm_password) return "Пароль и подтверждение пароля не совпадают.";
  if (form.account_type === "legal") {
    if (!form.company_name.trim()) return "Укажите название организации.";
    if (!form.tax_number.trim()) return "Укажите ИНН организации.";
    if (![10, 12].includes(form.tax_number.trim().length)) return "ИНН должен содержать 10 или 12 цифр.";
  }
  return null;
}

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  const isLegalAccount = useMemo(() => form.account_type === "legal", [form.account_type]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  function updateField(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setRegisteredEmail(null);

    const formData = new FormData(event.currentTarget);
    const submittedForm = {
      first_name: String(formData.get("first_name") ?? form.first_name),
      last_name: String(formData.get("last_name") ?? form.last_name),
      middle_name: String(formData.get("middle_name") ?? form.middle_name),
      phone: String(formData.get("phone") ?? form.phone),
      email: String(formData.get("email") ?? form.email),
      date_of_birth: String(formData.get("date_of_birth") ?? form.date_of_birth),
      password: String(formData.get("password") ?? form.password),
      confirm_password: String(formData.get("confirm_password") ?? form.confirm_password),
      account_type: String(formData.get("account_type") ?? form.account_type),
      company_name: String(formData.get("company_name") ?? form.company_name),
      tax_number: String(formData.get("tax_number") ?? form.tax_number),
      registration_number: String(formData.get("registration_number") ?? form.registration_number),
      legal_address: String(formData.get("legal_address") ?? form.legal_address)
    } as typeof initialForm;

    submittedForm.first_name = capitalizeName(submittedForm.first_name);
    submittedForm.last_name = capitalizeName(submittedForm.last_name);
    submittedForm.middle_name = capitalizeName(submittedForm.middle_name);
    submittedForm.phone = formatPhone(submittedForm.phone);
    submittedForm.email = submittedForm.email.replace(/[^A-Za-z0-9._%+@\-]/g, "").toLowerCase();
    submittedForm.tax_number = normalizeInn(submittedForm.tax_number);

    setForm(submittedForm);

    const normalizedEmail = submittedForm.email.trim().toLowerCase();
    const validationError = validateRegisterForm(submittedForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const payload = { ...submittedForm, email: normalizedEmail };
      const { confirm_password: _confirmPassword, ...requestPayload } = payload;
      const result = await apiRequest<AuthResponse>("/auth/register/", {
        method: "POST",
        body: requestPayload
      });
      storeAuthSession(result.token, result.user);
      setRegisteredEmail(result.user.email);
      setMessage(`Аккаунт создан. Сейчас откроется страница профиля для ${result.user.email}.`);
      setForm(initialForm);
      redirectTimerRef.current = window.setTimeout(() => {
        window.location.href = "/account";
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-stack narrow-page">
      <section className="card">
        <span className="section-kicker">Регистрация</span>
        <h1>Создайте клиентский аккаунт</h1>
        <p className="hero-text">После регистрации пользователь автоматически входит в систему и попадает на страницу профиля.</p>
      </section>

      <section className="card">
        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="grid grid-2">
            <label className="field">
              <span>Фамилия</span>
              <input name="last_name" value={form.last_name} onChange={(event) => updateField("last_name", capitalizeName(event.target.value))} placeholder="Иванов" required />
            </label>
            <label className="field">
              <span>Имя</span>
              <input name="first_name" value={form.first_name} onChange={(event) => updateField("first_name", capitalizeName(event.target.value))} placeholder="Иван" required />
            </label>
          </div>

          <label className="field">
            <span>Отчество</span>
            <input name="middle_name" value={form.middle_name} onChange={(event) => updateField("middle_name", capitalizeName(event.target.value))} placeholder="Иванович" />
          </label>

          <div className="grid grid-2">
            <label className="field">
              <span>Телефон</span>
              <input name="phone" value={form.phone} onChange={(event) => updateField("phone", formatPhone(event.target.value))} placeholder="+7 (999) 999-99-99" inputMode="tel" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="text" inputMode="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value.replace(/[^A-Za-z0-9._%+@\-]/g, "").toLowerCase())} placeholder="mail@example.com" required />
            </label>
          </div>

          <div className="grid grid-2">
            <label className="field">
              <span>Дата рождения</span>
              <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={(event) => updateField("date_of_birth", event.target.value)} required />
            </label>
            <label className="field">
              <span>Тип аккаунта</span>
              <select name="account_type" value={form.account_type} onChange={(event) => updateField("account_type", event.target.value)}>
                <option value="individual">Физическое лицо</option>
                <option value="legal">Юридическое лицо</option>
              </select>
            </label>
          </div>

          <div className="grid grid-2">
            <label className="field">
              <span>Пароль</span>
              <input name="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="Минимум 8 символов, буква и цифра" required />
            </label>
            <label className="field">
              <span>Подтверждение пароля</span>
              <input name="confirm_password" type="password" autoComplete="new-password" value={form.confirm_password} onChange={(event) => updateField("confirm_password", event.target.value)} placeholder="Повторите пароль" required />
            </label>
          </div>

          {isLegalAccount && (
            <div className="subcard stack-sm legal-box">
              <h2 className="subcard-title">Данные юридического лица</h2>
              <div className="grid grid-2">
                <label className="field">
                  <span>Название организации</span>
                  <input name="company_name" value={form.company_name} onChange={(event) => updateField("company_name", event.target.value)} placeholder="ООО Северный Берег" required={isLegalAccount} />
                </label>
                <label className="field">
                  <span>ИНН</span>
                  <input name="tax_number" value={form.tax_number} onChange={(event) => updateField("tax_number", normalizeInn(event.target.value))} placeholder="10 или 12 цифр" inputMode="numeric" required={isLegalAccount} />
                </label>
              </div>
              <div className="grid grid-2">
                <label className="field">
                  <span>ОГРН / регистрационный номер</span>
                  <input name="registration_number" value={form.registration_number} onChange={(event) => updateField("registration_number", event.target.value)} placeholder="Необязательно" />
                </label>
                <label className="field">
                  <span>Юридический адрес</span>
                  <input name="legal_address" value={form.legal_address} onChange={(event) => updateField("legal_address", event.target.value)} placeholder="Необязательно" />
                </label>
              </div>
            </div>
          )}

          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Создаём аккаунт..." : "Создать аккаунт"}
          </button>
          <p className="muted-block legal-form-note">
            Нажимая кнопку регистрации, вы принимаете <a className="text-link" href="/legal/terms">пользовательское соглашение</a>, соглашаетесь с <a className="text-link" href="/legal/privacy">политикой конфиденциальности</a> и <a className="text-link" href="/legal/personal-data">обработкой персональных данных</a>.
          </p>
        </form>
        {registeredEmail && (
          <div className="auth-success top-gap" role="status" aria-live="polite">
            <span className="auth-success-icon" aria-hidden="true">✓</span>
            <div className="auth-success-copy">
              <strong>Регистрация прошла успешно</strong>
              <span>Аккаунт {registeredEmail} создан. Сейчас откроется страница профиля.</span>
            </div>
          </div>
        )}
        <div className="top-gap helper-links">
          <span className="muted-block">Уже есть аккаунт?</span>
          <a className="text-link" href="/login">Перейти ко входу</a>
        </div>
        {message && <p className="success-text top-gap">{message}</p>}
        {error && <p className="error-text top-gap pre-line">{error}</p>}
      </section>
    </section>
  );
}
