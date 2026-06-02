// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartSidebar from "@/components/cart/CartSidebar";
import CookieConsent from "@/components/ui/CookieConsent";
import ExitIntentPopup from "@/components/ui/ExitIntentPopup";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
      <CartSidebar />
      <CookieConsent />
      <ExitIntentPopup />
    </div>
  );
}
