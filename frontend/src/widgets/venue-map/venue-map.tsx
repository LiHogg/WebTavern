"use client";

import { useEffect, useMemo, useState } from "react";

import type { Venue } from "@/entities/venue/model/types";

type PositionedVenue = Venue & {
  lat: number;
  lng: number;
  x: number;
  y: number;
};

type VenueMapProps = {
  venues: Venue[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLabel(value?: string | null): string | null {
  if (!value) return null;
  return String(value).replace(/_/g, " ");
}

export function VenueMap({ venues, loading = false, error = null, onClose }: VenueMapProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { positionedVenues, withoutCoordinates, cityStats } = useMemo(() => {
    const coordinateVenues = venues
      .map((venue) => ({
        venue,
        lat: toNumber(venue.latitude),
        lng: toNumber(venue.longitude),
      }))
      .filter((item): item is { venue: Venue; lat: number; lng: number } => item.lat !== null && item.lng !== null);

    const lats = coordinateVenues.map((item) => item.lat);
    const lngs = coordinateVenues.map((item) => item.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lngSpan = Math.max(maxLng - minLng, 0.01);

    const points = coordinateVenues.map(({ venue, lat, lng }) => {
      const x = 7 + ((lng - minLng) / lngSpan) * 86;
      const y = 9 + ((maxLat - lat) / latSpan) * 78;
      return { ...venue, lat, lng, x, y };
    });

    const cityMap = new Map<string, number>();
    venues.forEach((venue) => {
      const city = venue.city || "Город не указан";
      cityMap.set(city, (cityMap.get(city) ?? 0) + 1);
    });

    return {
      positionedVenues: points,
      withoutCoordinates: venues.filter((venue) => toNumber(venue.latitude) === null || toNumber(venue.longitude) === null),
      cityStats: Array.from(cityMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru")),
    };
  }, [venues]);

  const selectedVenue = useMemo(() => {
    if (!positionedVenues.length) return null;
    return positionedVenues.find((venue) => venue.slug === selectedSlug) ?? positionedVenues[0];
  }, [positionedVenues, selectedSlug]);

  useEffect(() => {
    if (!selectedSlug && positionedVenues[0]) {
      setSelectedSlug(positionedVenues[0].slug);
    }
    if (selectedSlug && !positionedVenues.some((venue) => venue.slug === selectedSlug)) {
      setSelectedSlug(positionedVenues[0]?.slug ?? null);
    }
  }, [positionedVenues, selectedSlug]);

  return (
    <div className="venue-map-overlay" role="dialog" aria-modal="true" aria-labelledby="venue-map-title">
      <div className="venue-map-modal">
        <div className="venue-map-header">
          <div>
            <span className="section-kicker">Карта партнёров</span>
            <h2 id="venue-map-title">Все заведения, сотрудничающие с WebTavern</h2>
            <p>Точки строятся по координатам заведений из каталога. Нажмите на точку, чтобы открыть краткую карточку.</p>
          </div>
          <button className="button button-secondary" type="button" onClick={onClose}>Закрыть</button>
        </div>

        {loading && <div className="card">Загружаем карту заведений…</div>}
        {error && <div className="card error-card">Ошибка загрузки карты: {error}</div>}

        {!loading && !error && (
          <div className="venue-map-grid">
            <div className="venue-map-canvas" aria-label="Схематичная карта заведений">
              <div className="venue-map-bg venue-map-bg-1" />
              <div className="venue-map-bg venue-map-bg-2" />
              <div className="venue-map-route venue-map-route-main" />
              <div className="venue-map-route venue-map-route-second" />
              <div className="venue-map-compass">N</div>

              {positionedVenues.length === 0 && (
                <div className="venue-map-empty">У заведений пока не указаны координаты.</div>
              )}

              {positionedVenues.map((venue, index) => {
                const isActive = selectedVenue?.slug === venue.slug;
                return (
                  <button
                    key={venue.slug}
                    type="button"
                    className={`venue-map-marker${isActive ? " venue-map-marker-active" : ""}`}
                    style={{ left: `${venue.x}%`, top: `${venue.y}%` }}
                    onClick={() => setSelectedSlug(venue.slug)}
                    aria-label={`Открыть карточку ${venue.name}`}
                    title={`${venue.name}, ${venue.city}`}
                  >
                    <span>{index + 1}</span>
                  </button>
                );
              })}
            </div>

            <aside className="venue-map-sidebar">
              <div className="venue-map-stats">
                <div>
                  <strong>{venues.length}</strong>
                  <span>заведений всего</span>
                </div>
                <div>
                  <strong>{positionedVenues.length}</strong>
                  <span>на карте</span>
                </div>
                <div>
                  <strong>{cityStats.length}</strong>
                  <span>городов</span>
                </div>
              </div>

              {selectedVenue && (
                <article className="venue-map-card">
                  <div className="eyebrow-row">
                    <span className="pill">{selectedVenue.city}</span>
                    {selectedVenue.district && <span className="pill">{selectedVenue.district}</span>}
                    <span className="pill pill-rating">★ {Number(selectedVenue.average_rating).toFixed(1)}</span>
                  </div>
                  <h3>{selectedVenue.name}</h3>
                  <p>{selectedVenue.short_description || "Описание пока не заполнено."}</p>
                  <div className="venue-meta-row">
                    {selectedVenue.cuisine && <span>{selectedVenue.cuisine}</span>}
                    {normalizeLabel(selectedVenue.price_category) && <span>{normalizeLabel(selectedVenue.price_category)}</span>}
                    {normalizeLabel(selectedVenue.venue_theme) && <span>{normalizeLabel(selectedVenue.venue_theme)}</span>}
                  </div>
                  <p className="muted-block">{selectedVenue.address}</p>
                  <a className="button button-primary" href={`/venues/${selectedVenue.slug}`}>Перейти к заведению</a>
                </article>
              )}

              <div className="venue-map-city-list">
                <h3>Города на карте</h3>
                {cityStats.map(([city, count]) => (
                  <div key={city} className="venue-map-city-row">
                    <span>{city}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>

              {withoutCoordinates.length > 0 && (
                <p className="muted-block">
                  Без координат: {withoutCoordinates.map((venue) => venue.name).join(", ")}. Они есть в каталоге, но не отображаются точками.
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
