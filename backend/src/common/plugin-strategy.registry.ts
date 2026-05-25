// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable } from '@nestjs/common';
import { StrategyRegistry } from '@shopverse/sdk';

/**
 * Nest-injectable wrapper around the SDK's StrategyRegistry. The SDK
 * class is the actual implementation; we just give it a DI lifetime
 * so the kernel + admin controller + webhook router all get the same
 * instance.
 */
@Injectable()
export class PluginStrategyRegistry extends StrategyRegistry {}
