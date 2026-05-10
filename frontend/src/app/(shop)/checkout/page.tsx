// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Tag, ShoppingBag, Plus, Check, X,
  ChevronRight, Lock, CreditCard, Truck, Wallet, Gift,
} from "lucide-react";
import toast from "react-hot-toast";
import { cartApi, usersApi, couponsApi, ordersApi, paymentsApi, experienceApi, deliverySlotsApi, walletApi } from "@/lib/api";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useCartStore } from "@/lib/store";
import { calcDiscountedPrice, formatPrice, getProductImage } from "@/lib/utils";
import type { Address, CouponValidation } from "@/types";

type Step = "address" | "review";
type PaymentMethod = "STRIPE" | "COD" | "WALLET";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

// F1-16: India Post pincode autofill
async function fetchPincodeData(pincode: string): Promise<{ city: string; state: string } | null> {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await res.json();
    if (data?.[0]?.Status === "Success" && data[0].PostOffice?.length > 0) {
      const po = data[0].PostOffice[0];
      return { city: po.District, state: po.State };
    }
  } catch { /* ignore */ }
  return null;
}

function usePincodeAutofill(
  pincode: string,
  onAutofill: (city: string, state: string) => void,
) {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (pincode.length !== 6) return;
    let cancelled = false;
    setLoading(true);
    fetchPincodeData(pincode).then((data) => {
      if (!cancelled && data) onAutofill(data.city, data.state);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode]);
  return loading;
}

