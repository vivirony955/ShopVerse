// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

// Mock @prisma/client before importing PrismaService so PrismaClient constructor
// does not attempt to connect to a real database during unit tests.
jest.mock('@prisma/client', () => ({
  // Use a regular function (not arrow) so 'this' refers to the new instance.
  // Returning nothing preserves the prototype chain of the PrismaService subclass.
  PrismaClient: jest.fn().mockImplementation(function (this: {
    $connect: jest.Mock;
    $disconnect: jest.Mock;
    $use: jest.Mock;
  }) {
    this.$connect = jest.fn().mockResolvedValue(undefined);
    this.$disconnect = jest.fn().mockResolvedValue(undefined);
    // W1.T11 — PrismaService.onModuleInit registers a $use middleware
    // for the per-context query counter. The mock returns void to match.
    this.$use = jest.fn();
  }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('exposes $connect and $disconnect methods', () => {
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
  });

  it('calls $connect on module init', async () => {
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('registers the plugin-context query counter middleware', async () => {
    const useSpy = jest.spyOn(
      service as unknown as { $use: (fn: unknown) => void },
      '$use',
    );
    await service.onModuleInit();
    expect(useSpy).toHaveBeenCalledTimes(1);
    expect(typeof useSpy.mock.calls[0][0]).toBe('function');
  });
});
