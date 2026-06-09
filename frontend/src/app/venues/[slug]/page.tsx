"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import type { Venue, VenueTable } from "@/entities/venue/model/types";
import { LayoutPreview } from "@/widgets/layout-preview/layout-preview";
import { apiRequest } from "@/services/api/client";
import { getStoredToken } from "@/shared/lib/auth";

type BookingLite = {
  id: number;
  table: number;
  table_name: string;
  status: string;
  booking_start: string;
  booking_end: string;
  hold_expires_at?: string | null;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getTomorrowDateValue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildLocalDateTime(dateValue: string, timeValue: string): Date | null {
  if (!dateValue || !timeValue) return null;
  const value = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildVenuePath(slug: string, bookingStart?: Date, bookingEnd?: Date): string {
  if (!bookingStart || !bookingEnd) return `/venues/${slug}/`;
  const query = new URLSearchParams();
  query.set("booking_start", bookingStart.toISOString());
  query.set("booking_end", bookingEnd.toISOString());
  return `/venues/${slug}/?${query.toString()}`;
}

function getBackgroundForVariant(variant?: string): string {
  switch (variant) {
    case "warm-gradient":
      return "linear-gradient(135deg, #fff7ed 0%, #fde68a 100%)";
    case "cool-gradient":
      return "linear-gradient(135deg, #eff6ff 0%, #cffafe 100%)";
    case "dark-soft":
      return "linear-gradient(135deg, #111827 0%, #312e81 100%)";
    case "graphite-grid":
      return "linear-gradient(135deg, #111827 0%, #1f2937 100%)";
    case "pattern-soft":
      return "linear-gradient(135deg, #f8fafc 0%, #dcfce7 100%)";
    case "soft-paper":
      return "linear-gradient(135deg, #fff7ed 0%, #faf5ff 100%)";
    default:
      return "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)";
  }
}

function getVenueThemeStyle(venue: Venue): CSSProperties {
  const branding = venue.branding;
  if (!branding) return {};
  return {
    "--venue-accent": branding.accent_color,
    "--venue-text": branding.card_text_color || branding.text_color,
    "--venue-card-bg": branding.card_background_color,
    "--venue-badge-bg": branding.badge_background_color,
    "--venue-badge-text": branding.badge_text_color,
    "--venue-cta-bg": branding.cta_background_color,
    "--venue-cta-text": branding.cta_text_color,
    "--venue-page-bg": getBackgroundForVariant(branding.background_variant),
  } as CSSProperties;
}

function getTableStateLabel(table: VenueTable): string {
  return table.occupancy?.label ?? "Свободен";
}

export default function VenueDetailPage() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = useMemo(() => {
    const value = params?.slug;
    return Array.isArray(value) ? value[0] : value;
  }, [params]);

  const [venue, setVenue] = useState<Venue | null>(null);
  const [selectedHallId, setSelectedHallId] = useState<number | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [bookingDate, setBookingDate] = useState(getTomorrowDateValue);
  const [bookingTime, setBookingTime] = useState("19:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [guestsCount, setGuestsCount] = useState("2");
  const [customerComment, setCustomerComment] = useState("");
  const [hold, setHold] = useState<BookingLite | null>(null);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function applyLoadedVenue(data: Venue) {
    setVenue(data);
    setSelectedHallId((current) => {
      const halls = data.halls ?? [];
      if (current && halls.some((hall) => hall.id === current)) return current;
      return halls[0]?.id ?? null;
    });
  }

  async function loadVenue(intervalStart?: Date, intervalEnd?: Date) {
    if (!slug) return;
    const token = getStoredToken();
    const data = await apiRequest<Venue>(buildVenuePath(slug, intervalStart, intervalEnd), { token });
    applyLoadedVenue(data);
  }

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    loadVenue()
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить страницу заведения."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const selectedHall = useMemo(() => {
    return (venue?.halls ?? []).find((hall) => hall.id === selectedHallId) ?? null;
  }, [venue, selectedHallId]);

  const selectedTable = useMemo(() => {
    return selectedHall?.tables.find((table) => table.id === selectedTableId) ?? null;
  }, [selectedHall, selectedTableId]);

  const selectedInterval = useMemo(() => {
    const start = buildLocalDateTime(bookingDate, bookingTime);
    const duration = Number(durationMinutes);
    if (!start || !Number.isFinite(duration) || duration <= 0) return null;
    return { start, end: addMinutes(start, duration) };
  }, [bookingDate, bookingTime, durationMinutes]);

  const hallStats = useMemo(() => {
    const tables = selectedHall?.tables ?? [];
    const total = tables.length;
    const heldByYou = tables.filter((table) => table.occupancy?.state === "held_by_you").length;
    const occupied = tables.filter((table) => table.occupancy?.state === "occupied" || table.occupancy?.state === "held_by_you").length;
    const free = total - occupied;
    return { total, free, occupied, heldByYou, capacity: selectedHall?.capacity ?? 0 };
  }, [selectedHall]);

  async function checkAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBookingError(null);
    setBookingMessage(null);
    setHold(null);
    setSelectedTableId(null);

    if (!selectedInterval) {
      setBookingError("Укажите корректную дату, время и длительность брони.");
      return;
    }

    setLoading(true);
    try {
      await loadVenue(selectedInterval.start, selectedInterval.end);
      setAvailabilityChecked(true);
      setBookingMessage("Доступность столов обновлена для выбранного времени.");
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Не удалось проверить доступность.");
    } finally {
      setLoading(false);
    }
  }

  async function createHold() {
    setBookingError(null);
    setBookingMessage(null);

    const token = getStoredToken();
    if (!token) {
      setBookingError("Сначала войдите в аккаунт, затем вернитесь к выбору стола.");
      return;
    }
    if (!venue || !selectedHall || !selectedTable || !selectedInterval) {
      setBookingError("Выберите зал, свободный стол и время бронирования.");
      return;
    }
    if ((selectedTable.occupancy?.state === "occupied" || selectedTable.occupancy?.state === "held_by_you")) {
      setBookingError("Этот стол уже занят на выбранный интервал.");
      return;
    }

    setHolding(true);
    try {
      const result = await apiRequest<BookingLite>("/bookings/hold/", {
        method: "POST",
        token,
        body: {
          venue: venue.id,
          hall: selectedHall.id,
          table: selectedTable.id,
          guests_count: Number(guestsCount),
          booking_start: selectedInterval.start.toISOString(),
          booking_end: selectedInterval.end.toISOString(),
          customer_comment: customerComment,
        },
      });
      setHold(result);
      setBookingMessage(`Бронь #${result.id} создана. Стол «${result.table_name}» зарезервирован на выбранный слот и заблокирован для других клиентов. Менеджер уже видит бронь.`);
      setSelectedTableId(null);
      setCustomerComment("");
      await loadVenue(selectedInterval.start, selectedInterval.end);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Не удалось зарезервировать стол.");
    } finally {
      setHolding(false);
    }
  }

  if (!slug) {
    return <section className="panel">Загрузка маршрута заведения…</section>;
  }

  if (loading && !venue) {
    return <section className="panel">Загрузка страницы заведения…</section>;
  }

  if (error) {
    return (
      <section className="panel panel-error">
        <h1>Не удалось открыть страницу заведения</h1>
        <p>{error}</p>
        <div className="button-row">
          <a className="button button-primary" href="/venues">Вернуться в каталог</a>
        </div>
      </section>
    );
  }

  if (!venue) {
    return <section className="panel">Заведение не найдено.</section>;
  }

  return (
    <section className="page-stack venue-themed-shell" style={getVenueThemeStyle(venue)}>
      <section className="hero hero-venue">
        <div className="eyebrow-row">
          <span className="pill">{venue.city}</span>
          {venue.district && <span className="pill">{venue.district}</span>}
          {venue.cuisine && <span className="pill">{venue.cuisine}</span>}
          <span className="pill pill-rating">★ {Number(venue.average_rating).toFixed(1)}</span>
        </div>
        <h1>{venue.name}</h1>
        <p className="hero-text">{venue.description || venue.short_description || "Описание пока не заполнено."}</p>
        <div className="info-grid">
          <div className="info-card">
            <span className="info-label">Адрес</span>
            <strong>{venue.address}</strong>
          </div>
          <div className="info-card">
            <span className="info-label">Предоплата</span>
            <strong>
              {venue.booking_rule
                ? `${venue.booking_rule.deposit_amount} ${venue.booking_rule.deposit_currency}`
                : "Настраивается заведением"}
            </strong>
          </div>
          <div className="info-card">
            <span className="info-label">Подтверждение</span>
            <strong>{venue.booking_rule?.requires_manager_confirmation ? "Менеджером" : "Автоматически"}</strong>
          </div>
        </div>
      </section>

      <section className="grid grid-two">
        <article className="panel">
          <div className="section-topline">
            <span className="section-kicker">Бронирование</span>
            <h2>Правила посещения</h2>
          </div>
          {venue.booking_rule ? (
            <div className="definition-list">
              <div><span>Базовая длительность</span><strong>{venue.booking_rule.default_duration_minutes} мин.</strong></div>
              <div><span>Шаг временных слотов</span><strong>{venue.booking_rule.slot_step_minutes} мин.</strong></div>
              <div><span>Буфер уборки</span><strong>{venue.booking_rule.cleanup_buffer_minutes} мин.</strong></div>
              <div><span>Резерв слота</span><strong>до конца выбранного интервала</strong></div>
              <div><span>Примерное время</span><strong>{venue.booking_rule.allow_client_approximate_time ? "Да" : "Нет"}</strong></div>
              <div><span>Подсадка</span><strong>{venue.booking_rule.allow_shared_seating ? "Да" : "Нет"}</strong></div>
            </div>
          ) : (
            <p>Правила пока не настроены.</p>
          )}
        </article>

        <article className="panel">
          <div className="section-topline">
            <span className="section-kicker">Оформление</span>
            <h2>Стиль заведения</h2>
          </div>
          {venue.branding ? (
            <div className="definition-list">
              <div><span>Тема</span><strong>{venue.branding.theme_mode === "dark" ? "Тёмная" : "Светлая"}</strong></div>
              <div><span>Пресет</span><strong>{venue.branding.theme_preset}</strong></div>
              <div><span>Акцент</span><strong>{venue.branding.accent_color}</strong></div>
              <div><span>Палитра</span><strong>{venue.branding.use_custom_palette ? "Своя" : "Готовая"}</strong></div>
            </div>
          ) : (
            <p>Кастомная тема пока не задана.</p>
          )}
        </article>
      </section>

      <section className="panel booking-panel">
        <div className="section-topline">
          <span className="section-kicker">Выбор стола</span>
          <h2>Проверьте доступность и забронируйте стол</h2>
        </div>

        <form className="form booking-filter" onSubmit={checkAvailability}>
          <div className="grid grid-4">
            <label className="field">
              <span>Дата</span>
              <input type="date" min={getTomorrowDateValue()} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} required />
            </label>
            <label className="field">
              <span>Время</span>
              <input type="time" value={bookingTime} onChange={(event) => setBookingTime(event.target.value)} required />
            </label>
            <label className="field">
              <span>Длительность, мин.</span>
              <input type="number" min="30" step="10" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required />
            </label>
            <label className="field">
              <span>Гостей</span>
              <input type="number" min="1" value={guestsCount} onChange={(event) => setGuestsCount(event.target.value)} required />
            </label>
          </div>
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Проверяем…" : "Проверить доступность"}
          </button>
        </form>

        {(venue.halls ?? []).length > 0 && (
          <div className="hall-tabs top-gap">
            {(venue.halls ?? []).map((hall) => (
              <button
                key={hall.id}
                type="button"
                className={`hall-tab${selectedHallId === hall.id ? " hall-tab-active" : ""}`}
                onClick={() => {
                  setSelectedHallId(hall.id);
                  setSelectedTableId(null);
                }}
              >
                <strong>{hall.name}</strong>
                <span>до {hall.capacity} гостей</span>
              </button>
            ))}
          </div>
        )}

        {selectedHall && (
          <div className="selected-hall-grid top-gap">
            <div className="layout-shell booking-layout-shell">
              <LayoutPreview
                hall={selectedHall}
                interactive
                selectedTableId={selectedTableId}
                onTableSelect={(table) => {
                  setSelectedTableId(table.id);
                  setHold(null);
                  setBookingMessage(null);
                  setBookingError(null);
                }}
              />
            </div>

            <aside className="booking-sidebar">
              <div className="stats-grid">
                <div><span>Всего столов</span><strong>{hallStats.total}</strong></div>
                <div><span>Свободно</span><strong>{hallStats.free}</strong></div>
                <div><span>Занято</span><strong>{hallStats.occupied}</strong></div>
                <div><span>Ваши брони</span><strong>{hallStats.heldByYou}</strong></div>
                <div><span>Вместимость</span><strong>{hallStats.capacity}</strong></div>
              </div>

              <div className="table-status-list top-gap">
                {selectedHall.tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    className={`table-status-row${selectedTableId === table.id ? " table-status-row-active" : ""}`}
                    disabled={(table.occupancy?.state === "occupied" || table.occupancy?.state === "held_by_you")}
                    onClick={() => setSelectedTableId(table.id)}
                  >
                    <strong>{table.name}</strong>
                    <span>{table.seats_count} мест · {getTableStateLabel(table)}</span>
                  </button>
                ))}
                {selectedHall.tables.length === 0 && <span className="muted-block">Столы ещё не добавлены.</span>}
              </div>

              {selectedTable && (
                <div className="subcard stack-sm top-gap">
                  <h3 className="subcard-title">Выбран стол «{selectedTable.name}»</h3>
                  <p className="muted-block">
                    {selectedTable.seats_count} мест · {getTableStateLabel(selectedTable)}
                    {availabilityChecked && selectedInterval ? ` · ${formatDateTime(selectedInterval.start.toISOString())}` : ""}
                  </p>
                  <label className="field">
                    <span>Комментарий к брони</span>
                    <textarea rows={3} value={customerComment} onChange={(event) => setCustomerComment(event.target.value)} placeholder="Например: будем с ребёнком, нужен стульчик" />
                  </label>
                  <div className="button-row">
                    <button className="button button-primary" type="button" disabled={holding || (selectedTable.occupancy?.state === "occupied" || selectedTable.occupancy?.state === "held_by_you")} onClick={createHold}>
                      {holding ? "Бронируем…" : "Забронировать стол"}
                    </button>
                  </div>
                  {hold?.hold_expires_at && <p className="muted-block">Резерв активен до {formatDateTime(hold.hold_expires_at)}.</p>}
                </div>
              )}
            </aside>
          </div>
        )}

        {bookingMessage && <p className="success-text top-gap">{bookingMessage}</p>}
        {bookingError && <p className="error-text top-gap pre-line">{bookingError}</p>}
      </section>
    </section>
  );
}
