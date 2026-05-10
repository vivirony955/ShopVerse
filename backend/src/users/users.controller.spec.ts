import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findById: jest.fn(),
    updateProfile: jest.fn(),
    getAddresses: jest.fn(),
    addAddress: jest.fn(),
    updateAddress: jest.fn(),
    deleteAddress: jest.fn(),
    setDefaultAddress: jest.fn(),
  };

  const mockReq = { user: { id: 1 } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── Profile ──────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns the current user profile', async () => {
      const profile = { id: 1, email: 'user@example.com', firstName: 'Jane' };
      mockUsersService.findById.mockResolvedValue(profile);
      const result = await controller.getProfile(mockReq);
      expect(result).toEqual(profile);
      expect(mockUsersService.findById).toHaveBeenCalledWith(1);
    });
  });

  describe('updateProfile', () => {
    it('updates and returns the updated profile', async () => {
      const updated = { id: 1, email: 'user@example.com', firstName: 'John' };
      mockUsersService.updateProfile.mockResolvedValue(updated);
      const result = await controller.updateProfile(mockReq, { firstName: 'John' });
      expect(result).toEqual(updated);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(1, { firstName: 'John' });
    });
  });

  // ─── Addresses ────────────────────────────────────────────────────────────

  describe('getAddresses', () => {
    it('returns list of addresses for the user', async () => {
      const addresses = [{ id: 1, userId: 1, city: 'Mumbai' }];
      mockUsersService.getAddresses.mockResolvedValue(addresses);
      const result = await controller.getAddresses(mockReq);
      expect(result).toEqual(addresses);
    });
  });

  describe('addAddress', () => {
    it('creates and returns new address', async () => {
      const addr = { fullName: 'Jane', phone: '9000000000', line1: '1 Main St', city: 'Delhi', state: 'DL', pincode: '110001' };
      mockUsersService.addAddress.mockResolvedValue({ id: 2, userId: 1, ...addr });
      const result = await controller.addAddress(mockReq, addr);
      expect(result).toHaveProperty('id');
      expect(mockUsersService.addAddress).toHaveBeenCalledWith(1, addr);
    });
  });

  describe('deleteAddress', () => {
    it('deletes the address and returns deleted record', async () => {
      mockUsersService.deleteAddress.mockResolvedValue({ id: 1 });
      const result = await controller.deleteAddress(mockReq, 1);
      expect(result).toEqual({ id: 1 });
    });
  });
});
