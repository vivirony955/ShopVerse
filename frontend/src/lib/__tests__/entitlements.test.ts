// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  getEntitlements,
  canHideBadge,
  __resetEntitlementsCache,
  type Entitlements,
} from "../entitlements";

const LICENSED: Entitlements = {
  status: "active",
  licensed: true,
  canHideBadge: true,
  branding: null,
  plan: "white-label",
};

describe("getEntitlements — degradation + negative cache", () => {
  beforeAll(() => {
    // Avoid a dangling 2s timer per call in the test runtime.
    (AbortSignal as unknown as { timeout: () => AbortSignal }).timeout = () =>
      new AbortController().signal;
  });

  beforeEach(() => {
    __resetEntitlementsCache();
    jest.clearAllMocks();
  });

  // jsdom has no global fetch — assign a mock directly (spyOn would throw).
  function mockFetch(impl: () => Promise<unknown>) {
    const fn = jest.fn(impl);
    (global as unknown as { fetch: unknown }).fetch = fn;
    return fn;
  }

  it("degrades to null on a community 404", async () => {
    mockFetch(async () => ({ ok: false, status: 404 }));
    expect(await getEntitlements()).toBeNull();
  });

  it("degrades to null on a 500", async () => {
    mockFetch(async () => ({ ok: false, status: 500 }));
    expect(await getEntitlements()).toBeNull();
  });

  it("degrades to null when the request rejects (timeout / network)", async () => {
    mockFetch(async () => {
      throw new Error("AbortError");
    });
    expect(await getEntitlements()).toBeNull();
  });

  it("degrades to null on malformed JSON (2xx but unparseable)", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    expect(await getEntitlements()).toBeNull();
  });

  it("returns the entitlements on a valid 2xx", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => LICENSED }));
    expect(await getEntitlements()).toEqual(LICENSED);
    expect(await canHideBadge()).toBe(true);
  });

  it("negative-caches: a recent 404 short-circuits without re-fetching", async () => {
    const fetchSpy = mockFetch(async () => ({ ok: false, status: 404 }));
    expect(await getEntitlements()).toBeNull();
    expect(await getEntitlements()).toBeNull();
    expect(await getEntitlements()).toBeNull();
    // Only the first call hit the network; the rest short-circuited.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a live positive clears the negative short-circuit", async () => {
    const fetchSpy = mockFetch(async () => ({ ok: false, status: 404 }));
    expect(await getEntitlements()).toBeNull(); // sets negative cache
    fetchSpy.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => LICENSED,
    }));
    __resetEntitlementsCache(); // simulate TTL expiry
    expect(await getEntitlements()).toEqual(LICENSED);
  });
});
