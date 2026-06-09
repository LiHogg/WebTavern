"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";

import type { Venue, VenueBookingRule, VenueBranding, VenueHall, VenueTable } from "@/entities/venue/model/types";
import { LayoutEditor, type LayoutSavePayload } from "@/features/layout-editor/layout-editor";
import { apiRequest } from "@/services/api/client";
import { getStoredToken } from "@/shared/lib/auth";

type HallFormState = {
  venue: number;
  name: string;
  description: string;
  capacity: string;
  sort_order: string;
  is_active: boolean;
};

type TableFormState = {
  hall: number;
  name: string;
  seats_count: string;
  note: string;
  is_active: boolean;
  is_combinable: boolean;
};

type VenueFormState = {
  name: string;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: string;
  longitude: string;
  cuisine: string;
  price_category: string;
  venue_theme: string;
  short_description: string;
  description: string;
};

type RuleFormState = {
  default_duration_minutes: string;
  slot_step_minutes: string;
  cleanup_buffer_minutes: string;
  payment_hold_minutes: string;
  deposit_amount: string;
  deposit_currency: string;
  requires_manager_confirmation: boolean;
  allow_client_approximate_time: boolean;
  allow_table_combination: boolean;
};

type BrandingFormState = {
  theme_mode: string;
  theme_preset: string;
  use_custom_palette: boolean;
  accent_color: string;
  background_variant: string;
  text_color: string;
  card_background_color: string;
  card_text_color: string;
  badge_background_color: string;
  badge_text_color: string;
  cta_background_color: string;
  cta_text_color: string;
};

type BrandingFieldName = keyof BrandingFormState;

const emptyVenueForm: VenueFormState = {
  name: "",
  country: "Россия",
  city: "",
  district: "",
  address: "",
  latitude: "",
  longitude: "",
  cuisine: "",
  price_category: "middle",
  venue_theme: "family",
  short_description: "",
  description: ""
};

const emptyRuleForm: RuleFormState = {
  default_duration_minutes: "60",
  slot_step_minutes: "10",
  cleanup_buffer_minutes: "20",
  payment_hold_minutes: "30",
  deposit_amount: "0.00",
  deposit_currency: "RUB",
  requires_manager_confirmation: true,
  allow_client_approximate_time: false,
  allow_table_combination: false
};

const brandingPresetOptions = [
  { value: "northern_blue", label: "Northern blue" },
  { value: "brick_house", label: "Brick house" },
  { value: "sage_garden", label: "Sage garden" },
  { value: "night_neon", label: "Night neon" },
  { value: "coffee_sand", label: "Coffee sand" },
  { value: "berry_lounge", label: "Berry lounge" },
  { value: "forest_ember", label: "Forest ember" },
  { value: "royal_indigo", label: "Royal indigo" },
  { value: "sea_breeze", label: "Sea breeze" },
  { value: "cherry_noir", label: "Cherry noir" },
  { value: "amber_craft", label: "Amber craft" },
  { value: "mint_minimal", label: "Mint minimal" },
  { value: "steel_business", label: "Steel business" },
  { value: "sunset_orange", label: "Sunset orange" },
  { value: "lavender_soft", label: "Lavender soft" },
  { value: "graphite_gold", label: "Graphite gold" },
  { value: "cyber_purple", label: "Cyber purple" },
  { value: "nordic_frost", label: "Nordic frost" }
];

