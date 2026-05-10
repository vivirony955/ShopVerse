// Mock @prisma/client before importing PrismaService so PrismaClient constructor
// does not attempt to connect to a real database during unit tests.
jest.mock('@prisma/client', () => ({
  // Use a regular function (not arrow) so 'this' refers to the new instance.
  // Returning nothing preserves the prototype chain of the PrismaService subclass.
  PrismaClient: jest.fn().mockImplementation(function (this: any) {
    this.$connect = jest.fn().mockResolvedValue(undefined);
    this.$disconnect = jest.fn().mockResolvedValue(undefined);
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
    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
