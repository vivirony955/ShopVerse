// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { PrismaService } from '../prisma/prisma.service';
import {
  PluginConfigContextError,
  PluginConfigService,
} from './plugin-config.service';
import { runInPluginContext } from './plugin-context';

/**
 * Fake PluginConfig table — keyed by `<pluginId>:<key>`. Mirrors the
 * subset of the Prisma client surface PluginConfigService uses.
 */
class FakePluginConfigTable {
  rows = new Map<string, { pluginId: string; key: string; value: unknown }>();

  findUnique({
    where: {
      pluginId_key: { pluginId, key },
    },
  }: {
    where: { pluginId_key: { pluginId: string; key: string } };
  }) {
    const r = this.rows.get(`${pluginId}:${key}`);
    return Promise.resolve(r ? { value: r.value } : null);
  }

  upsert({
    where: {
      pluginId_key: { pluginId, key },
    },
    create,
    update,
  }: {
    where: { pluginId_key: { pluginId: string; key: string } };
    create: { id: string; pluginId: string; key: string; value: unknown };
    update: { value: unknown };
  }) {
    const id = `${pluginId}:${key}`;
    const existing = this.rows.get(id);
    if (existing) {
      this.rows.set(id, { pluginId, key, value: update.value });
    } else {
      this.rows.set(id, {
        pluginId: create.pluginId,
        key: create.key,
        value: create.value,
      });
    }
    return Promise.resolve(this.rows.get(id));
  }

  deleteMany({
    where: { pluginId, key },
  }: {
    where: { pluginId: string; key: string };
  }) {
    const id = `${pluginId}:${key}`;
    const had = this.rows.has(id);
    this.rows.delete(id);
    return Promise.resolve({ count: had ? 1 : 0 });
  }
}

describe('PluginConfigService', () => {
  let table: FakePluginConfigTable;
  let prisma: PrismaService;
  let svc: PluginConfigService;

  beforeEach(() => {
    table = new FakePluginConfigTable();
    prisma = { pluginConfig: table } as unknown as PrismaService;
    svc = new PluginConfigService(prisma);
  });

  describe('explicit *ForPlugin API', () => {
    it('returns null when key absent', async () => {
      await expect(svc.getForPlugin('@p/foo', 'missing')).resolves.toBeNull();
    });

    it('round-trips a value', async () => {
      await svc.setForPlugin('@p/foo', 'theme', { color: 'red' });
      const v = await svc.getForPlugin<{ color: string }>('@p/foo', 'theme');
      expect(v).toEqual({ color: 'red' });
    });

    it('upsert overwrites existing', async () => {
      await svc.setForPlugin('@p/foo', 'k', 1);
      await svc.setForPlugin('@p/foo', 'k', 2);
      expect(await svc.getForPlugin('@p/foo', 'k')).toBe(2);
    });

    it('different plugins are isolated', async () => {
      await svc.setForPlugin('@p/foo', 'k', 'foo-val');
      await svc.setForPlugin('@p/bar', 'k', 'bar-val');
      expect(await svc.getForPlugin('@p/foo', 'k')).toBe('foo-val');
      expect(await svc.getForPlugin('@p/bar', 'k')).toBe('bar-val');
    });

    it('delete removes the row', async () => {
      await svc.setForPlugin('@p/foo', 'k', 1);
      await svc.deleteForPlugin('@p/foo', 'k');
      expect(await svc.getForPlugin('@p/foo', 'k')).toBeNull();
    });
  });

  describe('context-bound API', () => {
    it('uses pluginId from ALS', async () => {
      const got = await runInPluginContext('@p/ctx', async () => {
        await svc.set('alpha', 99);
        return svc.get<number>('alpha');
      });
      expect(got).toBe(99);
      // Verify it was stored under @p/ctx.
      expect(await svc.getForPlugin('@p/ctx', 'alpha')).toBe(99);
    });

    it('throws PluginConfigContextError outside any plugin context', async () => {
      await expect(svc.get('x')).rejects.toBeInstanceOf(
        PluginConfigContextError,
      );
      await expect(svc.set('x', 1)).rejects.toBeInstanceOf(
        PluginConfigContextError,
      );
      await expect(svc.delete('x')).rejects.toBeInstanceOf(
        PluginConfigContextError,
      );
    });

    it('delete via context', async () => {
      await svc.setForPlugin('@p/ctx', 'k', 'v');
      await runInPluginContext('@p/ctx', () => svc.delete('k'));
      expect(await svc.getForPlugin('@p/ctx', 'k')).toBeNull();
    });
  });
});
