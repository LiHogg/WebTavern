"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { Venue } from "@/entities/venue/model/types";
import { apiRequest } from "@/services/api/client";
import { VenueMap } from "@/widgets/venue-map/venue-map";

type GeoCity = {
  city: string;
  districts: string[];
};

type SelectOption = {
  value: string;
  label: string;
};

type GeoOptions = {
  cities: GeoCity[];
  cuisines: string[];
  price_categories: SelectOption[];
  venue_themes: SelectOption[];
};

type DetectedCity = {
  city: string;
  district?: string;
  distance_km: number;
  latitude: number;
  longitude: number;
  venue_slug: string;
  venue_name: string;
};

type Filters = {
  q: string;
  city: string;
  district: string;
  cuisine: string;
  price_category: string;
  venue_theme: string;
  radius_km: string;
};

const emptyFilters: Filters = {
  q: "",
  city: "",
  district: "",
  cuisine: "",
  price_category: "",
  venue_theme: "",
  radius_km: "15",
};

function buildCatalogPath(filters: Filters, coords?: { lat: number; lng: number } | null): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const normalized = value.trim();
    if (!normalized) return;
    if (key === "radius_km" && !coords) return;
    query.set(key, normalized);
  });
  if (coords) {
    query.set("lat", String(coords.lat));
    query.set("lng", String(coords.lng));
    query.set("radius_km", filters.radius_km || "15");
  }
  const suffix = query.toString();
  return suffix ? `/venues/?${suffix}` : "/venues/";
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

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [geoOptions, setGeoOptions] = useState<GeoOptions | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedCity, setDetectedCity] = useState<DetectedCity | null>(null);
  const [nearbyMode, setNearbyMode] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapVenues, setMapVenues] = useState<Venue[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedCityDistricts = useMemo(() => {
    if (!geoOptions || !filters.city) return [];
    return geoOptions.cities.find((item) => item.city === filters.city)?.districts ?? [];
  }, [filters.city, geoOptions]);

  async function loadVenues(nextFilters = filters, nextCoords = nearbyMode ? coords : null) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Venue[]>(buildCatalogPath(nextFilters, nextCoords));
      setVenues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить каталог");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialFilters: Filters = {
      ...emptyFilters,
      q: params.get("q") ?? "",
      city: params.get("city") ?? "",
      district: params.get("district") ?? "",
      cuisine: params.get("cuisine") ?? "",
      price_category: params.get("price_category") ?? "",
      venue_theme: params.get("venue_theme") ?? "",
      radius_km: params.get("radius_km") ?? emptyFilters.radius_km,
    };
    setFilters(initialFilters);
    Promise.all([
      apiRequest<Venue[]>(buildCatalogPath(initialFilters, null)),
      apiRequest<GeoOptions>("/venues/geo_options/"),
    ])
      .then(([venueData, geoData]) => {
        setVenues(venueData);
        setGeoOptions(geoData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить каталог"))
      .finally(() => setLoading(false));
  }, []);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "city") {
        next.district = "";
      }
      return next;
    });
  }

  async function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await loadVenues(filters, nearbyMode ? coords : null);
  }

  async function detectCityAndFilter() {
    setGeoMessage(null);
    setError(null);
    try {
      const position = await getPosition();
      const nextCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCoords(nextCoords);
      const detected = await apiRequest<DetectedCity>(`/venues/detect_city/?lat=${nextCoords.lat}&lng=${nextCoords.lng}`);
      setDetectedCity(detected);
      const nextFilters = { ...filters, city: detected.city, district: "", radius_km: filters.radius_km || "15" };
      setFilters(nextFilters);
      setNearbyMode(true);
      setGeoMessage(`Определили ближайший город: ${detected.city}. Ближайшая демо-точка — ${detected.venue_name}, ${detected.distance_km} км.`);
      await loadVenues(nextFilters, nextCoords);
    } catch (err) {
      setGeoMessage(null);
      setError(err instanceof Error ? err.message : "Не удалось определить город.");
    }
  }

  async function resetFilters() {
    setFilters(emptyFilters);
    setCoords(null);
    setDetectedCity(null);
    setNearbyMode(false);
    setGeoMessage(null);
    await loadVenues(emptyFilters, null);
  }

  async function openVenueMap() {
    setMapOpen(true);
    if (mapVenues.length > 0) return;
    setMapLoading(true);
    setMapError(null);
    try {
      const data = await apiRequest<Venue[]>("/venues/map_points/");
      setMapVenues(data);
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Не удалось загрузить карту заведений.");
    } finally {
      setMapLoading(false);
    }
  }

  return (
    <section className="page-stack">
      <section className="hero hero-compact">
        <span className="section-kicker">Каталог заведений</span>
        <h1>Выберите город, район или найдите заведения рядом с собой</h1>
        <p className="hero-text">
          География теперь работает как часть ядра: город проживания, районы, координаты заведений и поиск в радиусе.
        </p>
        <div className="button-row">
          <button className="button button-primary" type="button" onClick={openVenueMap}>Открыть карту заведений</button>
          <span className="muted-block">На карте отображаются все опубликованные партнёрские заведения.</span>
        </div>
      </section>

      <section className="card catalog-filter-card">
        <form className="form" onSubmit={applyFilters}>
          <div className="grid grid-4">
            <label className="field">
              <span>Поиск</span>
              <input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Название, кухня, адрес" />
            </label>
            <label className="field">
              <span>Город</span>
              <select value={filters.city} onChange={(event) => updateFilter("city", event.target.value)}>
                <option value="">Все города</option>
                {(geoOptions?.cities ?? []).map((item) => (
                  <option key={item.city} value={item.city}>{item.city}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Район</span>
              <select value={filters.district} onChange={(event) => updateFilter("district", event.target.value)} disabled={!filters.city}>
                <option value="">Все районы</option>
                {selectedCityDistricts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Кухня</span>
              <select value={filters.cuisine} onChange={(event) => updateFilter("cuisine", event.target.value)}>
                <option value="">Любая кухня</option>
                {(geoOptions?.cuisines ?? []).map((cuisine) => (
                  <option key={cuisine} value={cuisine}>{cuisine}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-4">
            <label className="field">
              <span>Ценовая категория</span>
              <select value={filters.price_category} onChange={(event) => updateFilter("price_category", event.target.value)}>
                <option value="">Любая</option>
                {(geoOptions?.price_categories ?? []).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Тема заведения</span>
              <select value={filters.venue_theme} onChange={(event) => updateFilter("venue_theme", event.target.value)}>
                <option value="">Любая</option>
                {(geoOptions?.venue_themes ?? []).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Радиус рядом, км</span>
              <input type="number" min="1" max="5000" value={filters.radius_km} onChange={(event) => updateFilter("radius_km", event.target.value)} />
            </label>
            <div className="catalog-filter-actions">
              <button className="button button-primary" type="submit" disabled={loading}>Применить</button>
              <button className="button button-secondary" type="button" onClick={detectCityAndFilter} disabled={loading}>Рядом со мной</button>
              <button className="button button-secondary" type="button" onClick={resetFilters} disabled={loading}>Сбросить</button>
              <button className="button button-secondary" type="button" onClick={openVenueMap}>Карта</button>
            </div>
          </div>
        </form>

        {geoMessage && <p className="success-text top-gap">{geoMessage}</p>}
        {detectedCity && nearbyMode && (
          <p className="muted-block top-gap">
            Активен поиск рядом: {detectedCity.city}, радиус {filters.radius_km} км. Список отсортирован по расстоянию.
          </p>
        )}
      </section>

      {loading && <section className="card">Загрузка заведений…</section>}
      {error && <section className="card error-card">Ошибка: {error}</section>}

      {!loading && !error && (
        <section className="grid grid-three">
          {venues.map((venue) => (
            <article key={venue.id} className="venue-card">
              <div className="eyebrow-row">
                <span className="pill">{venue.city}</span>
                {venue.district && <span className="pill">{venue.district}</span>}
                {venue.distance_km != null && <span className="pill">≈ {venue.distance_km} км</span>}
                <span className="pill pill-rating">★ {Number(venue.average_rating).toFixed(1)}</span>
              </div>
              <div className="venue-card-body">
                <h2>{venue.name}</h2>
                <p>{venue.short_description || "Описание пока не заполнено."}</p>
              </div>
              <div className="venue-meta-row">
                {venue.cuisine && <span>{venue.cuisine}</span>}
                {venue.price_category && <span>{venue.price_category}</span>}
                {venue.venue_theme && <span>{venue.venue_theme}</span>}
              </div>
              <div className="venue-card-footer">
                <span className="muted-block">{venue.address}</span>
                <a className="button button-secondary" href={`/venues/${venue.slug}`}>Открыть</a>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && !error && venues.length === 0 && (
        <section className="card">По выбранным фильтрам заведений нет. Попробуйте увеличить радиус или сбросить район.</section>
      )}

      {mapOpen && (
        <VenueMap
          venues={mapVenues}
          loading={mapLoading}
          error={mapError}
          onClose={() => setMapOpen(false)}
        />
      )}
    </section>
  );
}
