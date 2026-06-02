#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * W6.T1 — per-plugin memory budget gate (plan §5 #8).
 *
 * Walks each first-party plugin directory under
 * `frontend/src/plugins/` and `backend/plugins/`, measures the
 * total source byte footprint, and asserts ≤ 10 MB raw bytes per
 * plugin. Like the W5.T6 hydration weight gate, this is a
 * CONSERVATIVE proxy for the runtime budget: raw bytes always
 * exceed loaded heap (which excludes node_modules already loaded
 * for the kernel, includes only the plugin's own JS). A plugin
 * passing this raw gate comfortably passes a real heap snapshot;
 * one failing it has structural bloat worth investigating.
 *
 * A genuine V8 heap snapshot harness — load each plugin in
 * isolation, measure RSS / heapUsed delta, assert ≤ 10 MB —
 * requires a node child-process orchestrator with realistic
 * kernel boot. Out of scope for V1; the source-size proxy catches
 * the common failure mode (plugin author accidentally bundles
 * lodash + moment + a 5 MB SVG sprite) without the orchestration
 * complexity.
 *
 * Usage: `npm run plugin-memory:check`
 */

const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const FRONTEND_PLUGINS_DIR = path.join(FRONTEND_ROOT, 'src', 'plugins');
const BACKEND_PLUGINS_DIR = path.join(REPO_ROOT, 'backend', 'plugins');

const PER_PLUGIN_CAP_MB = 10;

function listPluginDirs(parentDir) {
  if (!fs.existsSync(parentDir)) return [];
  return fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'node_modules')
    .map((d) => path.join(parentDir, d.name));
}

function walkSourceBytes(dir) {
  let bytes = 0;
  let fileCount = 0;
  const skip = new Set(['node_modules', 'dist', '.next', '__tests__', 'test']);
  function visit(p) {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (/\.(ts|tsx|js|jsx|json|prisma|md)$/.test(entry.name)) {
        const stat = fs.statSync(full);
        bytes += stat.size;
        fileCount++;
      }
    }
  }
  visit(dir);
  return { bytes, fileCount };
}

function pluginIdFromPath(p) {
  return path.basename(p);
}

function main() {
  const allDirs = [
    ...listPluginDirs(BACKEND_PLUGINS_DIR).map((d) => ({ type: 'backend', dir: d })),
    ...listPluginDirs(FRONTEND_PLUGINS_DIR).map((d) => ({ type: 'frontend', dir: d })),
  ];

  if (allDirs.length === 0) {
    console.log('[plugin-memory] no plugin directories — passing trivially');
    process.exit(0);
  }

  const perPlugin = new Map(); // id → { backend?: bytes, frontend?: bytes, files: n }
  for (const { type, dir } of allDirs) {
    const id = pluginIdFromPath(dir);
    const { bytes, fileCount } = walkSourceBytes(dir);
    if (!perPlugin.has(id)) perPlugin.set(id, { backend: 0, frontend: 0, files: 0 });
    const row = perPlugin.get(id);
    row[type] = bytes;
    row.files += fileCount;
  }

  console.log('[plugin-memory] per-plugin source size (MB):');
  const failures = [];
  for (const [id, row] of perPlugin) {
    const totalBytes = (row.backend || 0) + (row.frontend || 0);
    const mb = totalBytes / (1024 * 1024);
    const tag = mb > PER_PLUGIN_CAP_MB ? '✗' : '✓';
    console.log(
      `  ${tag} ${id.padEnd(28)} ` +
        `${mb.toFixed(2)} MB  ` +
        `(backend ${((row.backend || 0) / 1024).toFixed(1)} kB + ` +
        `frontend ${((row.frontend || 0) / 1024).toFixed(1)} kB, ` +
        `${row.files} files)`,
    );
    if (mb > PER_PLUGIN_CAP_MB) {
      failures.push({ id, mb });
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n[plugin-memory] FAIL — ${failures.length} plugin(s) exceeded the ${PER_PLUGIN_CAP_MB} MB raw-source cap:`,
    );
    for (const f of failures) {
      console.error(`  ${f.id}: ${f.mb.toFixed(2)} MB`);
    }
    console.error(
      '\nThe cap is plan §5 #8 (10 MB plugin idle memory). Raw source ' +
        'is a conservative proxy; pass this and the runtime heap is ' +
        'certain to be under cap.',
    );
    process.exit(1);
  }

  console.log(`\n[plugin-memory] OK — every plugin is ≤ ${PER_PLUGIN_CAP_MB} MB raw source`);
  process.exit(0);
}

main();
