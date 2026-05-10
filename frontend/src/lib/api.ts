// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import axios from "axios";
import { getSession } from "next-auth/react";
import type {
  Product, ProductsResponse, ProductFilters,
  Cart, WishlistItem, Address, Order,
  Review, CouponValidation, Category, Brand, AuthUser,
  FlashSale, Wallet, DeliverySlot, SupportTicket, AdminStats,
  LoyaltyTransaction, Invoice, RefundApproval,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

// ─── Axios instance ────────────────────────────────────────────────────────────
export const http = axios.create({ baseURL: BASE });

// Inject Bearer token from NextAuth session on every request
http.interceptors.request.use(async (config) => {
  const session = await getSession();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; password: string; firstName?: string; lastName?: string }) =>
    http.post("/auth/register", data).then((r) => r.data),
};

// ─── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  me: (): Promise<AuthUser> => http.get("/users/me").then((r) => r.data),
  updateProfile: (data: { firstName?: string; lastName?: string; phone?: string }) =>
    http.patch("/users/me", data).then((r) => r.data),
  getAddresses: (): Promise<Address[]> => http.get("/users/me/addresses").then((r) => r.data),
  addAddress: (data: Omit<Address, "id" | "userId">) =>
    http.post("/users/me/addresses", data).then((r) => r.data),
  updateAddress: (id: number, data: Partial<Address>) =>
    http.patch(`/users/me/addresses/${id}`, data).then((r) => r.data),
  deleteAddress: (id: number) => http.delete(`/users/me/addresses/${id}`).then((r) => r.data),
  setDefaultAddress: (id: number) =>
    http.patch(`/users/me/addresses/${id}/default`).then((r) => r.data),
};

// ─── Categories ────────────────────────────────────────────────────────────────
export const categoriesApi = {
  getAll: (): Promise<Category[]> => http.get("/categories").then((r) => r.data),
  getOne: (id: number): Promise<Category> => http.get(`/categories/${id}`).then((r) => r.data),
};

// ─── Brands ────────────────────────────────────────────────────────────────────
export const brandsApi = {
  getAll: (): Promise<Brand[]> => http.get("/brands").then((r) => r.data),
};

// ─── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  getAll: (filters: ProductFilters = {}): Promise<ProductsResponse> => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")
    );
    return http.get("/products", { params }).then((r) => r.data);
  },
  getOne: (id: number): Promise<Product> => http.get(`/products/${id}`).then((r) => r.data),
  autocomplete: (q: string): Promise<{ id: number; name: string }[]> =>
    http.get("/products/autocomplete", { params: { q } }).then((r) => r.data),
  getRelated: (id: number, limit = 8): Promise<Product[]> =>
    http.get(`/products/${id}/related`, { params: { limit } }).then((r) => r.data),
  getFrequentlyBoughtTogether: (id: number, limit = 4): Promise<Product[]> =>
    http.get(`/products/${id}/frequently-bought-together`, { params: { limit } }).then((r) => r.data),
  getUpsells: (id: number, limit = 4): Promise<Product[]> =>
    http.get(`/products/${id}/upsells`, { params: { limit } }).then((r) => r.data),
  getSizeChart: (categoryId: number) =>
    http.get(`/products/size-chart/${categoryId}`).then((r) => r.data),
};

// ─── Cart ──────────────────────────────────────────────────────────────────────
export const cartApi = {
  get: (): Promise<Cart> => http.get("/cart").then((r) => r.data),
  reserve: (): Promise<{ reservationId: number; expiresAt: string }> =>
    http.post("/cart/reserve").then((r) => r.data),
  addItem: (variantId: number, quantity: number) =>
    http.post("/cart/items", { variantId, quantity }).then((r) => r.data),
  updateItem: (itemId: number, quantity: number) =>
    http.patch(`/cart/items/${itemId}`, { quantity }).then((r) => r.data),
  removeItem: (itemId: number) => http.delete(`/cart/items/${itemId}`).then((r) => r.data),
  clear: () => http.delete("/cart").then((r) => r.data),
};

// ─── Wishlist ──────────────────────────────────────────────────────────────────
export const wishlistApi = {
  get: (): Promise<WishlistItem[]> => http.get("/wishlist").then((r) => r.data),
  add: (productId: number) => http.post(`/wishlist/${productId}`).then((r) => r.data),
  remove: (productId: number) => http.delete(`/wishlist/${productId}`).then((r) => r.data),
};

