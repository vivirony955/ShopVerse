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
