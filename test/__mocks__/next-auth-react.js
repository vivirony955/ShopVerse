// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

// Zero-dependency stub for next-auth and all next-auth/* sub-paths.
//
// Resolved by jest.config.ts moduleNameMapper to avoid loading the real
// next-auth package, which requires 'react' as a peer dependency — not
// installed in test/node_modules.
//
// frontend-api.spec.ts replaces this entirely with:
//   jest.mock('next-auth/react', () => ({ getSession: jest.fn()... }))
// All other specs never import next-auth, so they always get this stub.
'use strict';
module.exports = {
  getSession: () => Promise.resolve(null),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: () => Promise.resolve(null),
  signOut: () => Promise.resolve(null),
  SessionProvider: function SessionProvider(props) { return props.children; },
};
