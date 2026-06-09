export type LayoutItem = {
  table: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type LayoutDecorItem = {
  id: number;
  item_type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type TableLayout = {
  id: number;
  hall: number;
  canvas_width: number;
  canvas_height: number;
  is_active: boolean;
  items: LayoutItem[];
  decor_items?: LayoutDecorItem[];
};

export type TableOccupancy = {
  state: "free" | "occupied" | "held_by_you";
  label: string;
  mode: "now" | "interval";
  status?: string | null;
  guests_count?: number | null;
  booking_start?: string | null;
  booking_end?: string | null;
  hold_expires_at?: string | null;
};

export type VenueTable = {
  id: number;
  hall: number;
  name: string;
  seats_count: number;
  is_active: boolean;
  is_combinable: boolean;
  note?: string;
  layout_item?: LayoutItem;
  occupancy?: TableOccupancy;
};

export type VenueHall = {
  id: number;
  venue?: number;
  name: string;
  description?: string;
  capacity: number;
  is_active: boolean;
  sort_order: number;
  tables: VenueTable[];
  layout?: TableLayout | null;
};

export type VenueBookingRule = {
  id: number;
  venue: number;
  default_duration_minutes: number;
  slot_step_minutes: number;
  cleanup_buffer_minutes: number;
  payment_hold_minutes: number;
  min_booking_notice_minutes?: number;
  free_cancellation_before_minutes?: number;
  no_show_after_minutes?: number;
  requires_manager_confirmation: boolean;
  allow_client_approximate_time: boolean;
  allow_table_combination: boolean;
  allow_shared_seating?: boolean;
  allow_manager_reschedule?: boolean;
  deposit_amount: string;
  deposit_currency: string;
};

export type VenueBranding = {
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
  contrast_warning: boolean;
};

export type Venue = {
  id: number;
  name: string;
  slug: string;
  country?: string;
  city: string;
  district?: string;
  address: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  cuisine?: string;
  price_category?: string;
  venue_theme?: string;
  short_description?: string;
  description?: string;
  average_rating: number;
  review_count?: number;
  status?: string;
  is_published?: boolean;
  distance_km?: number | null;
  halls?: VenueHall[];
  booking_rule?: VenueBookingRule;
  branding?: VenueBranding;
};