// ─── Coupons ───────────────────────────────────────────────────────────────────
export const couponsApi = {
  validate: (code: string, orderAmount: number): Promise<CouponValidation> =>
    http.post("/coupons/validate", { code, orderAmount }).then((r) => r.data),
};

// ─── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  place: (data: { addressId: number; reservationId?: number; couponCode?: string; paymentMethod?: string; walletAmountUsed?: number; shippingFee?: number; taxRate?: number }): Promise<Order> =>
    http.post("/orders", data).then((r) => r.data),
  placeGuest: (data: {
    email: string;
    address: { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
    items: { variantId: number; quantity: number }[];
    couponCode?: string;
  }): Promise<Order> => http.post("/orders/guest", data).then((r) => r.data),
  getAll: (): Promise<Order[]> => http.get("/orders").then((r) => r.data),
  getOne: (id: number): Promise<Order> => http.get(`/orders/${id}`).then((r) => r.data),
  cancel: (id: number) => http.patch(`/orders/${id}/cancel`).then((r) => r.data),
  requestReturn: (id: number) => http.patch(`/orders/${id}/return`).then((r) => r.data),
};

// ─── Reviews ───────────────────────────────────────────────────────────────────
export const reviewsApi = {
  getForProduct: (productId: number, page = 1, limit = 10) =>
    http.get(`/reviews/product/${productId}`, { params: { page, limit } }).then((r) => r.data) as Promise<{
      reviews: Review[];
      total: number;
      avgRating: number;
      page: number;
      limit: number;
    }>,
  create: (productId: number, data: { rating: number; title?: string; body?: string }) =>
    http.post(`/reviews/product/${productId}`, data).then((r) => r.data),
  update: (reviewId: number, data: { rating?: number; title?: string; body?: string }) =>
    http.patch(`/reviews/${reviewId}`, data).then((r) => r.data),
  delete: (reviewId: number) => http.delete(`/reviews/${reviewId}`).then((r) => r.data),
  // F1-09: vote helpful/not helpful; passing same value twice toggles it off
  vote: (reviewId: number, isHelpful: boolean) =>
    http.post(`/reviews/${reviewId}/vote`, { isHelpful }).then((r) => r.data),
};

// ─── Flash Sales ───────────────────────────────────────────────────────────────
export const flashSalesApi = {
  /** Public: active + scheduled flash sales for the storefront. */
  getAll: (): Promise<FlashSale[]> => http.get("/flash-sales/active").then((r) => r.data),
  getOne: (slug: string): Promise<FlashSale> =>
    http.get(`/flash-sales/${slug}`).then((r) => r.data),
  /** Admin only: all flash sales (any status). */
  adminGetAll: (): Promise<FlashSale[]> => http.get("/flash-sales").then((r) => r.data),
};

// ─── Wallet ────────────────────────────────────────────────────────────────────
export const walletApi = {
  get: (): Promise<Wallet> => http.get("/wallet/me").then((r) => r.data),
  getTransactions: () => http.get("/wallet/me/transactions").then((r) => r.data),
};

// ─── Delivery Slots ────────────────────────────────────────────────────────────
export const deliverySlotsApi = {
  getAvailable: (date: string): Promise<DeliverySlot[]> =>
    http.get("/experience/slots", { params: { date } }).then((r) => r.data),
  book: (slotId: number): Promise<DeliverySlot> =>
    http.post(`/experience/slots/${slotId}/book`).then((r) => r.data),
};

// ─── Support ───────────────────────────────────────────────────────────────────
export const supportApi = {
  getTickets: (): Promise<SupportTicket[]> => http.get("/support/tickets/my").then((r) => r.data),
  getOne: (id: number): Promise<SupportTicket> =>
    http.get(`/support/tickets/${id}`).then((r) => r.data),
  create: (data: { subject: string; description: string; priority?: string }) =>
    http.post("/support/tickets", data).then((r) => r.data),
  addNote: (ticketId: number, body: string) =>
    http.post(`/support/tickets/${ticketId}/notes`, { body }).then((r) => r.data),
};

