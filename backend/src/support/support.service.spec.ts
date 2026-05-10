import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { TicketPriority, TicketStatus } from '@prisma/client';

describe('SupportService', () => {
  let service: SupportService;
  let prisma: MockPrisma;

  const mockTicket = {
    id: 1,
    userId: 1,
    subject: 'Order not delivered',
    description: 'My order #42 has not arrived',
    status: TicketStatus.OPEN,
    priority: TicketPriority.MEDIUM,
    assignedTo: null,
    notes: [],
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<SupportService>(SupportService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── createTicket ─────────────────────────────────────────────────────────────

  describe('createTicket', () => {
    it('creates a ticket for the authenticated user', async () => {
      prisma.supportTicket.create.mockResolvedValue(mockTicket);
      const result = await service.createTicket(1, {
        subject: 'Order not delivered',
        description: 'My order #42 has not arrived',
      });
      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 1 }) }),
      );
      expect(result.status).toBe(TicketStatus.OPEN);
    });

    it('includes orderId when provided', async () => {
      prisma.supportTicket.create.mockResolvedValue({ ...mockTicket, orderId: 42 });
      const result = await service.createTicket(1, {
        orderId: 42,
        subject: 'Missing item',
        description: 'One item was not in the package',
      });
      expect(result.orderId).toBe(42);
    });
  });

  // ─── getMyTickets ─────────────────────────────────────────────────────────────

  describe('getMyTickets', () => {
    it('returns tickets for the user', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([mockTicket]);
      const result = await service.getMyTickets(1);
      expect(result).toHaveLength(1);
      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
    });
  });

  // ─── getAllTickets ────────────────────────────────────────────────────────────

  describe('getAllTickets', () => {
    it('returns all tickets when no status filter is given', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([mockTicket]);
      const result = await service.getAllTickets();
      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result).toHaveLength(1);
    });

    it('filters by status when provided', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      await service.getAllTickets(TicketStatus.RESOLVED);
      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: TicketStatus.RESOLVED } }),
      );
    });
  });

  // ─── getTicket ────────────────────────────────────────────────────────────────

  describe('getTicket', () => {
    it('returns ticket with notes and user', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        ...mockTicket,
        user: { id: 1, email: 'user@test.com' },
      });
      const result = await service.getTicket(1);
      expect(result.user).toBeDefined();
    });

    it('throws NotFoundException for unknown ticket', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);
      await expect(service.getTicket(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateTicket ─────────────────────────────────────────────────────────────

  describe('updateTicket', () => {
    it('updates ticket status', async () => {
      prisma.supportTicket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.IN_PROGRESS,
      });
      const result = await service.updateTicket(1, { status: TicketStatus.IN_PROGRESS });
      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('sets resolvedAt when status is RESOLVED', async () => {
      prisma.supportTicket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(),
      });
      const result = await service.updateTicket(1, { status: TicketStatus.RESOLVED });
      expect(result.resolvedAt).toBeDefined();
      expect(prisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── addNote ──────────────────────────────────────────────────────────────────

  describe('addNote', () => {
    it('adds an internal note to a ticket', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(mockTicket);
      prisma.ticketNote.create.mockResolvedValue({
        id: 1,
        ticketId: 1,
        authorId: 2,
        body: 'Investigating the issue',
        isInternal: true,
      });

      const result = await service.addNote(1, 2, {
        body: 'Investigating the issue',
        isInternal: true,
      });
      expect(result.isInternal).toBe(true);
    });

    it('moves ticket to IN_PROGRESS when staff sends public reply to OPEN ticket', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ ...mockTicket, status: TicketStatus.OPEN });
      prisma.ticketNote.create.mockResolvedValue({ id: 1, body: 'We are looking into it', isInternal: false });
      prisma.supportTicket.update.mockResolvedValue({ ...mockTicket, status: TicketStatus.IN_PROGRESS });

      await service.addNote(1, 2, { body: 'We are looking into it', isInternal: false });
      expect(prisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: TicketStatus.IN_PROGRESS },
        }),
      );
    });

    it('does not change status for internal-only notes', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ ...mockTicket, status: TicketStatus.OPEN });
      prisma.ticketNote.create.mockResolvedValue({ id: 1, isInternal: true });

      await service.addNote(1, 2, { body: 'Checking logs', isInternal: true });
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown ticket', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);
      await expect(service.addNote(999, 2, { body: 'test' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addAdminNote ─────────────────────────────────────────────────────────────

  describe('addAdminNote', () => {
    it('creates admin note with target details', async () => {
      prisma.adminNote.create.mockResolvedValue({
        id: 1,
        authorId: 5,
        targetType: 'order',
        targetId: 42,
        body: 'Customer requested expedited refund',
      });
      const result = await service.addAdminNote(5, {
        targetType: 'order',
        targetId: 42,
        body: 'Customer requested expedited refund',
      });
      expect(result.targetType).toBe('order');
      expect(result.targetId).toBe(42);
    });
  });

  // ─── getAdminNotes ────────────────────────────────────────────────────────────

  describe('getAdminNotes', () => {
    it('returns notes for a target entity', async () => {
      prisma.adminNote.findMany.mockResolvedValue([
        { id: 1, targetType: 'user', targetId: 3, body: 'Blacklist candidate' },
      ]);
      const result = await service.getAdminNotes('user', 3);
      expect(result).toHaveLength(1);
      expect(prisma.adminNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { targetType: 'user', targetId: 3 } }),
      );
    });
  });

  // ─── getSlaReport ─────────────────────────────────────────────────────────────

  describe('getSlaReport', () => {
    it('returns breached tickets count', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        { id: 1, priority: 'URGENT', createdAt: new Date(Date.now() - 5 * 3600_000) },
        { id: 2, priority: 'HIGH', createdAt: new Date(Date.now() - 10 * 3600_000) },
      ]);
      const result = await service.getSlaReport();
      expect(result.breachedCount).toBe(2);
      expect(result.tickets).toHaveLength(2);
    });

    it('returns empty list when no SLA breaches', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      const result = await service.getSlaReport();
      expect(result.breachedCount).toBe(0);
    });
  });
});
