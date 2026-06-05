// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { resolveServerApiBase } from "../server-api";

describe("resolveServerApiBase", () => {
  it("prefers the server-only BACKEND_INTERNAL_URL over the public + default", () => {
    expect(
      resolveServerApiBase({
        BACKEND_INTERNAL_URL: "http://backend:3001/api",
        NEXT_PUBLIC_API_URL: "http://localhost:3001/api",
      }),
    ).toBe("http://backend:3001/api");
  });

  it("falls back to NEXT_PUBLIC_API_URL when the internal URL is unset", () => {
    expect(
      resolveServerApiBase({ NEXT_PUBLIC_API_URL: "https://api.example.com/api" }),
    ).toBe("https://api.example.com/api");
  });

  it("falls back to the dev default when nothing is set", () => {
    expect(resolveServerApiBase({})).toBe("http://localhost:4000/api");
  });

  it("strips trailing slashes so callers never produce a //", () => {
    expect(
      resolveServerApiBase({ BACKEND_INTERNAL_URL: "http://backend:3001/api/" }),
    ).toBe("http://backend:3001/api");
    expect(
      resolveServerApiBase({ BACKEND_INTERNAL_URL: "http://backend:3001/api///" }),
    ).toBe("http://backend:3001/api");
  });
});
