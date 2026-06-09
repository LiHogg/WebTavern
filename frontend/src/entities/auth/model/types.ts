export type User = {
  id: number;
  email: string;
  phone: string;
  city?: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  date_of_birth: string;
  role: string;
  account_type: string;
  available_modes?: string[];
  owned_venues_count?: number;
  managed_venues_count?: number;
};

export type AuthResponse = {
  token: string;
  user: User;
};