// ─── Experience ────────────────────────────────────────────────────────────────
export const experienceApi = {
  getSavedForLater: () => http.get("/experience/saved").then((r) => r.data),
  saveForLater: (variantId: number) =>
    http.post("/experience/saved", { variantId }).then((r) => r.data),
  removeSavedForLater: (variantId: number) =>
    http.delete(`/experience/saved/${variantId}`).then((r) => r.data),
  moveToCart: (variantId: number) =>
    http.post(`/experience/saved/${variantId}/move-to-cart`).then((r) => r.data),
  recentlyPurchased: () =>
    http.get("/experience/recently-purchased").then((r) => r.data),
  addGiftOption: (data: { orderId: number; message?: string; wrapStyle?: string }) =>
    http.post("/experience/gift", data).then((r) => r.data),
  getGiftOption: (orderId: number) =>
    http.get(`/experience/gift/${orderId}`).then((r) => r.data),
};

// ─── Admin Coupons ─────────────────────────────────────────────────────────────
export const adminCouponsApi = {
  getAll: () => http.get("/coupons").then((r) => r.data),
  create: (data: { code: string; discountType: "PERCENTAGE" | "FIXED"; discountValue: number; minOrderAmount?: number; maxUses?: number; expiresAt?: string }) =>
    http.post("/coupons", data).then((r) => r.data),
  update: (id: number, data: Partial<{ code: string; discountType: string; discountValue: number; minOrderAmount: number; maxUses: number; expiresAt: string; isActive: boolean }>) =>
    http.patch(`/coupons/${id}`, data).then((r) => r.data),
  delete: (id: number) => http.delete(`/coupons/${id}`).then((r) => r.data),
};

// ─── Admin Flash Sales ──────────────────────────────────────────────────────
export const adminFlashSalesApi = {
  getAll: () => http.get("/flash-sales").then((r) => r.data),
  create: (data: { title: string; slug: string; discountPct: number; startsAt: string; endsAt: string }) =>
    http.post("/flash-sales", data).then((r) => r.data),
  update: (id: number, data: Partial<{ title: string; discountPct: number; startsAt: string; endsAt: string }>) =>
    http.patch(`/flash-sales/${id}`, data).then((r) => r.data),
  delete: (id: number) => http.delete(`/flash-sales/${id}`).then((r) => r.data),
  addProduct: (id: number, productId: number) =>
    http.post(`/flash-sales/${id}/products`, { productId }).then((r) => r.data),
  removeProduct: (id: number, productId: number) =>
    http.delete(`/flash-sales/${id}/products/${productId}`).then((r) => r.data),
};

// ─── Admin Categories ───────────────────────────────────────────────────────
export const adminCategoriesApi = {
  getAll: () => http.get("/categories").then((r) => r.data),
  create: (data: { name: string; slug: string; description?: string; imageUrl?: string }) =>
    http.post("/categories", data).then((r) => r.data),
  update: (id: number, data: Partial<{ name: string; slug: string; description: string; imageUrl: string }>) =>
    http.patch(`/categories/${id}`, data).then((r) => r.data),
  delete: (id: number) => http.delete(`/categories/${id}`).then((r) => r.data),
};

// ─── Admin Warehouses & Inventory ──────────────────────────────────────────
export const adminWarehouseApi = {
  list: () => http.get("/warehouse").then((r) => r.data),
  get: (id: number) => http.get(`/warehouse/${id}`).then((r) => r.data),
  create: (data: { name: string; city: string; pincode: string; address?: string }) =>
    http.post("/warehouse", data).then((r) => r.data),
  updateInventory: (data: { warehouseId: number; variantId: number; stock: number; reorderPoint?: number }) =>
    http.post("/warehouse/inventory", data).then((r) => r.data),
};

