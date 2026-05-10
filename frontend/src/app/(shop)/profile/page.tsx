"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Phone, Mail, MapPin, Plus, Pencil, Trash2,
  Check, Shield, Package,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { usersApi } from "@/lib/api";
import type { Address } from "@/types";

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const qc = useQueryClient();

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", phone: "" });

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addrForm, setAddrForm] = useState<Omit<Address, "id" | "userId">>({
    fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false,
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: usersApi.me,
    enabled: !!session,
  });

  const { data: addresses } = useQuery({
    queryKey: ["addresses"],
    queryFn: usersApi.getAddresses,
    enabled: !!session,
  });

  useEffect(() => {
    if (me) {
      setProfileForm({ firstName: me.firstName ?? "", lastName: me.lastName ?? "", phone: me.phone ?? "" });
    }
  }, [me]);

  const updateProfileMutation = useMutation({
    mutationFn: () => usersApi.updateProfile(profileForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setEditingProfile(false);
      toast.success("Profile updated");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const addAddressMutation = useMutation({
    mutationFn: () => usersApi.addAddress(addrForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setShowAddressForm(false);
      resetAddrForm();
      toast.success("Address added");
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: () => usersApi.updateAddress(editingAddress!.id, addrForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setEditingAddress(null);
      resetAddrForm();
      toast.success("Address updated");
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: number) => usersApi.deleteAddress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      toast.success("Address removed");
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => usersApi.setDefaultAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });

  const resetAddrForm = () =>
    setAddrForm({ fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false });

  const startEditAddress = (addr: Address) => {
    setEditingAddress(addr);
    setAddrForm({ fullName: addr.fullName, phone: addr.phone, line1: addr.line1, line2: addr.line2 || "", city: addr.city, state: addr.state, pincode: addr.pincode, isDefault: addr.isDefault });
    setShowAddressForm(true);
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <User className="h-16 w-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Please sign in to view your profile</h2>
        <Link href="/login?callbackUrl=/profile" className="mt-6 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  const addrField = (field: keyof typeof addrForm, label: string, required = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && " *"}</label>
      <input
        type="text"
        value={addrForm[field] as string}
        onChange={(e) => setAddrForm((f) => ({ ...f, [field]: e.target.value }))}
        required={required}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <Link href="/orders" className="flex items-center gap-1.5 text-sm text-violet-600 font-medium hover:underline">
          <Package className="h-4 w-4" /> My Orders
        </Link>
      </div>

      {/* ─── Profile Card ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
              {(me?.firstName?.[0] || session.user?.email?.[0] || "U").toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {me?.firstName && me?.lastName ? `${me.firstName} ${me.lastName}` : me?.firstName || "My Account"}
              </p>
              <p className="text-sm text-slate-400">{session.user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => setEditingProfile(!editingProfile)}
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <AnimatePresence>
          {editingProfile ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                  <input
                    type="text"
                    value={profileForm.firstName}
                    onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={profileForm.lastName}
                    onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+91 98765 43210"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateProfileMutation.mutate()}
                  disabled={updateProfileMutation.isPending}
                  className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors disabled:opacity-60"
                >
                  {updateProfileMutation.isPending ? "Saving..." : <><Check className="h-3.5 w-3.5" /> Save Changes</>}
                </button>
                <button
                  onClick={() => setEditingProfile(false)}
                  className="px-5 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-full hover:border-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-slate-400" />
                <span className="text-slate-600">{session.user?.email}</span>
              </div>
              {me?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">{me.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-slate-400" />
                <span className="text-slate-600 capitalize">{me?.role?.toLowerCase() || "user"}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Addresses ────────────────────────────────────────────────────────── */}
      <div id="addresses" className="bg-white rounded-3xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-violet-600" /> Saved Addresses
          </h2>
          {!showAddressForm && (
            <button
              onClick={() => { setEditingAddress(null); resetAddrForm(); setShowAddressForm(true); }}
              className="flex items-center gap-1.5 text-sm text-violet-600 font-medium hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add New
            </button>
          )}
        </div>

        {/* Address form */}
        <AnimatePresence>
          {showAddressForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-violet-50 rounded-2xl p-4 mb-5 overflow-hidden"
            >
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                {editingAddress ? "Edit Address" : "New Address"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {addrField("fullName", "Full Name", true)}
                {addrField("phone", "Phone", true)}
                <div className="col-span-2">{addrField("line1", "Address Line 1", true)}</div>
                <div className="col-span-2">{addrField("line2", "Line 2 (optional)")}</div>
                {addrField("city", "City", true)}
                {addrField("state", "State", true)}
                {addrField("pincode", "Pincode", true)}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => editingAddress ? updateAddressMutation.mutate() : addAddressMutation.mutate()}
                  disabled={addAddressMutation.isPending || updateAddressMutation.isPending}
                  className="px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors disabled:opacity-60"
                >
                  {(addAddressMutation.isPending || updateAddressMutation.isPending) ? "Saving..." : editingAddress ? "Update" : "Save"}
                </button>
                <button
                  onClick={() => { setShowAddressForm(false); setEditingAddress(null); resetAddrForm(); }}
                  className="px-5 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-full hover:border-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Address list */}
        {!addresses || addresses.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No saved addresses yet</p>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`relative p-4 rounded-2xl border-2 transition-all ${
                  addr.isDefault ? "border-violet-200 bg-violet-50" : "border-slate-100"
                }`}
              >
                {addr.isDefault && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                    Default
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-900">{addr.fullName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} – {addr.pincode}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">📞 {addr.phone}</p>
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={() => startEditAddress(addr)}
                    className="text-xs font-medium text-violet-600 hover:underline flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  {!addr.isDefault && (
                    <button
                      onClick={() => setDefaultMutation.mutate(addr.id)}
                      disabled={setDefaultMutation.isPending}
                      className="text-xs font-medium text-slate-500 hover:text-violet-600 hover:underline"
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm("Delete this address?")) deleteAddressMutation.mutate(addr.id); }}
                    className="text-xs font-medium text-rose-400 hover:text-rose-600 hover:underline flex items-center gap-1 ml-auto"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
