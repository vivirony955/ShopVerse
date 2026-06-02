// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import type { PluginRouteOptions } from '@shopverse/sdk';

/**
 * PluginRouteRegistry — plan §10 E25 (W1.T36).
 *
 * Collects plugin controller-class registrations. The API process
 * iterates the registry at boot and dynamically attaches each
 * controller class to NestJS; the OpenAPI tag is auto-applied so
 * /api/docs surfaces the plugin's routes under its own group.
 *
 * For W1, the registry only STORES the registrations. The dynamic
 * NestJS module assembly + OpenAPI tag application is wired in W2
 * with the first plugin extraction (price-alerts).
 *
 * The lint rule `plugin-route-prefix` (W1.T8) statically enforces
 * that each registered controller's @Controller('plugin/...') prefix
 * is correct. The registry doesn't re-check that — lint is the gate.
 */

export interface RegisteredRoute {
  readonly pluginId: string;
  readonly controllerClass: new (...args: unknown[]) => unknown;
  readonly tag: string;
}

@Injectable()
export class PluginRouteRegistry {
  private readonly logger = new Logger(PluginRouteRegistry.name);
  private readonly registrations: RegisteredRoute[] = [];

  register(
    pluginId: string,
    controllerClass: new (...args: unknown[]) => unknown,
    options: PluginRouteOptions,
  ): void {
    if (!options.tag || options.tag.trim().length === 0) {
      throw new Error(
        `Plugin ${pluginId} route registration requires a non-empty tag`,
      );
    }
    this.registrations.push({
      pluginId,
      controllerClass,
      tag: options.tag,
    });
    this.logger.log(
      `Registered route controller ${controllerClass.name} from ${pluginId} (tag: ${options.tag})`,
    );
  }

  unregisterPlugin(pluginId: string): void {
    for (let i = this.registrations.length - 1; i >= 0; i--) {
      if (this.registrations[i].pluginId === pluginId) {
        this.registrations.splice(i, 1);
      }
    }
  }

  all(): readonly RegisteredRoute[] {
    return [...this.registrations];
  }

  forPlugin(pluginId: string): readonly RegisteredRoute[] {
    return this.registrations.filter((r) => r.pluginId === pluginId);
  }
}