// ─── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  getStats: (): Promise<AdminStats> => http.get("/admin/dashboard").then((r) => r.data),
  // Products — uses the products controller (Role.ADMIN guarded)
  getProducts: (params?: Record<string, unknown>) =>
    http.get("/products", { params }).then((r) => r.data),
  createProduct: (data: Record<string, unknown>) =>
    http.post("/products", data).then((r) => r.data),
  updateProduct: (id: number, data: Record<string, unknown>) =>
    http.patch(`/products/${id}`, data).then((r) => r.data),
  deleteProduct: (id: number) =>
    http.delete(`/products/${id}`).then((r) => r.data),
  // Orders — admin controller
  getOrders: (params?: Record<string, unknown>) =>
    http.get("/admin/orders", { params }).then((r) => r.data),
  updateOrderStatus: (id: number, status: string) =>
    http.patch(`/admin/orders/${id}/status`, { status }).then((r) => r.data),
  // Users — admin controller
  getUsers: (params?: Record<string, unknown>) =>
    http.get("/admin/users", { params }).then((r) => r.data),
  // Dashboards
  getFinanceDashboard: () => http.get("/admin/finance-dashboard").then((r) => r.data),
  getOpsDashboard: () => http.get("/admin/ops-dashboard").then((r) => r.data),
  getLiveMetrics: () => http.get("/admin/live-metrics").then((r) => r.data),
  getCustomerAnalytics: () => http.get("/admin/customer-analytics").then((r) => r.data),
  // Errors & audit
  getErrors: (limit = 100, level?: string) =>
    http.get("/admin/errors", { params: { limit, level } }).then((r) => r.data),
  getAuditLogs: (params?: Record<string, unknown>) =>
    http.get("/admin/audit-logs", { params }).then((r) => r.data),
  getFunnelAnalytics: (days = 7) =>
    http.get("/admin/funnel", { params: { days } }).then((r) => r.data),
  getFraudFlags: () => http.get("/fraud/flags").then((r) => r.data),
  // Inventory
  getLowStock: (threshold = 10) =>
    http.get("/admin/low-stock", { params: { threshold } }).then((r) => r.data),
  getOutOfStock: () => http.get("/admin/out-of-stock").then((r) => r.data),
  getRevenueReport: (days = 30) =>
    http.get("/admin/revenue-report", { params: { days } }).then((r) => r.data),
  // Refund approvals (maker-checker)
  getPendingRefundApprovals: (): Promise<RefundApproval[]> =>
    http.get("/admin/refund-approvals/pending").then((r) => r.data),
  requestRefundApproval: (data: { orderId: number; amount: number; reason: string }) =>
    http.post("/admin/refund-approvals", data).then((r) => r.data) as Promise<RefundApproval>,
  approveRefundRequest: (id: number) =>
    http.patch(`/admin/refund-approvals/${id}/approve`).then((r) => r.data) as Promise<RefundApproval>,
  rejectRefundRequest: (id: number, rejectedReason: string) =>
    http.patch(`/admin/refund-approvals/${id}/reject`, { rejectedReason }).then((r) => r.data) as Promise<RefundApproval>,
  // F1-20: Bulk product upload
  bulkUploadProducts: (formData: FormData) =>
    http.post("/products/bulk-upload", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data) as Promise<{ created: number; updated: number; errors: string[] }>,
  // Impersonation (SUPER_ADMIN only)
  impersonateUser: (userId: number) =>
    http.post(`/admin/impersonate/${userId}`).then((r) => r.data) as Promise<{ accessToken: string; userId: number }>,
  getImpersonatableUsers: (search?: string) =>
    http.get("/admin/users", { params: { search, limit: 20 } }).then((r) => r.data),
};

// ─── Loyalty ───────────────────────────────────────────────────────────────────
export const loyaltyApi = {
  getBalance: () => http.get("/loyalty/balance").then((r) => r.data),
  getHistory: (): Promise<LoyaltyTransaction[]> => http.get("/loyalty/history").then((r) => r.data),
  // NOTE: /loyalty/redeem is not yet implemented in the backend (Phase 2).
  // This call will return 404 until the backend adds the endpoint.
  redeem: (points: number) => http.post("/loyalty/redeem", { points }).then((r) => r.data),
};

// ─── Referral ──────────────────────────────────────────────────────────────────
export const referralApi = {
  getMyCode: () => http.get("/referral/my-code").then((r) => r.data),
  apply: (code: string) => http.post("/referral/apply", { code }).then((r) => r.data),
};

// ─── Analytics (PostHog proxy) ─────────────────────────────────────────────────
export const analyticsApi = {
  track: (event: string, properties?: Record<string, unknown>) => {
    if (typeof window !== "undefined" && (window as any).posthog) {
      (window as any).posthog.capture(event, properties);
    }
  },
};

// ─── FAQs ──────────────────────────────────────────────────────────────────────
export const faqsApi = {
  getForProduct: (productId: number) =>
    http.get(`/products/${productId}/faqs`).then((r) => r.data),
};

// ─── Payments ──────────────────────────────────────────────────────────────────
export const paymentsApi = {
  createIntent: (orderId: number) =>
    http.post("/payments/create-intent", { orderId }).then((r) => r.data) as Promise<{ clientSecret: string; amount: number }>,
  retry: (orderId: number) =>
    http.post(`/payments/retry/${orderId}`).then((r) => r.data) as Promise<{ clientSecret: string; amount: number }>,
  refund: (orderId: number) =>
    http.post(`/payments/refund/${orderId}`).then((r) => r.data) as Promise<{ refundId: string; status: string }>,
};