const brandingPresetPalettes: Record<string, Partial<BrandingFormState>> = {
  northern_blue: { theme_mode: "dark", background_variant: "graphite-grid", accent_color: "#2563eb", text_color: "#e5eefc", card_background_color: "#0f172a", card_text_color: "#e5eefc", badge_background_color: "#dbeafe", badge_text_color: "#1e3a8a", cta_background_color: "#2563eb", cta_text_color: "#ffffff" },
  brick_house: { theme_mode: "light", background_variant: "warm-gradient", accent_color: "#b45309", text_color: "#111827", card_background_color: "#fff7ed", card_text_color: "#7c2d12", badge_background_color: "#fed7aa", badge_text_color: "#9a3412", cta_background_color: "#c2410c", cta_text_color: "#ffffff" },
  sage_garden: { theme_mode: "light", background_variant: "pattern-soft", accent_color: "#166534", text_color: "#0f172a", card_background_color: "#f0fdf4", card_text_color: "#14532d", badge_background_color: "#dcfce7", badge_text_color: "#166534", cta_background_color: "#166534", cta_text_color: "#ffffff" },
  night_neon: { theme_mode: "dark", background_variant: "dark-soft", accent_color: "#7c3aed", text_color: "#f5f3ff", card_background_color: "#111827", card_text_color: "#f5f3ff", badge_background_color: "#312e81", badge_text_color: "#e0e7ff", cta_background_color: "#7c3aed", cta_text_color: "#ffffff" },
  coffee_sand: { theme_mode: "light", background_variant: "warm-gradient", accent_color: "#92400e", text_color: "#3f2b1c", card_background_color: "#fef3c7", card_text_color: "#78350f", badge_background_color: "#fde68a", badge_text_color: "#92400e", cta_background_color: "#92400e", cta_text_color: "#ffffff" },
  berry_lounge: { theme_mode: "dark", background_variant: "dark-soft", accent_color: "#be185d", text_color: "#fff1f2", card_background_color: "#4c0519", card_text_color: "#ffe4e6", badge_background_color: "#fecdd3", badge_text_color: "#9f1239", cta_background_color: "#be185d", cta_text_color: "#ffffff" },
  forest_ember: { theme_mode: "dark", background_variant: "pattern-soft", accent_color: "#f97316", text_color: "#f7fee7", card_background_color: "#1f2a1d", card_text_color: "#f7fee7", badge_background_color: "#dcfce7", badge_text_color: "#14532d", cta_background_color: "#ea580c", cta_text_color: "#ffffff" },
  royal_indigo: { theme_mode: "dark", background_variant: "graphite-grid", accent_color: "#a78bfa", text_color: "#eef2ff", card_background_color: "#1e1b4b", card_text_color: "#eef2ff", badge_background_color: "#e0e7ff", badge_text_color: "#3730a3", cta_background_color: "#6d28d9", cta_text_color: "#ffffff" },
  sea_breeze: { theme_mode: "light", background_variant: "cool-gradient", accent_color: "#0284c7", text_color: "#0f172a", card_background_color: "#ecfeff", card_text_color: "#164e63", badge_background_color: "#cffafe", badge_text_color: "#155e75", cta_background_color: "#0369a1", cta_text_color: "#ffffff" },
  cherry_noir: { theme_mode: "dark", background_variant: "dark-soft", accent_color: "#e11d48", text_color: "#fff1f2", card_background_color: "#2b0b12", card_text_color: "#ffe4e6", badge_background_color: "#ffe4e6", badge_text_color: "#9f1239", cta_background_color: "#be123c", cta_text_color: "#ffffff" },
  amber_craft: { theme_mode: "light", background_variant: "warm-gradient", accent_color: "#d97706", text_color: "#3f2b1c", card_background_color: "#fffbeb", card_text_color: "#78350f", badge_background_color: "#fef3c7", badge_text_color: "#92400e", cta_background_color: "#b45309", cta_text_color: "#ffffff" },
  mint_minimal: { theme_mode: "light", background_variant: "neutral-surface", accent_color: "#0f766e", text_color: "#0f172a", card_background_color: "#f0fdfa", card_text_color: "#134e4a", badge_background_color: "#ccfbf1", badge_text_color: "#115e59", cta_background_color: "#0f766e", cta_text_color: "#ffffff" },
  steel_business: { theme_mode: "light", background_variant: "neutral-surface", accent_color: "#475569", text_color: "#111827", card_background_color: "#f8fafc", card_text_color: "#1e293b", badge_background_color: "#e2e8f0", badge_text_color: "#334155", cta_background_color: "#334155", cta_text_color: "#ffffff" },
  sunset_orange: { theme_mode: "light", background_variant: "warm-gradient", accent_color: "#ea580c", text_color: "#111827", card_background_color: "#fff7ed", card_text_color: "#7c2d12", badge_background_color: "#fed7aa", badge_text_color: "#9a3412", cta_background_color: "#ea580c", cta_text_color: "#ffffff" },
  lavender_soft: { theme_mode: "light", background_variant: "soft-paper", accent_color: "#8b5cf6", text_color: "#1f2937", card_background_color: "#faf5ff", card_text_color: "#4c1d95", badge_background_color: "#ede9fe", badge_text_color: "#5b21b6", cta_background_color: "#7c3aed", cta_text_color: "#ffffff" },
  graphite_gold: { theme_mode: "dark", background_variant: "graphite-grid", accent_color: "#f59e0b", text_color: "#f8fafc", card_background_color: "#111827", card_text_color: "#f8fafc", badge_background_color: "#fef3c7", badge_text_color: "#92400e", cta_background_color: "#d97706", cta_text_color: "#111827" },
  cyber_purple: { theme_mode: "dark", background_variant: "dark-soft", accent_color: "#d946ef", text_color: "#fae8ff", card_background_color: "#2e1065", card_text_color: "#fae8ff", badge_background_color: "#f5d0fe", badge_text_color: "#86198f", cta_background_color: "#c026d3", cta_text_color: "#ffffff" },
  nordic_frost: { theme_mode: "light", background_variant: "cool-gradient", accent_color: "#0369a1", text_color: "#0f172a", card_background_color: "#f0f9ff", card_text_color: "#0c4a6e", badge_background_color: "#e0f2fe", badge_text_color: "#075985", cta_background_color: "#0369a1", cta_text_color: "#ffffff" }
};

const emptyBrandingForm: BrandingFormState = {
  theme_mode: "light",
  theme_preset: "northern_blue",
  use_custom_palette: false,
  accent_color: "#2563eb",
  background_variant: "neutral-surface",
  text_color: "#111827",
  card_background_color: "#ffffff",
  card_text_color: "#111827",
  badge_background_color: "#eef2ff",
  badge_text_color: "#312e81",
  cta_background_color: "#111827",
  cta_text_color: "#ffffff"
};

function buildHallForm(venueId: number): HallFormState {
  return {
    venue: venueId,
    name: "",
    description: "",
    capacity: "0",
    sort_order: "0",
    is_active: true
  };
}

function buildTableForm(hallId: number): TableFormState {
  return {
    hall: hallId,
    name: "",
    seats_count: "2",
    note: "",
    is_active: true,
    is_combinable: false
  };
}

