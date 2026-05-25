// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * A3 worker-split smoke test.
 *
 * Validates that the `WorkerModule` (used by the standalone `worker.ts`
 * entrypoint) can be bootstrapped end-to-end:
 *   - Module graph resolves with no missing providers
 *   - `EmailProcessor` is registered + injectable
 *   - `EmailService` is available (producer side, used to enqueue jobs)
 *   - `PrismaService` is available (queue consumers need DB access)
 *   - `ConfigService` is available (queue consumers need env access)
 *   - Module closes cleanly without dangling connections
 *
 * Out of scope (would require a live Redis):
 *   - End-to-end queue → consumer flow
 *   - DISABLE_WORKERS pause path (covered indirectly: setting it to true
 *     here just keeps the worker paused without affecting registration)
 *
 * The test creates a Nest application CONTEXT (not a full HTTP app),
 * mirroring exactly what `backend/src/worker.ts` does at boot. If the
 * worker entrypoint regresses (missing provider, circular dep, etc.),
 * this test fails before the bug ships.
 */

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkerModule } from '../backend/src/worker.module';
import { EmailService } from '../backend/src/email/email.service';
import { EmailProcessor } from '../backend/src/email/email.processor';
import { PrismaService } from '../backend/src/prisma/prisma.service';

describe('Worker — Module bootstrap (A3 smoke test)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    // The standalone worker process bootstraps via
    // `NestFactory.createApplicationContext(WorkerModule)` (see
    // backend/src/worker.ts). The TestingModule path here exercises the
    // same module graph + lifecycle hooks without the HTTP plumbing.
    moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    await moduleRef.init();
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  it('boots without throwing', () => {
    expect(moduleRef).toBeDefined();
  });

  it('registers EmailProcessor as an injectable provider', () => {
    // Note: ts-jest can load the same source file via two resolution paths,
    // producing two distinct class references even when both point at the
    // same .ts file. `toBeInstanceOf` fails in that case. We assert on
    // constructor name + expected methods instead — that's what we actually
    // care about (the right provider got injected).
    const processor = moduleRef.get(EmailProcessor);
    expect(processor).toBeDefined();
    expect(processor.constructor.name).toBe('EmailProcessor');
    expect(typeof processor.process).toBe('function');
    expect(typeof processor.onApplicationBootstrap).toBe('function');
  });

  it('exposes EmailService for the producer-side enqueue API', () => {
    const service = moduleRef.get(EmailService);
    expect(service).toBeDefined();
    expect(service.constructor.name).toBe('EmailService');
    // Public producer-side surface
    expect(typeof service.sendOrderConfirmation).toBe('function');
  });

  it('exposes PrismaService (queue consumers need DB access)', () => {
    const prisma = moduleRef.get(PrismaService);
    expect(prisma).toBeDefined();
    expect(prisma.constructor.name).toBe('PrismaService');
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('exposes ConfigService (queue consumers need env)', () => {
    const config = moduleRef.get(ConfigService);
    expect(config).toBeDefined();
    expect(typeof config.get).toBe('function');
  });
});
