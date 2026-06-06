#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.
//
// T-7 — deploy-config contract. Every frontend deploy target MUST wire the
// server-reachable BACKEND_INTERNAL_URL (G-1); without it the split-host
// login/SSR fix is CI-only and breaks in real multi-container prod. The prod
// compose must also bake the browser NEXT_PUBLIC_API_URL build-arg. Pure text
// checks — no cluster / helm needed (CI adds a `helm template` render grep on
// top). Run: `node scripts/check-deploy-config.mjs`.
import { readFileSync } from "node:fs";

const checks = [
  { file: "docker-compose.yml", tokens: ["BACKEND_INTERNAL_URL", "NEXT_PUBLIC_API_URL"] },
  { file: "k8s/30-frontend-deployment.yaml", tokens: ["BACKEND_INTERNAL_URL"] },
  { file: "helm/shopverse/templates/frontend-deployment.yaml", tokens: ["BACKEND_INTERNAL_URL"] },
];

let failed = false;
for (const { file, tokens } of checks) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    console.error(`✗ ${file}: not found`);
    failed = true;
    continue;
  }
  for (const token of tokens) {
    const ok = content.includes(token);
    console.log(`${ok ? "✓" : "✗"} ${file}: ${token}`);
    if (!ok) failed = true;
  }
}

if (failed) {
  console.error(
    "\n✗ deploy-config contract FAILED — a frontend deploy target is missing the\n" +
      "  server-URL wiring (G-1). SSR / NextAuth login will fall back to the browser\n" +
      "  URL and break in a split-host deploy. See frontend/src/lib/server-api.ts.",
  );
  process.exit(1);
}
console.log("\n✓ deploy-config contract OK.");