function mapVenueForm(venue: Venue): VenueFormState {
  return {
    name: venue.name,
    country: venue.country ?? "Россия",
    city: venue.city,
    district: venue.district ?? "",
    address: venue.address,
    latitude: venue.latitude != null ? String(venue.latitude) : "",
    longitude: venue.longitude != null ? String(venue.longitude) : "",
    cuisine: venue.cuisine ?? "",
    price_category: venue.price_category ?? "middle",
    venue_theme: venue.venue_theme ?? "family",
    short_description: venue.short_description ?? "",
    description: venue.description ?? ""
  };
}

function mapRuleForm(rule?: VenueBookingRule): RuleFormState {
  if (!rule) {
    return emptyRuleForm;
  }

  return {
    default_duration_minutes: String(rule.default_duration_minutes),
    slot_step_minutes: String(rule.slot_step_minutes),
    cleanup_buffer_minutes: String(rule.cleanup_buffer_minutes),
    payment_hold_minutes: String(rule.payment_hold_minutes),
    deposit_amount: rule.deposit_amount,
    deposit_currency: rule.deposit_currency,
    requires_manager_confirmation: rule.requires_manager_confirmation,
    allow_client_approximate_time: rule.allow_client_approximate_time,
    allow_table_combination: rule.allow_table_combination
  };
}

function mapBrandingForm(branding?: VenueBranding): BrandingFormState {
  if (!branding) {
    return emptyBrandingForm;
  }

  return {
    theme_mode: branding.theme_mode ?? emptyBrandingForm.theme_mode,
    theme_preset: branding.theme_preset ?? emptyBrandingForm.theme_preset,
    use_custom_palette: Boolean(branding.use_custom_palette),
    accent_color: branding.accent_color ?? emptyBrandingForm.accent_color,
    background_variant: branding.background_variant ?? emptyBrandingForm.background_variant,
    text_color: branding.text_color ?? emptyBrandingForm.text_color,
    card_background_color: branding.card_background_color ?? emptyBrandingForm.card_background_color,
    card_text_color: branding.card_text_color ?? emptyBrandingForm.card_text_color,
    badge_background_color: branding.badge_background_color ?? emptyBrandingForm.badge_background_color,
    badge_text_color: branding.badge_text_color ?? emptyBrandingForm.badge_text_color,
    cta_background_color: branding.cta_background_color ?? emptyBrandingForm.cta_background_color,
    cta_text_color: branding.cta_text_color ?? emptyBrandingForm.cta_text_color
  };
}