// Stripe payment form rendered inside Elements provider
function StripePayForm({ clientSecret, orderId, onSuccess }: {
  clientSecret: string;
  orderId: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const router = useRouter();

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/confirmation?id=${orderId}` },
      redirect: "if_required",
    });
    if (error) {
      toast.error(error.message ?? "Payment failed");
      setPaying(false);
    } else {
      onSuccess();
      router.push(`/orders/confirmation?id=${orderId}`);
    }
  };

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={paying || !stripe}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-all"
      >
        {paying ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <><Lock className="h-4 w-4" /> Pay Now</>
        )}
      </button>
    </form>
  );
}

function GuestCheckout() {
  const router = useRouter();
  const { items: storeItems } = useCartStore();
  const [email, setEmail] = useState("");
  const [addr, setAddr] = useState({ fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
  const [couponCode, setCouponCode] = useState("");
  const [placing, setPlacing] = useState(false);

  // F1-16: auto-fill city/state from pincode
  const pincodeLoading = usePincodeAutofill(
    addr.pincode,
    (city, state) => setAddr((a) => ({ ...a, city, state })),
  );

  const addrF = (field: keyof typeof addr, label: string, required = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && " *"}</label>
      <input
        type="text"
        value={addr[field]}
        onChange={(e) => setAddr((a) => ({ ...a, [field]: e.target.value }))}
        required={required}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );

  const handleGuestOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (storeItems.length === 0) { toast.error("Your bag is empty"); return; }
    setPlacing(true);
    try {
      const order = await ordersApi.placeGuest({
        email,
        address: addr,
        items: storeItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        couponCode: couponCode.trim() || undefined,
      });
      toast.success("Order placed! Check your email for confirmation.");
      router.push(`/orders/confirmation?id=${order.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  const subtotal = storeItems.reduce((s, i) => s + i.variant.product.basePrice * (1 - i.variant.product.discountPct / 100) * i.quantity, 0);
  const shipping = subtotal >= 499 ? 0 : 49;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Guest Checkout</h1>
      <p className="text-sm text-slate-400 mb-6">
        No account needed.{" "}
        <Link href="/login?callbackUrl=/checkout" className="text-violet-600 hover:underline">Sign in</Link>{" "}
        to save your info for next time.
      </p>

      {storeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <ShoppingBag className="h-16 w-16 text-slate-200 mb-4" />
          <p className="text-lg font-semibold text-slate-700">Your bag is empty</p>
          <Link href="/products" className="mt-4 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors">
            Start Shopping
          </Link>
        </div>
      ) : (
        <form onSubmit={handleGuestOrder}>
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-5">
              {/* Email */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <h2 className="font-semibold text-slate-900 mb-4">Contact</h2>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                  <p className="text-xs text-slate-400 mt-1">Order confirmation will be sent here</p>
                </div>
              </div>

              {/* Address */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-violet-600" /> Delivery Address
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {addrF("fullName", "Full Name", true)}
                  {addrF("phone", "Phone", true)}
                  <div className="col-span-2">{addrF("line1", "Address Line 1", true)}</div>
                  <div className="col-span-2">{addrF("line2", "Address Line 2 (optional)")}</div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Pincode *</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={addr.pincode}
                        onChange={(e) => setAddr((a) => ({ ...a, pincode: e.target.value }))}
                        required
                        maxLength={6}
                        placeholder="6-digit pincode"
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      />
                      {pincodeLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
                  {addrF("city", "City", true)}
                  {addrF("state", "State", true)}
                </div>
              </div>

              {/* Coupon */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-violet-600" /> Coupon Code
                </h2>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code (optional)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>

              <button
                type="submit"
                disabled={placing}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-all"
              >
                {placing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Lock className="h-4 w-4" /> Place Order (COD) · {formatPrice(subtotal + shipping)}</>}
              </button>
            </div>

            {/* Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl border border-slate-100 p-5 sticky top-24">
                <h2 className="font-bold text-slate-900 mb-4">Order Summary</h2>
                <div className="space-y-3 mb-4 max-h-52 overflow-y-auto no-scrollbar">
                  {storeItems.map((item) => {
                    const price = item.variant.product.basePrice * (1 - item.variant.product.discountPct / 100);
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 line-clamp-1">{item.variant.product.name}</p>
                          <p className="text-xs text-slate-400">x{item.quantity}</p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900">{formatPrice(price * item.quantity)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping</span>
                    <span className={shipping === 0 ? "text-green-600 font-medium" : ""}>{shipping === 0 ? "FREE" : formatPrice(shipping)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-2.5">
                    <span>Total</span><span>{formatPrice(subtotal + shipping)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 text-center mt-3">Cash on Delivery only for guest orders</p>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const { setItems } = useCartStore();

  const [step, setStep] = useState<Step>("address");
  const [selectedAddress, setSelectedAddress] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponData, setCouponData] = useState<CouponValidation | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [giftEnabled, setGiftEnabled] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState<Omit<Address, "id" | "userId">>({
    fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false,
  });
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  // F1-15: wallet partial payment toggle
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmountInput, setWalletAmountInput] = useState("");

  // F1-16: auto-fill city/state from pincode in new address form
  const newAddressPincodeLoading = usePincodeAutofill(
    newAddress.pincode,
    (city, state) => setNewAddress((a) => ({ ...a, city, state })),
  );

  const { data: cart } = useQuery({
    queryKey: ["cart"],
    queryFn: cartApi.get,
    enabled: !!session,
  });

  // F1-15: wallet balance for split payment UI
  const { data: walletData } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: walletApi.get,
    enabled: !!session,
  });

  const { data: addresses, refetch: refetchAddresses } = useQuery({
    queryKey: ["addresses"],
    queryFn: usersApi.getAddresses,
    enabled: !!session,
  });

  // F1-14: Delivery slots for next 3 days
  const slotDates = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const { data: deliverySlots } = useQuery({
    queryKey: ["delivery-slots-checkout", slotDates[0]],
    queryFn: async () => {
      const results = await Promise.all(slotDates.map((date) => deliverySlotsApi.getAvailable(date)));
      return results.flat();
    },
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (addresses && addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(addresses.find((a) => a.isDefault)?.id ?? addresses[0].id);
    }
  }, [addresses, selectedAddress]);

  const addAddressMutation = useMutation({
    mutationFn: () => usersApi.addAddress(newAddress),
    onSuccess: async (addr) => {
      await refetchAddresses();
      setSelectedAddress(addr.id);
      setShowAddressForm(false);
      setNewAddress({ fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false });
      toast.success("Address saved");
    },
  });

  const placeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAddress) throw new Error("no-address");
      const walletAmt = useWallet && walletAmountInput ? parseFloat(walletAmountInput) : 0;
      const order = await ordersApi.place({
        addressId: selectedAddress,
        couponCode: couponData?.valid ? couponCode : undefined,
        paymentMethod,
        walletAmountUsed: walletAmt > 0 ? walletAmt : undefined,
      });
      if (giftEnabled && giftMessage.trim()) {
        await experienceApi.addGiftOption({ orderId: order.id, message: giftMessage }).catch(() => {});
      }
      if (paymentMethod === "STRIPE") {
        const { clientSecret } = await paymentsApi.createIntent(order.id);
        setStripeClientSecret(clientSecret);
        setPlacedOrderId(order.id);
      }
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      setItems([]);
      if (paymentMethod !== "STRIPE") {
        toast.success("Order placed successfully!");
        router.push(`/orders/confirmation?id=${order.id}`);
      }
    },
    onError: (err: any) => {
      if (err.message === "no-address") {
        toast.error("Please select a delivery address");
      } else {
        toast.error(err?.response?.data?.message || "Failed to place order");
      }
    },
  });

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const data = await couponsApi.validate(couponCode, subtotal);
      if (data.valid) {
        setCouponData(data);
        toast.success(`Coupon applied! ₹${data.discount} off`);
      } else {
        toast.error("Invalid coupon code");
        setCouponData(null);
      }
    } catch {
      toast.error("Invalid coupon code");
      setCouponData(null);
    } finally {
      setCouponLoading(false);
    }
  };

  if (!session) {
    return <GuestCheckout />;
  }

  const items = cart?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShoppingBag className="h-16 w-16 text-slate-200 mb-4" />
        <p className="text-lg font-semibold text-slate-700">Your bag is empty</p>
        <Link href="/products" className="mt-4 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors">
          Continue Shopping
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((sum, item) => {
    const price = calcDiscountedPrice(item.variant.product.basePrice, item.variant.product.discountPct);
    return sum + price * item.quantity;
  }, 0);

  const discount = couponData?.valid ? couponData.discount : 0;
  const shipping = subtotal >= 499 ? 0 : 49;
  const total = subtotal - discount + shipping;

  const addrField = (field: keyof typeof newAddress, label: string, required = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && " *"}</label>
      <input
        type="text"
        value={newAddress[field] as string}
        onChange={(e) => setNewAddress((f) => ({ ...f, [field]: e.target.value }))}
        required={required}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Checkout</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {(["address", "review"] as Step[]).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-4 w-4 text-slate-300" />}
            <span
              className={`font-medium ${step === s ? "text-violet-600" : "text-slate-400"}`}
            >
              {i + 1}. {s === "address" ? "Delivery Address" : "Review & Pay"}
            </span>
          </span>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* ─── Left: Address / Review ──────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {step === "address" ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-violet-600" />
                  <h2 className="font-semibold text-slate-900">Select Delivery Address</h2>
                </div>
                <button
                  onClick={() => setShowAddressForm(!showAddressForm)}
                  className="flex items-center gap-1.5 text-sm text-violet-600 font-medium hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add New
                </button>
              </div>

              {/* New address form */}
              {showAddressForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-violet-50 rounded-2xl p-5 overflow-hidden"
                >
                  <h3 className="font-semibold text-slate-900 mb-4 text-sm">New Address</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {addrField("fullName", "Full Name", true)}
                    {addrField("phone", "Phone", true)}
                    <div className="col-span-2">{addrField("line1", "Address Line 1", true)}</div>
                    <div className="col-span-2">{addrField("line2", "Address Line 2 (optional)")}</div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Pincode *</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newAddress.pincode}
                          onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value }))}
                          required maxLength={6} placeholder="6-digit"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                        {newAddressPincodeLoading && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                    </div>
                    {addrField("city", "City", true)}
                    {addrField("state", "State", true)}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => addAddressMutation.mutate()}
                      disabled={addAddressMutation.isPending}
                      className="px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors disabled:opacity-60"
                    >
                      {addAddressMutation.isPending ? "Saving..." : "Save Address"}
                    </button>
                    <button
                      onClick={() => setShowAddressForm(false)}
                      className="px-5 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-full hover:border-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Address list */}
              <div className="space-y-3">
                {!addresses || addresses.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No saved addresses. Add one above.</p>
                ) : (
                  addresses.map((addr) => (
                    <label
                      key={addr.id}
                      className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        selectedAddress === addr.id
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-100 hover:border-violet-200 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={selectedAddress === addr.id}
                        onChange={() => setSelectedAddress(addr.id)}
                        className="mt-1 accent-violet-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{addr.fullName}</p>
                          {addr.isDefault && (
                            <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""},  {addr.city}, {addr.state} – {addr.pincode}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">📞 {addr.phone}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <button
                onClick={() => {
                  if (!selectedAddress) { toast.error("Please select an address"); return; }
                  setStep("review");
                }}
                disabled={!selectedAddress}
                className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors"
              >
                Continue to Review
              </button>
            </>
          ) : (
            <>
              {/* Review step: show address + items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-violet-600" /> Delivering to
                  </h2>
                  <button onClick={() => setStep("address")} className="text-xs text-violet-600 hover:underline">Change</button>
                </div>
                {addresses?.find((a) => a.id === selectedAddress) && (() => {
                  const addr = addresses.find((a) => a.id === selectedAddress)!;
                  return (
                    <div className="bg-violet-50 rounded-2xl p-4 text-sm">
                      <p className="font-semibold text-slate-900">{addr.fullName}</p>
                      <p className="text-slate-500 mt-0.5">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} – {addr.pincode}</p>
                      <p className="text-slate-400 text-xs mt-0.5">📞 {addr.phone}</p>
                    </div>
                  );
                })()}
              </div>

              <div>
                <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-violet-600" /> Order Items
                </h2>
                <div className="space-y-3">
                  {items.map((item) => {
                    const price = calcDiscountedPrice(item.variant.product.basePrice, item.variant.product.discountPct);
                    return (
                      <div key={item.id} className="flex gap-3 p-3 bg-white rounded-2xl border border-slate-100">
                        <div className="relative w-16 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-slate-50">
                          <Image src={getProductImage(item.variant.product.images)} alt={item.variant.product.name} fill className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 line-clamp-2">{item.variant.product.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.variant.size} · {item.variant.color} · Qty: {item.quantity}</p>
                          <p className="text-sm font-bold text-slate-900 mt-1">{formatPrice(price * item.quantity)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* F1-14: Delivery Slot Picker */}
              {deliverySlots && deliverySlots.length > 0 && (
                <div>
                  <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-violet-600" /> Delivery Slot
                    <span className="text-xs font-normal text-slate-400">(optional)</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {deliverySlots.filter((s: any) => s.bookedCount < s.maxOrders).slice(0, 6).map((slot: any) => {
                      const dateObj = new Date(slot.date);
                      const dayStr = dateObj.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
                      const spotsLeft = slot.maxOrders - slot.bookedCount;
                      return (
                        <button
                          key={slot.id}
                          onClick={() => setSelectedSlotId(selectedSlotId === slot.id ? null : slot.id)}
                          className={`p-3 rounded-xl border-2 text-left text-sm transition-all ${
                            selectedSlotId === slot.id
                              ? "border-violet-500 bg-violet-50"
                              : "border-slate-100 hover:border-violet-200"
                          }`}
                        >
                          <p className="font-medium text-slate-900">{dayStr}</p>
                          <p className="text-xs text-slate-500">{slot.slotLabel}</p>
                          {spotsLeft <= 5 && (
                            <p className="text-xs text-amber-600 mt-1">Only {spotsLeft} slots left</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Payment Method Selector */}
              <div>
                <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-violet-600" /> Payment Method
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { id: "COD", label: "Cash on Delivery", Icon: Truck },
                    { id: "STRIPE", label: "Card / UPI", Icon: CreditCard },
                    { id: "WALLET", label: "Wallet", Icon: Wallet },
                  ] as { id: PaymentMethod; label: string; Icon: React.ElementType }[]).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => { setPaymentMethod(id); setStripeClientSecret(null); }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 text-sm font-medium transition-all ${
                        paymentMethod === id
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-100 text-slate-600 hover:border-violet-200"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs text-center">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* F1-15: Wallet Split Payment */}
              {walletData && walletData.balance > 0 && paymentMethod !== "WALLET" && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useWallet}
                      onChange={(e) => setUseWallet(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                        <Wallet className="h-4 w-4" />
                        Use Wallet Balance
                        <span className="text-xs font-normal text-emerald-600 ml-1">₹{walletData.balance.toFixed(2)} available</span>
                      </p>
                    </div>
                  </label>
                  {useWallet && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={walletData.balance}
                        step={0.01}
                        value={walletAmountInput}
                        onChange={(e) => setWalletAmountInput(e.target.value)}
                        placeholder={`Max ₹${walletData.balance.toFixed(2)}`}
                        className="flex-1 px-3 py-2 border border-emerald-200 rounded-xl text-sm outline-none focus:border-emerald-400"
                      />
                      <button
                        onClick={() => setWalletAmountInput(String(walletData.balance))}
                        className="px-3 py-2 text-xs text-emerald-700 bg-emerald-100 rounded-xl hover:bg-emerald-200 transition-colors"
                      >
                        Max
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Gift Wrapping */}
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setGiftEnabled(!giftEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${giftEnabled ? "bg-violet-500" : "bg-slate-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${giftEnabled ? "translate-x-5" : ""}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-medium text-slate-900">Add gift wrapping &amp; message</span>
                  </div>
                </label>
                {giftEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 overflow-hidden"
                  >
                    <textarea
                      value={giftMessage}
                      onChange={(e) => setGiftMessage(e.target.value)}
                      placeholder="Write a gift message (optional)..."
                      rows={3}
                      maxLength={200}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none"
                    />
                    <p className="text-xs text-slate-400 mt-1 text-right">{giftMessage.length}/200</p>
                  </motion.div>
                )}
              </div>

              {/* Stripe Elements form (appears after order placed with STRIPE) */}
              <AnimatePresence>
                {stripeClientSecret && placedOrderId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                      <p className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <Lock className="h-4 w-4 text-green-600" /> Secure Payment
                      </p>
                      <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret }}>
                        <StripePayForm
                          clientSecret={stripeClientSecret}
                          orderId={placedOrderId}
                          onSuccess={() => { setItems([]); }}
                        />
                      </Elements>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Place Order button (hidden once Stripe form is shown) */}
              {!stripeClientSecret && (
                <button
                  onClick={() => placeMutation.mutate()}
                  disabled={placeMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-all hover:shadow-lg hover:shadow-violet-200 active:scale-[0.98]"
                >
                  {placeMutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Lock className="h-4 w-4" />
                    {paymentMethod === "STRIPE" ? `Continue to Payment · ${formatPrice(total)}` : `Place Order · ${formatPrice(total)}`}
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* ─── Right: Order Summary ─────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl border border-slate-100 p-5 sticky top-24">
            <h2 className="font-bold text-slate-900 mb-4">Order Summary</h2>

            {/* Item list (compact) */}
            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto no-scrollbar">
              {items.map((item) => {
                const price = calcDiscountedPrice(item.variant.product.basePrice, item.variant.product.discountPct);
                return (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="relative w-10 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-slate-50">
                      <Image src={getProductImage(item.variant.product.images)} alt="" fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 line-clamp-1">{item.variant.product.name}</p>
                      <p className="text-xs text-slate-400">x{item.quantity}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-900">{formatPrice(price * item.quantity)}</p>
                  </div>
                );
              })}
            </div>

            {/* Coupon */}
            <div className="mb-4">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponData(null); }}
                    placeholder="Coupon code"
                    className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400"
                    disabled={!!couponData?.valid}
                  />
                  {couponData?.valid && (
                    <button onClick={() => { setCouponData(null); setCouponCode(""); }}>
                      <X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim() || !!couponData?.valid}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {couponLoading ? "..." : couponData?.valid ? <Check className="h-4 w-4" /> : "Apply"}
                </button>
              </div>
              {couponData?.valid && (
                <p className="text-xs text-green-600 font-medium mt-1.5 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Coupon applied: {formatPrice(couponData.discount)} off
                </p>
              )}
            </div>

            {/* Price breakdown */}
            <div className="space-y-2.5 border-t border-slate-100 pt-4">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal ({items.length} items)</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Coupon Discount</span>
                  <span>-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-slate-600">
                <span>Shipping</span>
                <span className={shipping === 0 ? "text-green-600 font-medium" : ""}>
                  {shipping === 0 ? "FREE" : formatPrice(shipping)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-100 pt-2.5 mt-1">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            {subtotal < 499 && (
              <p className="text-xs text-center text-slate-400 mt-3">
                Add {formatPrice(499 - subtotal)} more for free shipping
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
