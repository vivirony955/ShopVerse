-- W1.T27 — Plan §10 E10: kernel-owned plugin config persistence.
-- Plugins call kernel.config.set/get; the kernel writes here. Storing
-- the (pluginId, key) composite as `id` lets the upsert in the SDK be
-- a single round-trip without a separate findUnique.

CREATE TABLE "PluginConfig" (
    "id"        TEXT NOT NULL,
    "pluginId"  TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "value"     JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginConfig_pluginId_key_key" ON "PluginConfig"("pluginId", "key");
CREATE INDEX "PluginConfig_pluginId_idx" ON "PluginConfig"("pluginId");