export default function OwnerPage() {
  const [token, setToken] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [venueForm, setVenueForm] = useState<VenueFormState>(emptyVenueForm);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleForm);
  const [brandingForm, setBrandingForm] = useState<BrandingFormState>(emptyBrandingForm);
  const [newHallForm, setNewHallForm] = useState<HallFormState | null>(null);
  const [newTableForms, setNewTableForms] = useState<Record<number, TableFormState>>({});
  const [loadingVenue, setLoadingVenue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedVenueId = selectedVenue?.id ?? null;

  useEffect(() => {
    const storedToken = getStoredToken();
    setToken(storedToken);
    if (!storedToken) {
      setError("Сначала войдите как владелец. После логина токен сохранится в браузере.");
      return;
    }

    apiRequest<Venue[]>("/venues/my/", { token: storedToken })
      .then((data) => {
        setVenues(data);
        if (data.length > 0) {
          setSelectedSlug((current) => current ?? data[0].slug);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!token || !selectedSlug) {
      return;
    }

    setLoadingVenue(true);
    apiRequest<Venue>(`/venues/${selectedSlug}/`, { token })
      .then((venue) => {
        setSelectedVenue(venue);
        setVenueForm(mapVenueForm(venue));
        setRuleForm(mapRuleForm(venue.booking_rule));
        setBrandingForm(mapBrandingForm(venue.branding));
        setNewHallForm(buildHallForm(venue.id));
        const tableForms = Object.fromEntries((venue.halls ?? []).map((hall) => [hall.id, buildTableForm(hall.id)]));
        setNewTableForms(tableForms);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingVenue(false));
  }, [selectedSlug, token]);

  const groupedHallTables = useMemo(() => {
    const map = new Map<number, VenueTable[]>();
    (selectedVenue?.halls ?? []).forEach((hall) => {
      map.set(hall.id, hall.tables ?? []);
    });
    return map;
  }, [selectedVenue]);

  const brandingPreview = useMemo(() => {
    if (brandingForm.use_custom_palette) {
      return brandingForm;
    }
    return { ...brandingForm, ...(brandingPresetPalettes[brandingForm.theme_preset] ?? {}) };
  }, [brandingForm]);


  function showMessage(text: string) {
    setMessage(text);
    setError(null);
  }

  function showError(err: unknown, fallback: string) {
    setError(err instanceof Error ? err.message : fallback);
    setMessage(null);
  }

  async function refreshSelectedVenue() {
    if (!token || !selectedSlug) {
      return;
    }
    const venue = await apiRequest<Venue>(`/venues/${selectedSlug}/`, { token });
    setSelectedVenue(venue);
    setVenueForm(mapVenueForm(venue));
    setRuleForm(mapRuleForm(venue.booking_rule));
    setBrandingForm(mapBrandingForm(venue.branding));
    setNewHallForm(buildHallForm(venue.id));
    const tableForms = Object.fromEntries((venue.halls ?? []).map((hall) => [hall.id, buildTableForm(hall.id)]));
    setNewTableForms(tableForms);
  }

  async function saveVenueDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedVenue) {
      return;
    }

    setSaving(true);
    try {
      const updated = await apiRequest<Venue>(`/venues/${selectedVenue.slug}/`, {
        method: "PATCH",
        token,
        body: {
          ...venueForm,
          latitude: venueForm.latitude.trim() || null,
          longitude: venueForm.longitude.trim() || null,
        }
      });
      setSelectedVenue((current) => (current ? { ...current, ...updated } : updated));
      setVenues((current) => current.map((venue) => (venue.slug === selectedVenue.slug ? { ...venue, ...updated } : venue)));
      showMessage("Основная информация заведения сохранена.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось сохранить данные заведения.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBookingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedVenue?.booking_rule) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueBookingRule>(`/booking-rules/${selectedVenue.booking_rule.id}/`, {
        method: "PATCH",
        token,
        body: {
          venue: selectedVenue.id,
          default_duration_minutes: Number(ruleForm.default_duration_minutes),
          slot_step_minutes: Number(ruleForm.slot_step_minutes),
          cleanup_buffer_minutes: Number(ruleForm.cleanup_buffer_minutes),
          payment_hold_minutes: Number(ruleForm.payment_hold_minutes),
          deposit_amount: ruleForm.deposit_amount,
          deposit_currency: ruleForm.deposit_currency,
          requires_manager_confirmation: ruleForm.requires_manager_confirmation,
          allow_client_approximate_time: ruleForm.allow_client_approximate_time,
          allow_table_combination: ruleForm.allow_table_combination
        }
      });
      showMessage("Правила бронирования сохранены.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось сохранить правила бронирования.");
    } finally {
      setSaving(false);
    }
  }

  function updateBrandingField(name: BrandingFieldName, value: string | boolean) {
    setBrandingForm((current) => {
      if (name === "theme_preset" && typeof value === "string" && !current.use_custom_palette) {
        return { ...current, theme_preset: value, ...(brandingPresetPalettes[value] ?? {}) };
      }
      return { ...current, [name]: value };
    });
  }

  async function saveVenueBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedVenue) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueBranding>(`/venues/${selectedVenue.slug}/branding/`, {
        method: "PATCH",
        token,
        body: brandingForm
      });
      showMessage("Тема оформления заведения сохранена.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось сохранить тему оформления.");
    } finally {
      setSaving(false);
    }
  }

  async function resetBrandingToPreset() {
    if (!token || !selectedVenue) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueBranding>(`/venues/${selectedVenue.slug}/branding/`, {
        method: "PATCH",
        token,
        body: {
          ...brandingForm,
          use_custom_palette: false
        }
      });
      showMessage("Тема сброшена к выбранному пресету.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось сбросить тему к пресету.");
    } finally {
      setSaving(false);
    }
  }

  async function createHall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedVenue || !newHallForm) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueHall>("/halls/", {
        method: "POST",
        token,
        body: {
          venue: selectedVenue.id,
          name: newHallForm.name,
          description: newHallForm.description,
          capacity: Number(newHallForm.capacity),
          sort_order: Number(newHallForm.sort_order),
          is_active: newHallForm.is_active
        }
      });
      setNewHallForm(buildHallForm(selectedVenue.id));
      showMessage("Зал добавлен.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось создать зал.");
    } finally {
      setSaving(false);
    }
  }

  async function updateHall(hall: VenueHall) {
    if (!token || !selectedVenueId) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueHall>(`/halls/${hall.id}/`, {
        method: "PATCH",
        token,
        body: {
          venue: selectedVenueId,
          name: hall.name,
          description: hall.description ?? "",
          capacity: Number(hall.capacity),
          sort_order: Number(hall.sort_order),
          is_active: hall.is_active
        }
      });
      showMessage(`Зал «${hall.name}» сохранён.`);
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось обновить зал.");
    } finally {
      setSaving(false);
    }
  }

  async function removeHall(hall: VenueHall) {
    if (!token) {
      return;
    }
    if (!window.confirm(`Удалить зал «${hall.name}» вместе со столами?`)) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<void>(`/halls/${hall.id}/`, { method: "DELETE", token });
      showMessage(`Зал «${hall.name}» удалён.`);
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось удалить зал.");
    } finally {
      setSaving(false);
    }
  }

  async function createTable(event: FormEvent<HTMLFormElement>, hallId: number) {
    event.preventDefault();
    if (!token) {
      return;
    }
    const form = newTableForms[hallId];
    if (!form) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueTable>("/tables/", {
        method: "POST",
        token,
        body: {
          hall: hallId,
          name: form.name,
          seats_count: Number(form.seats_count),
          note: form.note,
          is_active: form.is_active,
          is_combinable: form.is_combinable
        }
      });
      setNewTableForms((current) => ({ ...current, [hallId]: buildTableForm(hallId) }));
      showMessage("Стол добавлен.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось создать стол.");
    } finally {
      setSaving(false);
    }
  }

  async function updateTable(table: VenueTable) {
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<VenueTable>(`/tables/${table.id}/`, {
        method: "PATCH",
        token,
        body: {
          hall: table.hall,
          name: table.name,
          seats_count: Number(table.seats_count),
          note: table.note ?? "",
          is_active: table.is_active,
          is_combinable: table.is_combinable
        }
      });
      showMessage(`Стол «${table.name}» сохранён.`);
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось обновить стол.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTable(table: VenueTable) {
    if (!token) {
      return;
    }
    if (!window.confirm(`Удалить стол «${table.name}»?`)) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest<void>(`/tables/${table.id}/`, { method: "DELETE", token });
      showMessage(`Стол «${table.name}» удалён.`);
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось удалить стол.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHallLayout(payload: LayoutSavePayload) {
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      await apiRequest(`/layouts/save-for-hall/`, {
        method: "POST",
        token,
        body: payload
      });
      showMessage("Схема зала сохранена.");
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось сохранить схему зала.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function submitForModeration() {
    if (!token || !selectedVenue) {
      return;
    }

    setSaving(true);
    try {
      const result = await apiRequest<{ detail: string; status: string }>(
        `/venues/${selectedVenue.slug}/submit_for_moderation/`,
        { method: "POST", token }
      );
      showMessage(result.detail);
      setVenues((current) =>
        current.map((venue) => (venue.slug === selectedVenue.slug ? { ...venue, status: result.status } : venue))
      );
      await refreshSelectedVenue();
    } catch (err) {
      showError(err, "Не удалось отправить заведение на модерацию.");
    } finally {
      setSaving(false);
    }
  }

  function patchSelectedVenue(updater: (venue: Venue) => Venue) {
    setSelectedVenue((current) => (current ? updater(current) : current));
  }

  function patchHall(hallId: number, updater: (hall: VenueHall) => VenueHall) {
    patchSelectedVenue((venue) => ({
      ...venue,
      halls: (venue.halls ?? []).map((hall) => (hall.id === hallId ? updater(hall) : hall))
    }));
  }

  function patchTable(hallId: number, tableId: number, updater: (table: VenueTable) => VenueTable) {
    patchHall(hallId, (hall) => ({
      ...hall,
      tables: hall.tables.map((table) => (table.id === tableId ? updater(table) : table))
    }));
  }

  return (
    <section className="stack-lg">
      <section className="card">
        <h1>Кабинет владельца</h1>
        <p>
          На этом этапе уже можно редактировать основную информацию о заведении, правила бронирования, создавать
          и менять залы со столами, а также собирать визуальную схему зала через drag-and-drop редактор.
        </p>
      </section>

      {message && <section className="card success-card">{message}</section>}
      {error && <section className="card error-card">{error}</section>}

      {!token && <section className="card">Для работы с кабинетом сначала войди под аккаунтом владельца.</section>}

      {!!token && (
        <>
          <section className="card">
            <div className="toolbar-row">
              <div>
                <h2>Выбор заведения</h2>
                <p>Сначала выбери заведение, затем можно редактировать его данные и внутреннюю структуру.</p>
              </div>
              <label className="field compact-field selector-field">
                <span>Текущее заведение</span>
                <select
                  value={selectedSlug ?? ""}
                  onChange={(event) => {
                    setSelectedSlug(event.target.value);
                    setMessage(null);
                    setError(null);
                  }}
                >
                  {venues.map((venue) => (
                    <option key={venue.slug} value={venue.slug}>
                      {venue.name} · {venue.city}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!loadingVenue && selectedVenue && (
              <div className="status-line top-gap">
                <span className="status-chip">Статус: {selectedVenue.status}</span>
                <span className="status-chip muted-chip">Публикация: {selectedVenue.is_published ? "да" : "нет"}</span>
                <button className="button button-primary" type="button" disabled={saving} onClick={submitForModeration}>
                  Отправить на модерацию
                </button>
              </div>
            )}
          </section>

          {loadingVenue && <section className="card">Загружаю структуру выбранного заведения…</section>}

          {!loadingVenue && selectedVenue && (
            <>
              <section className="grid grid-2 owner-grid-top">
                <article className="card">
                  <h2>Основная информация</h2>
                  <form className="form" onSubmit={saveVenueDetails}>
                    <div className="grid grid-2">
                      <label className="field">
                        <span>Название</span>
                        <input
                          value={venueForm.name}
                          onChange={(event) => setVenueForm((current) => ({ ...current, name: event.target.value }))}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Страна</span>
                        <input
                          value={venueForm.country}
                          onChange={(event) => setVenueForm((current) => ({ ...current, country: event.target.value }))}
                          required
                        />
                      </label>
                    </div>
                    <div className="grid grid-3">
                      <label className="field">
                        <span>Город</span>
                        <input
                          value={venueForm.city}
                          onChange={(event) => setVenueForm((current) => ({ ...current, city: event.target.value }))}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Район</span>
                        <input
                          value={venueForm.district}
                          onChange={(event) => setVenueForm((current) => ({ ...current, district: event.target.value }))}
                          placeholder="Например: Центральный"
                        />
                      </label>
                      <label className="field">
                        <span>Кухня</span>
                        <input
                          value={venueForm.cuisine}
                          onChange={(event) => setVenueForm((current) => ({ ...current, cuisine: event.target.value }))}
                          placeholder="Например: Европейская"
                        />
                      </label>
                    </div>
                    <div className="grid grid-4">
                      <label className="field">
                        <span>Ценовая категория</span>
                        <select value={venueForm.price_category} onChange={(event) => setVenueForm((current) => ({ ...current, price_category: event.target.value }))}>
                          <option value="budget">Доступно</option>
                          <option value="middle">Средний чек</option>
                          <option value="high">Выше среднего</option>
                          <option value="premium">Премиум</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Тема заведения</span>
                        <select value={venueForm.venue_theme} onChange={(event) => setVenueForm((current) => ({ ...current, venue_theme: event.target.value }))}>
                          <option value="family">Семейное</option>
                          <option value="romantic">Романтика</option>
                          <option value="business">Деловое</option>
                          <option value="geek">Гик / настолки</option>
                          <option value="panoramic">Панорамное</option>
                          <option value="ethnic">Этническое</option>
                          <option value="art">Арт-пространство</option>
                          <option value="lounge">Lounge</option>
                          <option value="live_music">Живая музыка</option>
                          <option value="fast_casual">Fast casual</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Широта</span>
                        <input
                          value={venueForm.latitude}
                          onChange={(event) => setVenueForm((current) => ({ ...current, latitude: event.target.value }))}
                          placeholder="56.324062"
                        />
                      </label>
                      <label className="field">
                        <span>Долгота</span>
                        <input
                          value={venueForm.longitude}
                          onChange={(event) => setVenueForm((current) => ({ ...current, longitude: event.target.value }))}
                          placeholder="44.005391"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Адрес</span>
                      <input
                        value={venueForm.address}
                        onChange={(event) => setVenueForm((current) => ({ ...current, address: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Краткое описание</span>
                      <input
                        value={venueForm.short_description}
                        onChange={(event) =>
                          setVenueForm((current) => ({ ...current, short_description: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Полное описание</span>
                      <textarea
                        rows={5}
                        value={venueForm.description}
                        onChange={(event) => setVenueForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>
                    <button className="button button-primary" type="submit" disabled={saving}>
                      Сохранить информацию
                    </button>
                  </form>
                </article>

                <article className="card">
                  <h2>Правила бронирования</h2>
                  <form className="form" onSubmit={saveBookingRule}>
                    <div className="grid grid-2">
                      <label className="field">
                        <span>Длительность по умолчанию, мин.</span>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={ruleForm.default_duration_minutes}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, default_duration_minutes: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Шаг слота, мин.</span>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={ruleForm.slot_step_minutes}
                          onChange={(event) => setRuleForm((current) => ({ ...current, slot_step_minutes: event.target.value }))}
                          required
                        />
                      </label>
                    </div>
                    <div className="grid grid-2">
                      <label className="field">
                        <span>Буфер уборки, мин.</span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={ruleForm.cleanup_buffer_minutes}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, cleanup_buffer_minutes: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Холд неоплаты, мин.</span>
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={ruleForm.payment_hold_minutes}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, payment_hold_minutes: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <div className="grid grid-2">
                      <label className="field">
                        <span>Предоплата</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={ruleForm.deposit_amount}
                          onChange={(event) => setRuleForm((current) => ({ ...current, deposit_amount: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Валюта</span>
                        <input
                          value={ruleForm.deposit_currency}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, deposit_currency: event.target.value.toUpperCase() }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <div className="checkbox-grid">
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={ruleForm.requires_manager_confirmation}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, requires_manager_confirmation: event.target.checked }))
                          }
                        />
                        <span>Требовать подтверждение менеджера</span>
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={ruleForm.allow_client_approximate_time}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, allow_client_approximate_time: event.target.checked }))
                          }
                        />
                        <span>Разрешить клиенту примерное время</span>
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={ruleForm.allow_table_combination}
                          onChange={(event) =>
                            setRuleForm((current) => ({ ...current, allow_table_combination: event.target.checked }))
                          }
                        />
                        <span>Разрешить объединение столов</span>
                      </label>
                    </div>
                    <button className="button button-primary" type="submit" disabled={saving}>
                      Сохранить правила
                    </button>
                  </form>
                </article>
              </section>

              <section className="card">
                <div className="section-topline">
                  <span className="section-kicker">Тема заведения</span>
                  <h2>Оформление клиентской страницы</h2>
                  <p>Выберите готовый пресет или включите ручную палитру. Backend проверяет контраст и не даст сохранить нечитаемые сочетания.</p>
                </div>

                <form className="form" onSubmit={saveVenueBranding}>
                  <div className="grid grid-3">
                    <label className="field">
                      <span>Режим темы</span>
                      <select value={brandingForm.theme_mode} onChange={(event) => updateBrandingField("theme_mode", event.target.value)}>
                        <option value="light">Светлая</option>
                        <option value="dark">Тёмная</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Готовый пресет</span>
                      <select value={brandingForm.theme_preset} onChange={(event) => updateBrandingField("theme_preset", event.target.value)}>
                        {brandingPresetOptions.map((preset) => (
                          <option key={preset.value} value={preset.value}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Фоновый шаблон</span>
                      <select value={brandingForm.background_variant} onChange={(event) => updateBrandingField("background_variant", event.target.value)}>
                        <option value="neutral-surface">Нейтральный</option>
                        <option value="warm-gradient">Тёплый градиент</option>
                        <option value="cool-gradient">Холодный градиент</option>
                        <option value="soft-paper">Мягкая бумага</option>
                        <option value="dark-soft">Тёмный мягкий</option>
                        <option value="graphite-grid">Графитовая сетка</option>
                        <option value="pattern-soft">Лёгкий паттерн</option>
                      </select>
                    </label>
                  </div>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={brandingForm.use_custom_palette}
                      onChange={(event) => updateBrandingField("use_custom_palette", event.target.checked)}
                    />
                    <span>Использовать ручную палитру вместо готового пресета</span>
                  </label>

                  <div className="theme-preview-card" style={{
                    "--preview-card-bg": brandingPreview.card_background_color,
                    "--preview-card-text": brandingPreview.card_text_color,
                    "--preview-badge-bg": brandingPreview.badge_background_color,
                    "--preview-badge-text": brandingPreview.badge_text_color,
                    "--preview-cta-bg": brandingPreview.cta_background_color,
                    "--preview-cta-text": brandingPreview.cta_text_color
                  } as CSSProperties}>
                    <span className="theme-preview-badge">Пример бейджа</span>
                    <h3>Предпросмотр карточки заведения</h3>
                    <p>Так клиент будет видеть основные блоки страницы после сохранения палитры.</p>
                    <span className="theme-preview-cta">Основная кнопка</span>
                  </div>

                  {brandingForm.use_custom_palette && (
                    <div className="grid grid-3">
                      <label className="field color-field"><span>Акцент</span><input type="color" value={brandingForm.accent_color} onChange={(event) => updateBrandingField("accent_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Основной текст</span><input type="color" value={brandingForm.text_color} onChange={(event) => updateBrandingField("text_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Фон карточек</span><input type="color" value={brandingPreview.card_background_color} onChange={(event) => updateBrandingField("card_background_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Текст карточек</span><input type="color" value={brandingPreview.card_text_color} onChange={(event) => updateBrandingField("card_text_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Фон бейджей</span><input type="color" value={brandingPreview.badge_background_color} onChange={(event) => updateBrandingField("badge_background_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Текст бейджей</span><input type="color" value={brandingPreview.badge_text_color} onChange={(event) => updateBrandingField("badge_text_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Фон CTA</span><input type="color" value={brandingPreview.cta_background_color} onChange={(event) => updateBrandingField("cta_background_color", event.target.value)} /></label>
                      <label className="field color-field"><span>Текст CTA</span><input type="color" value={brandingPreview.cta_text_color} onChange={(event) => updateBrandingField("cta_text_color", event.target.value)} /></label>
                    </div>
                  )}

                  <div className="button-row">
                    <button className="button button-primary" type="submit" disabled={saving}>Сохранить тему</button>
                    <button className="button button-secondary" type="button" disabled={saving} onClick={resetBrandingToPreset}>Откатить к пресету</button>
                  </div>
                </form>
              </section>

              <section className="card">
                <h2>Добавить зал</h2>
                {newHallForm && (
                  <form className="form" onSubmit={createHall}>
                    <div className="grid grid-3">
                      <label className="field">
                        <span>Название зала</span>
                        <input
                          value={newHallForm.name}
                          onChange={(event) => setNewHallForm((current) => (current ? { ...current, name: event.target.value } : current))}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Вместимость</span>
                        <input
                          type="number"
                          min="0"
                          value={newHallForm.capacity}
                          onChange={(event) =>
                            setNewHallForm((current) => (current ? { ...current, capacity: event.target.value } : current))
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Порядок</span>
                        <input
                          type="number"
                          min="0"
                          value={newHallForm.sort_order}
                          onChange={(event) =>
                            setNewHallForm((current) => (current ? { ...current, sort_order: event.target.value } : current))
                          }
                          required
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Описание</span>
                      <textarea
                        rows={3}
                        value={newHallForm.description}
                        onChange={(event) =>
                          setNewHallForm((current) => (current ? { ...current, description: event.target.value } : current))
                        }
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={newHallForm.is_active}
                        onChange={(event) =>
                          setNewHallForm((current) => (current ? { ...current, is_active: event.target.checked } : current))
                        }
                      />
                      <span>Зал активен</span>
                    </label>
                    <button className="button button-primary" type="submit" disabled={saving}>
                      Добавить зал
                    </button>
                  </form>
                )}
              </section>

              <section className="stack-lg">
                {(selectedVenue.halls ?? []).map((hall) => (
                  <article key={hall.id} className="card">
                    <div className="card-topline">
                      <span className="status-chip">Зал</span>
                      <span className="status-chip muted-chip">Столов: {groupedHallTables.get(hall.id)?.length ?? 0}</span>
                    </div>
                    <div className="grid grid-2 owner-grid-top">
                      <div className="stack-sm">
                        <h3>{hall.name}</h3>
                        <label className="field">
                          <span>Название</span>
                          <input
                            value={hall.name}
                            onChange={(event) =>
                              patchHall(hall.id, (current) => ({ ...current, name: event.target.value }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Описание</span>
                          <textarea
                            rows={3}
                            value={hall.description ?? ""}
                            onChange={(event) =>
                              patchHall(hall.id, (current) => ({ ...current, description: event.target.value }))
                            }
                          />
                        </label>
                        <div className="grid grid-2">
                          <label className="field">
                            <span>Вместимость</span>
                            <input
                              type="number"
                              min="0"
                              value={hall.capacity}
                              onChange={(event) =>
                                patchHall(hall.id, (current) => ({ ...current, capacity: Number(event.target.value) }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Порядок</span>
                            <input
                              type="number"
                              min="0"
                              value={hall.sort_order}
                              onChange={(event) =>
                                patchHall(hall.id, (current) => ({ ...current, sort_order: Number(event.target.value) }))
                              }
                            />
                          </label>
                        </div>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={hall.is_active}
                            onChange={(event) =>
                              patchHall(hall.id, (current) => ({ ...current, is_active: event.target.checked }))
                            }
                          />
                          <span>Зал активен</span>
                        </label>
                        <div className="button-row">
                          <button className="button button-primary" type="button" disabled={saving} onClick={() => updateHall(hall)}>
                            Сохранить зал
                          </button>
                          <button className="button button-danger" type="button" disabled={saving} onClick={() => removeHall(hall)}>
                            Удалить зал
                          </button>
                        </div>
                      </div>

                      <div className="stack-sm">
                        <h3>Столы зала</h3>
                        <div className="stack-sm">
                          {(hall.tables ?? []).map((table) => (
                            <div key={table.id} className="subcard stack-sm owner-table-card">
                              <div className="grid grid-3">
                                <label className="field">
                                  <span>Название</span>
                                  <input
                                    value={table.name}
                                    onChange={(event) =>
                                      patchTable(hall.id, table.id, (current) => ({ ...current, name: event.target.value }))
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Мест</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={table.seats_count}
                                    onChange={(event) =>
                                      patchTable(hall.id, table.id, (current) => ({
                                        ...current,
                                        seats_count: Number(event.target.value)
                                      }))
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Комментарий</span>
                                  <input
                                    value={table.note ?? ""}
                                    onChange={(event) =>
                                      patchTable(hall.id, table.id, (current) => ({ ...current, note: event.target.value }))
                                    }
                                  />
                                </label>
                              </div>
                              <div className="checkbox-grid compact-check-grid">
                                <label className="checkbox-field">
                                  <input
                                    type="checkbox"
                                    checked={table.is_active}
                                    onChange={(event) =>
                                      patchTable(hall.id, table.id, (current) => ({
                                        ...current,
                                        is_active: event.target.checked
                                      }))
                                    }
                                  />
                                  <span>Стол активен</span>
                                </label>
                                <label className="checkbox-field">
                                  <input
                                    type="checkbox"
                                    checked={table.is_combinable}
                                    onChange={(event) =>
                                      patchTable(hall.id, table.id, (current) => ({
                                        ...current,
                                        is_combinable: event.target.checked
                                      }))
                                    }
                                  />
                                  <span>Можно объединять</span>
                                </label>
                              </div>
                              <div className="button-row">
                                <button
                                  className="button button-primary"
                                  type="button"
                                  disabled={saving}
                                  onClick={() => updateTable({ ...table, hall: hall.id })}
                                >
                                  Сохранить стол
                                </button>
                                <button
                                  className="button button-danger"
                                  type="button"
                                  disabled={saving}
                                  onClick={() => removeTable(table)}
                                >
                                  Удалить стол
                                </button>
                              </div>
                            </div>
                          ))}
                          {(hall.tables ?? []).length === 0 && (
                            <div className="muted-block">Пока ни одного стола. Добавь первый стол в этом зале.</div>
                          )}
                        </div>

                        <form className="form top-gap" onSubmit={(event) => createTable(event, hall.id)}>
                          <h4>Добавить стол</h4>
                          <div className="grid grid-3">
                            <label className="field">
                              <span>Название</span>
                              <input
                                value={newTableForms[hall.id]?.name ?? ""}
                                onChange={(event) =>
                                  setNewTableForms((current) => ({
                                    ...current,
                                    [hall.id]: {
                                      ...(current[hall.id] ?? buildTableForm(hall.id)),
                                      name: event.target.value
                                    }
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="field">
                              <span>Мест</span>
                              <input
                                type="number"
                                min="1"
                                value={newTableForms[hall.id]?.seats_count ?? "2"}
                                onChange={(event) =>
                                  setNewTableForms((current) => ({
                                    ...current,
                                    [hall.id]: {
                                      ...(current[hall.id] ?? buildTableForm(hall.id)),
                                      seats_count: event.target.value
                                    }
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="field">
                              <span>Комментарий</span>
                              <input
                                value={newTableForms[hall.id]?.note ?? ""}
                                onChange={(event) =>
                                  setNewTableForms((current) => ({
                                    ...current,
                                    [hall.id]: {
                                      ...(current[hall.id] ?? buildTableForm(hall.id)),
                                      note: event.target.value
                                    }
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <div className="checkbox-grid compact-check-grid">
                            <label className="checkbox-field">
                              <input
                                type="checkbox"
                                checked={newTableForms[hall.id]?.is_active ?? true}
                                onChange={(event) =>
                                  setNewTableForms((current) => ({
                                    ...current,
                                    [hall.id]: {
                                      ...(current[hall.id] ?? buildTableForm(hall.id)),
                                      is_active: event.target.checked
                                    }
                                  }))
                                }
                              />
                              <span>Стол активен</span>
                            </label>
                            <label className="checkbox-field">
                              <input
                                type="checkbox"
                                checked={newTableForms[hall.id]?.is_combinable ?? false}
                                onChange={(event) =>
                                  setNewTableForms((current) => ({
                                    ...current,
                                    [hall.id]: {
                                      ...(current[hall.id] ?? buildTableForm(hall.id)),
                                      is_combinable: event.target.checked
                                    }
                                  }))
                                }
                              />
                              <span>Можно объединять</span>
                            </label>
                          </div>
                          <button className="button button-secondary" type="submit" disabled={saving}>
                            Добавить стол
                          </button>
                        </form>
                      </div>
                    </div>

                    <div className="top-gap">
                      <LayoutEditor hall={hall} saving={saving} onSave={saveHallLayout} />
                    </div>
                  </article>
                ))}

                {(selectedVenue.halls ?? []).length === 0 && (
                  <section className="card">У заведения пока нет залов. Добавь первый зал выше.</section>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
