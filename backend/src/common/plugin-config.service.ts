// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentPluginId } from './plugin-context';

/**
 * PluginConfigService — plan §10 E10 (W1.T27).
 *
 * Backs `kernel.config.{get,set,delete}` in the SDK. Plugin id is
 * implied by the active plugin context (AsyncLocalStorage set by the
 * HookRunner / PluginLoader). Calls outside a plugin context throw
 * `PluginConfigContextError` — the SDK consumer is expected to be in
 * a plugin frame.
 *
 * Storage shape: composite primary key `<pluginId>:<key>` lets us do
 * the upsert in a single round-trip (no separate findUnique + update).
 * Values are JSON-serialised — the plugin owns their shape.
 *
 * The `*ForPlugin(pluginId, ...)` variants exist for cases that need
 * to operate outside the plugin's own context (e.g. an admin tool
 * inspecting another plugin's settings).
 */
@Injectable()
export class PluginConfigService {
  private readonly logger = new Logger(PluginConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Context-bound API (the SDK calls these) ─────────────────────────────

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.getForPlugin<T>(this.requirePluginId(), key);
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.setForPlugin<T>(this.requirePluginId(), key, value);
  }

  async delete(key: string): Promise<void> {
    await this.deleteForPlugin(this.requirePluginId(), key);
  }

  // ── Explicit-pluginId API (admin/inspection) ────────────────────────────

  async getForPlugin<T = unknown>(
    pluginId: string,
    key: string,
  ): Promise<T | null> {
    const row = await this.prisma.pluginConfig.findUnique({
      where: { pluginId_key: { pluginId, key } },
      select: { value: true },
    });
    return row ? (row.value as unknown as T) : null;
  }

  async setForPlugin<T = unknown>(
    pluginId: string,
    key: string,
    value: T,
  ): Promise<void> {
    const id = `${pluginId}:${key}`;
    await this.prisma.pluginConfig.upsert({
      where: { pluginId_key: { pluginId, key } },
      create: { id, pluginId, key, value: value as never },
      update: { value: value as never },
    });
  }

  async deleteForPlugin(pluginId: string, key: string): Promise<void> {
    await this.prisma.pluginConfig.deleteMany({
      where: { pluginId, key },
    });
  }

  private requirePluginId(): string {
    const id = currentPluginId();
    if (!id) {
      throw new PluginConfigContextError();
    }
    return id;
  }
}

export class PluginConfigContextError extends Error {
  constructor() {
    super(
      'kernel.config.* called outside a plugin context. ' +
        'These methods must be invoked from inside onRegister, a hook ' +
        'handler, or an event consumer — the kernel attributes the ' +
        'call via AsyncLocalStorage and needs an active plugin frame.',
    );
    this.name = 'PluginConfigContextError';
  }
}
