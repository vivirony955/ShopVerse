import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findOneByEmail: jest.fn(),
    create: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked-token'),
    verify: jest.fn(),
  };
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── validateUser ─────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns user without password when credentials are valid', async () => {
      const hashed = await bcrypt.hash('secret123', 10);
      mockUsersService.findOneByEmail.mockResolvedValue({
        id: 1, email: 'user@example.com', password: hashed, role: 'USER',
      });
      const result = await service.validateUser('user@example.com', 'secret123');
      expect(result).toEqual({ id: 1, email: 'user@example.com', role: 'USER' });
      expect(result).not.toHaveProperty('password');
    });

    it('returns null when password is wrong', async () => {
      const hashed = await bcrypt.hash('correct', 10);
      mockUsersService.findOneByEmail.mockResolvedValue({
        id: 1, email: 'user@example.com', password: hashed,
      });
      const result = await service.validateUser('user@example.com', 'wrong');
      expect(result).toBeNull();
    });

    it('returns null when user does not exist', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(null);
      const result = await service.validateUser('nobody@example.com', 'pass');
      expect(result).toBeNull();
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns access_token and refresh_token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
      const result = await service.login({ id: 1, email: 'user@example.com', role: 'USER' });
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  // ─── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    it('hashes password and returns new user without password', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 2, email: 'new@example.com', role: 'USER',
      });
      const result = await service.register('new@example.com', 'pass123');
      expect(result).not.toHaveProperty('password');
      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
      );
    });

    it('throws ConflictException when email already in use', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue({ id: 1, email: 'taken@example.com' });
      await expect(service.register('taken@example.com', 'pass')).rejects.toThrow(ConflictException);
    });
  });

  // ─── refreshToken ─────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('returns new access_token when tokenVersion matches', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, username: 'user@example.com', role: 'USER', tv: 0 });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, role: 'USER' });
      const result = await service.refreshToken('valid-refresh-token');
      expect(result).toHaveProperty('access_token');
    });

    it('throws UnauthorizedException when tokenVersion is stale (password changed)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, username: 'user@example.com', role: 'USER', tv: 0 });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1, role: 'USER' }); // incremented
      await expect(service.refreshToken('stale-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.refreshToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
