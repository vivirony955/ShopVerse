// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { HookRunner } from '../../../src/common/hook-runner.service';

const PLUGIN_ID = '@shopverse/plugin-blog';

/**
 * Bootstrap glue — registers the plugin's `user.beforeDelete` hook
 * with the kernel's HookRunner on application start.
 *
 * Mirrors the W2 pilot pattern (PriceAlertsBootstrap). The plain-object
 * ShopVersePlugin lifecycle stays the contract for THIRD-PARTY
 * plugins; first-party plugins use this Nest-native shortcut because
 * the DI graph already resolves their services + kernel infra cleanly.
 *
 * No cron or queue registration for blog — it's pure CRUD with no
 * background work. Just the GDPR-cascade hook so a user delete (when
 * that endpoint ships, W3.T7 note) doesn't trip the BlogPost.authorId
 * FK with RESTRICT.
 */
@Injectable()
class BlogBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly hooks: HookRunner,
    private readonly service: BlogService,
  ) {}

  onApplicationBootstrap(): void {
    this.hooks.register('user.beforeDelete', PLUGIN_ID, (ctx) =>
      this.service.deleteAllForUser(ctx.userId),
    );
  }
}

@Module({
  controllers: [BlogController],
  providers: [BlogService, BlogBootstrap],
})
export class BlogPluginModule {}
