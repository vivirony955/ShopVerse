// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

// ─── Auth ─────────────────────────────────────────────────────────────────────
export type UserRole = "USER" | "ADMIN" | "CS_AGENT" | "OPS" | "FINANCE" | "MERCH" | "SUPER_ADMIN";

export interface AuthUser {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
}

// ─── Category ─────────────────────────────────────────────────────────────────
export interface Category {
  id: number;
  name: string;
  slug: string;
  parentId?: number;
  parent?: Category;
  children?: Category[];
}

// ─── Brand ────────────────────────────────────────────────────────────────────
export interface Brand {
  id: number;
  name: string;
  slug: string;
  logoUrl?: string;
}

// ─── Product ──────────────────────────────────────────────────────────────────
export interface Variant {
  id: number;
  productId: number;
  size: string;
  color: string;
  stock: number;
  sku: string;
  soldCount?: number;
  backorderAllowed?: boolean;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  brandId: number;
  brand: Brand;
  categoryId: number;
  category: Category;
  basePrice: number;
  discountPct: number;
  images: string[];
  tags: string[];
  variants: Variant[];
  reviews?: Review[];
  isActive: boolean;
  // F1-07: structured specs (key-value pairs)
  specifications?: Record<string, string> | null;
  // F1-10: product video URLs
  videos?: string[];
  // PDP-only aggregates — populated by GET /products/:id, optional
  // on list responses.
  avgRating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductsResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
export interface CartItem {
  id: number;
  cartId: number;
  variantId: number;
  quantity: number;
  variant: Variant & {
    product: Pick<Product, "id" | "name" | "images" | "basePrice" | "discountPct" | "slug">;
  };
}

export interface Cart {
  id: number;
  userId: number;
  items: CartItem[];
  updatedAt: string;
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────
export interface WishlistItem {
  id: number;
  userId: number;
  productId: number;
  product: Product;
  createdAt: string;
}

// ─── Address ──────────────────────────────────────────────────────────────────
export interface Address {
  id: number;
  userId: number;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

// ─── Order ────────────────────────────────────────────────────────────────────
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "REFUNDED";

export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED";

export interface OrderItem {
  id: number;
  orderId: number;
  variantId: number;
  quantity: number;
  price: number;
  variant: Variant & {
    product: Pick<Product, "id" | "name" | "images" | "slug">;
  };
}

export interface Order {
  id: number;
  userId: number;
  guestEmail?: string;
  items: OrderItem[];
  addressSnapshot: Address;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  walletAmountUsed: number;
  total: number;
  couponCode?: string;
  status: OrderStatus;
  paymentMethod?: string;
  paymentId?: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  invoice?: Invoice | null;
  user?: { firstName?: string; lastName?: string; email?: string } | null;
  trackingEvents?: Array<{
    id: number;
    orderId: number;
    status: string;
    note?: string;
    createdAt: string;
  }>;
  shipments?: Array<{
    id: number;
    status: string;
    trackingCode?: string;
    warehouseId: number;
  }>;
}

// ─── Invoice ──────────────────────────────────────────────────────────────────
export interface Invoice {
  id: number;
  orderId: number;
  invoiceNumber: string; // "INV/2026-27/000001"
  financialYear: string;
  sequence: number;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  total: number;
  issuedAt: string;
}

// ─── Refund Approval (maker-checker) ──────────────────────────────────────────
export type RefundApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";

export interface RefundApproval {
  id: number;
  orderId: number;
  amount: number;
  reason: string;
  requestedBy: number;
  requestedAt: string;
  approvedBy?: number | null;
  approvedAt?: string | null;
  rejectedBy?: number | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  status: RefundApprovalStatus;
  refundRequestId?: number | null;
}

// ─── Review ───────────────────────────────────────────────────────────────────
export interface Review {
  id: number;
  userId: number;
  productId: number;
  rating: number;
  title?: string;
  body?: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
  user: { id: number; firstName?: string; lastName?: string };
}

// PDP-level aggregate fields. Server adds these on the
// `GET /products/:id` endpoint but they don't make sense in every
// list response, so they live as a separate interface that pages can
// intersect with Product as needed.
export interface ProductAggregateFields {
  avgRating?: number;
  reviewCount?: number;
}

// ─── F2-13: Delivery rating ──────────────────────────────────────────────────
export interface DeliveryRating {
  id: number;
  orderId: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

// ─── Admin-side records (audit / errors / fraud) ─────────────────────────────
// Minimal shapes — fields are what the admin UI reads. Server rows
// may have more; nothing else needs to be typed yet.
export interface AdminAuditLog {
  id: number;
  action: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string | number;
  // Optional fields the audit UI renders when the server populated them.
  admin?: { email?: string; firstName?: string; lastName?: string } | null;
  method?: string;
  entity?: string;
  entityId?: string | number;
  ip?: string;
  createdAt: string;
}

export interface AdminErrorLog {
  id: number;
  level: string;
  message: string;
  context?: string | null;
  // Optional request/runtime metadata the server may attach.
  method?: string;
  url?: string;
  stack?: string | null;
  resolved?: boolean;
  statusCode?: number;
  createdAt: string;
}

// ─── Admin Warehouse / Inventory ─────────────────────────────────────────────
// Row shape returned by GET /warehouse (list view).
export interface WarehouseSummary {
  id: number;
  name: string;
  city: string;
  pincode: string;
  address: string | null;
  isActive: boolean;
  _count?: { inventory: number };
}

export interface WarehouseInventoryRow {
  id: number;
  stock: number;
  reserved: number;
  variant?: {
    sku?: string;
    product?: { name?: string };
  };
}

export interface WarehouseDetail {
  id: number;
  name: string;
  inventory: WarehouseInventoryRow[];
}

// ─── F3-10: Blog ─────────────────────────────────────────────────────────────
export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt?: string;
  body?: string;
  content?: string;
  coverImage?: string;
  tags: string[];
  publishedAt?: string | null;
  author?: { firstName?: string; lastName?: string };
}

// ─── F2-06: Notification ─────────────────────────────────────────────────────
export interface Notification {
  id: number;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface FraudFlag {
  id: number;
  userId?: number;
  orderId?: number;
  reason: string;
  riskScore?: number;
  resolved: boolean;
  // Optional flag-classification metadata.
  flagType?: string;
  type?: string;
  description?: string;
  ip?: string;
  createdAt: string;
}

// Recent-orders snippet rendered by /admin/finance.
export interface AdminRecentOrder {
  id: number;
  total: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  createdAt: string;
  user?: { email?: string; firstName?: string };
}

export interface FinanceDashboard {
  totalRevenue?: number;
  totalOrders?: number;
  recentOrders?: AdminRecentOrder[];
}

// ─── F4-08: Volume discount ──────────────────────────────────────────────────
export interface VolumeDiscount {
  id: number;
  productId: number;
  minQty: number;
  discountPct: number;
}

// ─── F3-12: Price history (already inline-typed in api.ts) ───────────────────
export interface PriceHistoryEntry {
  price: number;
  discountPct: number;
  recordedAt: string;
}

// ─── F2-14: Q&A ──────────────────────────────────────────────────────────────
export interface QaQuestion {
  id: number;
  productId: number;
  userId: number;
  question: string;
  answer?: string | null;
  answeredAt?: string | null;
  createdAt: string;
  user?: { id: number; firstName?: string; lastName?: string };
}

// ─── Coupon ───────────────────────────────────────────────────────────────────
export interface CouponValidation {
  valid: boolean;
  discount: number;
  coupon: {
    code: string;
    discountType: "PERCENTAGE" | "FIXED";
    discountValue: number;
  };
}

// ─── Filters ──────────────────────────────────────────────────────────────────
export interface ProductFilters {
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  color?: string;
  tags?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

// ─── Flash Sale ───────────────────────────────────────────────────────────────
export interface FlashSale {
  id: number;
  title: string;
  slug: string;
  discountPct: number;
  startsAt: string;
  endsAt: string;
  status: "SCHEDULED" | "ACTIVE" | "ENDED";
  products: { product: Product; perUserMaxQty: number }[];
}

// ─── Wallet ───────────────────────────────────────────────────────────────────
export interface WalletTransaction {
  id: number;
  amount: number;
  type: "CREDIT" | "DEBIT" | "REFUND" | "BONUS";
  reference?: string;
  description?: string;
  balanceAfter: number;
  createdAt: string;
}

export interface Wallet {
  id: number;
  userId: number;
  balance: number;
  transactions: WalletTransaction[];
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export interface LoyaltyTransaction {
  id: number;
  points: number;
  type: string;
  note?: string;
  createdAt: string;
}

export interface LoyaltyTier {
  id: number;
  name: string;             // BRONZE / SILVER / GOLD / PLATINUM (server-side enum)
  minPoints: number;        // ≥ this many lifetime points qualifies
  earnMultiplier: number;   // earn-rate multiplier (e.g. 1.5 = 1.5× points)
  perks?: string[];         // human-readable benefit list
}

// ─── Delivery Slot ────────────────────────────────────────────────────────────
export interface DeliverySlot {
  id: number;
  date: string;
  slotLabel: string;
  maxOrders: number;
  bookedCount: number;
  pincode?: string;
  isActive: boolean;
}

// ─── Support Ticket ───────────────────────────────────────────────────────────
export interface SupportTicket {
  id: number;
  subject: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  createdAt: string;
  updatedAt: string;
  notes: { id: number; body: string; isInternal: boolean; createdAt: string }[];
}

// ─── Admin Stats ──────────────────────────────────────────────────────────────
export interface AdminStats {
  totalOrders: number;
  totalRevenue: number;
  totalUsers: number;
  totalProducts: number;
  recentOrders: Order[];
  lowStockCount: number;
}