// ─── Invoices ──────────────────────────────────────────────────────────────────
export const invoicesApi = {
  /** Returns invoice metadata for an order. */
  getForOrder: (orderId: number): Promise<Invoice> =>
    http.get(`/invoices/${orderId}`).then((r) => r.data),
  /** Triggers browser PDF download for an order's invoice. */
  downloadPdf: (orderId: number): void => {
    const token = (http.defaults.headers.common["Authorization"] as string | undefined) ?? "";
    const url = `${BASE}/invoices/${orderId}`;
    // Create a hidden anchor with auth header via fetch + blob
    fetch(url, { headers: { Authorization: token } })
      .then((res) => res.blob())
      .then((blob) => {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `invoice-${orderId}.pdf`;
        a.click();
        URL.revokeObjectURL(objUrl);
      });
  },
};

// ─── F2-06: Notifications ─────────────────────────────────────────────────────
export const notificationsApi = {
  getAll: () => http.get("/notifications").then((r) => r.data),
  getUnreadCount: (): Promise<{ count: number }> => http.get("/notifications/unread-count").then((r) => r.data),
  markRead: (id: number) => http.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => http.patch("/notifications/read-all").then((r) => r.data),
  delete: (id: number) => http.delete(`/notifications/${id}`).then((r) => r.data),
};

// ─── F1-04: Recently Viewed ───────────────────────────────────────────────────
export const recentlyViewedApi = {
  track: (productId: number) => http.post(`/experience/recently-viewed/${productId}`).then((r) => r.data),
  get: () => http.get("/experience/recently-viewed").then((r) => r.data),
};

// ─── F2-11: Trending Searches ─────────────────────────────────────────────────
export const trendingApi = {
  getTrending: (limit?: number) => http.get(`/products/trending-searches${limit ? `?limit=${limit}` : ""}`).then((r) => r.data) as Promise<{ query: string; count: number }[]>,
};

// ─── F2-12: Exchange ──────────────────────────────────────────────────────────
export const exchangeApi = {
  request: (dto: { orderId: number; orderItemId: number; requestedVariantId: number; reason: string }) =>
    http.post("/exchange", dto).then((r) => r.data),
  getForOrder: (orderId: number) => http.get(`/exchange/order/${orderId}`).then((r) => r.data),
};

// ─── F2-13: Delivery Rating ───────────────────────────────────────────────────
export const deliveryRatingApi = {
  rate: (orderId: number, rating: number, comment?: string) =>
    http.post(`/experience/delivery-rating/${orderId}`, { rating, comment }).then((r) => r.data),
  get: (orderId: number) => http.get(`/experience/delivery-rating/${orderId}`).then((r) => r.data),
};

// ─── F2-14: Q&A ───────────────────────────────────────────────────────────────
export const qaApi = {
  getForProduct: (productId: number) => http.get(`/qa/products/${productId}`).then((r) => r.data),
  ask: (productId: number, question: string) =>
    http.post(`/qa/products/${productId}`, { question }).then((r) => r.data),
};

// ─── F2-17: Price Alerts ──────────────────────────────────────────────────────
export const priceAlertsApi = {
  set: (productId: number, targetPrice: number) =>
    http.post("/price-alerts", { productId, targetPrice }).then((r) => r.data),
  getAll: () => http.get("/price-alerts").then((r) => r.data),
  delete: (productId: number) => http.delete(`/price-alerts/${productId}`).then((r) => r.data),
};

// ─── F2-19: Loyalty Tiers ────────────────────────────────────────────────────
export const loyaltyTiersApi = {
  getAll: () => http.get("/products/loyalty-tiers").then((r) => r.data),
};

// ─── F3-10: Blog ─────────────────────────────────────────────────────────────
export const blogApi = {
  getAll: () => http.get("/blog").then((r) => r.data),
  getBySlug: (slug: string) => http.get(`/blog/${slug}`).then((r) => r.data),
};

// ─── F3-12: Price History ────────────────────────────────────────────────────
export const priceHistoryApi = {
  get: (productId: number, days?: number) =>
    http.get(`/price-history/${productId}${days ? `?days=${days}` : ""}`).then((r) => r.data) as Promise<{ price: number; discountPct: number; recordedAt: string }[]>,
};

// ─── F4-08: Volume Discounts ─────────────────────────────────────────────────
export const volumeDiscountsApi = {
  getForProduct: (productId: number) => http.get(`/volume-discounts/product/${productId}`).then((r) => r.data),
};
