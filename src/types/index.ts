// ============================================================
// NexusBits Type Definitions
// ============================================================

// --- Auth ---
export interface RegisterBody {
  email: string;
  password: string;
  display_name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

// --- Profile ---
export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  level: string;
  balance: number;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileBody {
  display_name?: string;
  avatar_url?: string;
}

// --- Category ---
export interface Category {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
}

// --- Product ---
export interface Product {
  id: number;
  name: string;
  description: string | null;
  long_description: string | null;
  price: number;
  currency: string;
  category_id: number;
  tag: string | null;
  image_url: string | null;
  thumbnail_urls: string[] | null;
  file_format: string | null;
  file_size: string | null;
  asset_type: string | null;
  polygon_count: string | null;
  license_type: string;
  update_policy: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: Category;
}

// --- Cart ---
export interface CartItem {
  id: number;
  user_id: string;
  product_id: number;
  quantity: number;
  created_at: string;
  // Joined
  product?: Product;
}

export interface AddToCartBody {
  product_id: number;
}

// --- Order ---
export interface Order {
  id: number;
  order_no: string;
  user_id: string;
  total_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
}

export interface DirectBuyBody {
  product_id: number;
}

// --- Recharge ---
export interface RechargeBody {
  amount: number;
}

// --- API Response ---
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// --- Hono Context Variables ---
export type Variables = {
  userId: string;
  accessToken: string;
};
