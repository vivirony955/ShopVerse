// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { render, screen } from "@testing-library/react";
import Footer from "../Footer";
import { HideBadgeProvider } from "../BadgeContext";

// Guards the entitlements-loop regression: Footer must be a SYNCHRONOUS client
// component that reads the badge flag from context and never fetches itself.
describe("Footer — no client-side entitlements fetch", () => {
  beforeEach(() => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it("renders the badge in community mode without any fetch", () => {
    render(
      <HideBadgeProvider value={false}>
        <Footer />
      </HideBadgeProvider>,
    );
    expect(screen.getByLabelText("Powered by ShopVerse")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("hides the badge when a license grants it — still no fetch", () => {
    render(
      <HideBadgeProvider value={true}>
        <Footer />
      </HideBadgeProvider>,
    );
    expect(screen.queryByLabelText("Powered by ShopVerse")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
