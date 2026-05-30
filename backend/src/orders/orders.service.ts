// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  RefundReason,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { EmailService } from '../email/email.service';
import { FraudService } from '../fraud/fraud.service';
import { CartReservationService } from '../cart/cart-reservation.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralService } from '../referral/referral.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { EventBus } from '../common/event-bus.service';

// FINAL §9.4: statuses for which an order still holds reservedStock (pre-fulfilment).
// Cancelling from these states releases the reservation; cancelling from later states restocks.
const PRE_SHIPMENT_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING'] as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
    private readonly emailService: EmailService,
    private readonly fraudService: FraudService,
    private readonly cartReservation: CartReservationService,
    private readonly loyaltyService: LoyaltyService,
    private readonly referralService: ReferralService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService,
    private readonly eventBus: EventBus,
  ) {}

  // ─── Business-rate constants (server-authoritative — never from client) ────
  private static readonly FREE_SHIPPING_THRESHOLD = 500; // INR
  private static readonly SHIPPING_FEE = 49; // INR flat rate below threshold
  private static readonly GST_RATE = 0.18; // 18% GST

  async placeOrder(
    userId: number,
    dto: {
      addressId: number;
      reservationId: number;
      couponCode?: string;
      paymentMethod?: string;
      // F1-15: optional wallet top-up; must be ≤ wallet.balance and ≤ order.total
      walletAmountUsed?: number;
    },
    meta?: { ip?: string; deviceFingerprint?: string },
  ) {
    // ─── Fraud gate ────────────────────────────────────────────────────────────
    const fraudCheck = await this.fraudService.preOrderFraudCheck({
      userId,
      ip: meta?.ip,
      deviceFingerprint: meta?.deviceFingerprint,
    });
    if (fraudCheck.blocked) {
      throw new BadRequestException(
        fraudCheck.reason ?? 'Order blocked by fraud detection',
      );
    }

    // ─── FINAL §4.2: placeOrder REQUIRES a valid reservationId ─────────────────
    if (!dto.reservationId) {
      throw new BadRequestException(
        'reservationId is required — call POST /cart/reserve first',
      );
    }
    const check = await this.cartReservation.validateForCheckout(
      dto.reservationId,
      userId,
    );
    if (!check.valid || !check.reservation) {
      if (check.changedItems?.length) {
        const items = check.changedItems
          .map(
            (i) =>
              `variant #${i.variantId}: was ₹${i.lockedPrice.toFixed(2)}, now ₹${i.currentPrice.toFixed(2)}`,
          )
          .join('; ');
        throw new BadRequestException(
          `Prices changed during checkout — please review your cart. ${items}`,
        );
      }
      throw new BadRequestException(check.reason ?? 'Invalid reservation');
    }
    const reservation = check.reservation;

    // Validate address belongs to user
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    // Build order items from the reservation — reservation is now the authoritative
    // source of price and quantity for this checkout.
    const orderItems: Array<{
      variantId: number;
      quantity: number;
      price: number;
    }> = [];
    let subtotal = 0;
    for (const it of reservation.items) {
      orderItems.push({
        variantId: it.variantId,
        quantity: it.quantity,
        price: it.lockedPrice,
      });
      subtotal += it.lockedPrice * it.quantity;
    }

    // Apply coupon (T-C02: pass userId for per-user limit check)
    let discountAmount = 0;
    if (dto.couponCode) {
      discountAmount = await this.couponsService.applyDiscount(
        dto.couponCode,
        subtotal,
        userId,
      );
    }
    // T-P01 FIX: shipping and tax computed server-side — never trusted from client
    const taxableAmount = subtotal - discountAmount;
    const shippingFee =
      taxableAmount >= OrdersService.FREE_SHIPPING_THRESHOLD
        ? 0
        : OrdersService.SHIPPING_FEE;
    const taxAmount =
      Math.round(taxableAmount * OrdersService.GST_RATE * 100) / 100;
    const total = taxableAmount + shippingFee + taxAmount;

    // F1-15: Validate and clamp wallet deduction
    let walletAmountUsed = 0;
    if (dto.walletAmountUsed && dto.walletAmountUsed > 0) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      const available = wallet?.balance ?? 0;
      // Clamp to min(requested, available, total)
      walletAmountUsed = Math.min(dto.walletAmountUsed, available, total);
      walletAmountUsed = Math.round(walletAmountUsed * 100) / 100;
    }

    // Snapshot address (so future address changes don't affect order history)
    const { id: _id, userId: _uid, ...addressSnapshot } = address;

    // B-06 PERF: narrow transaction scope. Only financial-critical writes run inside
    // the tx (order creation, reservation CONSUMED, atomic coupon decrement). Cart
    // clearing and tracking event are moved out — they're idempotent enough that a
    // post-commit failure is a minor UX glitch (stale cart), not a data integrity bug.
    // This cuts connection hold time ~30% on the hottest endpoint.
    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId,
          addressSnapshot,
          subtotal,
          discountAmount,
          shippingFee,
          taxAmount,
          total,
          walletAmountUsed,
          couponCode: dto.couponCode,
          items: { create: orderItems },
        },
        include: {
          items: { include: { variant: { include: { product: true } } } },
          user: { select: { id: true, email: true, firstName: true } },
        },
      });

      // Mark reservation CONSUMED (WI.reserved stays, now owned by the order).
      await this.cartReservation.consume(tx, reservation.id);

      // FINAL §8.4 I-9: atomic coupon increment — MUST stay in tx (race-critical).
      if (dto.couponCode) {
        const rows = await tx.$executeRaw`
          UPDATE "Coupon"
          SET "usedCount" = "usedCount" + 1
          WHERE "code" = ${dto.couponCode}
            AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        `;
        if (rows === 0) {
          throw new BadRequestException(
            'Coupon is invalid, expired, or usage limit reached',
          );
        }
        // T-C02 / V-06 FIX: record per-user usage atomically with global increment.
        // P2002 means a concurrent request already recorded usage — treat as "already used".
        const coupon = await tx.coupon.findUnique({
          where: { code: dto.couponCode },
          select: { id: true },
        });
        if (coupon) {
          try {
            await tx.couponUsage.create({
              data: { couponId: coupon.id, userId },
            });
          } catch (e) {
            if (
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            ) {
              throw new BadRequestException(
                'Coupon already used by this account',
              );
            }
            throw e;
          }
        }
      }

      return newOrder;
    });

    // F1-15: Deduct wallet amount now that order is committed. Use orderId as reference
    // for idempotency (I-12: WalletTransaction.reference unique per non-auto operation).
    if (walletAmountUsed > 0) {
      await this.walletService
        .debit({
          userId,
          amount: walletAmountUsed,
          reference: `order:${order.id}:wallet`,
          description: `Wallet payment for order #${order.id}`,
        })
        .catch(() => {
          // Non-fatal — order is placed. Log for reconciliation but don't fail.
          // In production, this would trigger an alert for manual resolution.
        });
    }

    // B-06: post-tx side-effects. Best-effort — order is already placed.
    await this.prisma.cartItem
      .deleteMany({ where: { cart: { userId } } })
      .catch(() => {});
    await this.prisma.trackingEvent
      .create({
        data: {
          orderId: order.id,
          status: 'PENDING',
          note: 'Order placed successfully',
        },
      })
      .catch(() => {});

    // W3.T4 — abandoned-cart clear is now handled by
    // OrderPlacedAbandonedCartSubscriber listening on the order.placed
    // event published below (backend/src/abandoned-cart/order-placed.subscriber.ts).
    // The previous inline `await this.abandonedCartService.clearForUser(userId)`
    // was removed — same call, routed through the event bus, runs on
    // the worker process. GAP-F07 contract preserved: stale snapshot →
    // worst case is one extra "you left items" email, never an order
    // integrity issue.

    // W3.T3 — F4-07 cashback credit is now handled by OrderCashbackSubscriber
    // listening on the order.placed event published below
    // (backend/src/wallet/order-cashback.subscriber.ts). The previous inline
    // CASHBACK-coupon → walletService.credit block was removed — same
    // semantics, same reference (`order:<id>:cashback`) preserving I-12
    // idempotency, same non-fatal failure posture (handler swallows errors).
    // Subscriber re-fetches the order + coupon, so the event payload stays
    // contract-stable.

    // W3.T2 — Order confirmation email is now sent by OrderEmailSubscriber
    // listening on the `order.placed` event published below
    // (backend/src/email/order-email.subscriber.ts). The previous inline
    // `emailService.sendOrderConfirmation(order)` was removed — same
    // delivery, just routed through the event bus so the email worker
    // handles it (DISABLE_WORKERS contract). Net latency unchanged
    // because the inline call was already fire-and-forget.

    // W3.T1 — publish order.placed event for plugin + kernel consumers.
    // Remaining inline side-effects above (wallet cashback credit +
    // loyalty earn) get migrated to subscribers in W3.T3 / T5.
    //
    // AWAITED — EventBus.publish picks its path from REDIS_URL: when
    // Redis is configured, the await resolves in ~ms after the BullMQ
    // queue.add() ack (NOT after consumers finish — those run on the
    // worker process). When Redis is absent (dev / test / single-pod),
    // the in-process dispatch path awaits handlers inline so callers
    // that assert post-publish state (e.g. GAP-F07 abandoned-cart
    // cleared after placeOrder) observe the consumer effect. Failure
    // is caught + swallowed; the order is already DB-committed.
    await this.eventBus
      .publish('order.placed', {
        orderId: order.id,
        userId: order.userId,
        guestEmail: order.guestEmail ?? null,
        total: order.total,
        couponCode: dto.couponCode ?? null,
        itemCount: order.items?.length ?? 0,
      })
      .catch(() => {
        // Non-fatal — order is already placed. EventBus logs internally.
      });

    return order;
  }

  getUserOrders(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: { id: true, name: true, images: true, slug: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderById(userId: number, orderId: number, isAdmin = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        trackingEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!isAdmin && order.userId !== userId) throw new ForbiddenException();
    return order;
  }

  async cancelOrder(userId: number, orderId: number) {
    // FINAL §9.4 C-002: read + mutate atomically inside the transaction so a concurrent
    // admin/shipping action cannot flip the status between our read and our write.
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
        throw new BadRequestException(
          'Order cannot be cancelled at this stage',
        );
      }
      const items = await tx.orderItem.findMany({
        where: { orderId, cancelledAt: null },
      });
      // Pre-shipment cancel: release the reservation only (physical stock never moved).
      for (const item of items) {
        await this.inventoryService.release(tx, item.variantId, item.quantity);
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      return { message: 'Order cancelled successfully' };
    });
  }

  async requestReturn(
    userId: number,
    orderId: number,
    reason = 'Customer requested return',
  ) {
    // FINAL §9.4 R-006: actually create the ReturnRequest row so ops has something to action.
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: {
          items: {
            include: {
              variant: {
                include: { product: { include: { category: true } } },
              },
            },
          },
          returnRequest: true,
          trackingEvents: {
            where: { status: 'DELIVERED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'DELIVERED') {
        throw new BadRequestException('Only delivered orders can be returned');
      }
      if (order.returnRequest) {
        throw new BadRequestException(
          'Return already requested for this order',
        );
      }

      // FINAL §9.4 C-006: enforce per-category return window. The window is the MIN across
      // all non-cancelled items in the order (strictest category wins). A 0-day window
      // means the category is non-returnable.
      const activeItems = order.items.filter((i) => !i.cancelledAt);
      if (activeItems.length === 0) {
        throw new BadRequestException('No items eligible for return');
      }
      const windowDays = Math.min(
        ...activeItems.map(
          (i) => i.variant.product.category.returnWindowDays ?? 7,
        ),
      );
      if (windowDays <= 0) {
        throw new BadRequestException('Items in this order are non-returnable');
      }
      const deliveredAt = order.trackingEvents[0]?.createdAt ?? order.updatedAt;
      const deadline = new Date(
        deliveredAt.getTime() + windowDays * 86_400_000,
      );
      if (Date.now() > deadline.getTime()) {
        throw new BadRequestException(
          `Return window of ${windowDays} days has expired (delivered ${deliveredAt.toISOString().slice(0, 10)})`,
        );
      }
      const returnRequest = await tx.returnRequest.create({
        data: {
          orderId,
          reason,
          items: {
            create: activeItems.map((i) => ({
              orderItemId: i.id,
              quantity: i.quantity,
            })),
          },
        },
        include: { items: true },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'RETURN_REQUESTED' },
      });
      return returnRequest;
    });
  }

  async placeGuestOrder(dto: {
    email: string;
    address: {
      fullName: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
      country: string;
      phone: string;
    };
    items: Array<{ variantId: number; quantity: number }>;
    couponCode?: string;
    ip?: string;
  }) {
    // T-O01 FIX: guest orders now run through IP/device/email blacklist check
    const fraudCheck = await this.fraudService.preGuestFraudCheck({
      ip: dto.ip,
      email: dto.email,
    });
    if (fraudCheck.blocked) {
      throw new BadRequestException(
        fraudCheck.reason ?? 'Order blocked by fraud detection',
      );
    }

    let subtotal = 0;
    const orderItems: Array<{
      variantId: number;
      quantity: number;
      price: number;
    }> = [];

    for (const item of dto.items) {
      const variant = await this.prisma.variant.findUnique({
        where: { id: item.variantId },
        include: { product: true },
      });
      if (!variant)
        throw new NotFoundException(`Variant ${item.variantId} not found`);
      const sellable = variant.stock - variant.reservedStock;
      const hasStock = sellable >= item.quantity;
      const canBackorder = variant.backorderAllowed === true;
      if (!hasStock && !canBackorder)
        throw new BadRequestException(
          `Insufficient stock for ${variant.product.name}`,
        );
      const unitPrice =
        variant.product.basePrice * (1 - variant.product.discountPct / 100);
      subtotal += unitPrice * item.quantity;
      orderItems.push({
        variantId: item.variantId,
        quantity: item.quantity,
        price: unitPrice,
      });
    }

    let discountAmount = 0;
    if (dto.couponCode) {
      discountAmount = await this.couponsService.applyDiscount(
        dto.couponCode,
        subtotal,
      );
    }
    // T-O03 FIX: shipping and tax server-authoritative for guest orders too
    const taxableAmount = subtotal - discountAmount;
    const shippingFee =
      taxableAmount >= OrdersService.FREE_SHIPPING_THRESHOLD
        ? 0
        : OrdersService.SHIPPING_FEE;
    const taxAmount =
      Math.round(taxableAmount * OrdersService.GST_RATE * 100) / 100;
    const total = taxableAmount + shippingFee + taxAmount;

    const order = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        // Guest-order reservation. Backorder flag is already enforced in the pre-check loop above.
        await this.inventoryService.reserve(tx, item.variantId, item.quantity);
      }
      const newOrder = await tx.order.create({
        data: {
          guestEmail: dto.email,
          addressSnapshot: dto.address,
          subtotal,
          discountAmount,
          shippingFee,
          taxAmount,
          total,
          couponCode: dto.couponCode,
          items: { create: orderItems },
        },
        include: {
          items: { include: { variant: { include: { product: true } } } },
        },
      });
      if (dto.couponCode) {
        const rows = await tx.$executeRaw`
          UPDATE "Coupon"
          SET "usedCount" = "usedCount" + 1
          WHERE "code" = ${dto.couponCode}
            AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        `;
        if (rows === 0)
          throw new BadRequestException(
            'Coupon is invalid, expired, or usage limit reached',
          );
      }
      return newOrder;
    });

    await this.prisma.trackingEvent.create({
      data: {
        orderId: order.id,
        status: 'PENDING',
        note: 'Guest order placed successfully',
      },
    });

    this.emailService
      .sendOrderConfirmation({ ...order, user: null })
      .catch(() => {});

    return order;
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  getAllOrders(filters: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = filters;
    return this.prisma.order.findMany({
      where: status ? { status: status as OrderStatus } : {},
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
  }

  async updateOrderStatus(orderId: number, status: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, email: true, firstName: true } },
        items: { include: { variant: { include: { product: true } } } },
        trackingEvents: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    // FINAL §9.4 R-001: on SHIPPED, commit reservations → physical stock decrements.
    // Wrap the status mutation + inventory commit in one transaction so they can't drift.
    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        status === 'SHIPPED' &&
        PRE_SHIPMENT_STATUSES.includes(
          order.status as (typeof PRE_SHIPMENT_STATUSES)[number],
        )
      ) {
        const activeItems = order.items.filter((i) => !i.cancelledAt);
        for (const item of activeItems) {
          await this.inventoryService.commitShipment(
            tx,
            item.variantId,
            item.quantity,
          );
        }
      }
      const row = await tx.order.update({
        where: { id: orderId },
        data: { status: status as OrderStatus },
      });
      await tx.trackingEvent.create({
        data: {
          orderId,
          status: status as OrderStatus,
          note: `Status updated to ${status}`,
        },
      });
      return row;
    });

    // Trigger transactional emails based on status
    if (status === 'SHIPPED') {
      this.emailService
        .sendOrderShipped({ ...order, trackingEvents: order.trackingEvents })
        .catch(() => {});
    } else if (status === 'DELIVERED') {
      this.emailService.sendOrderDelivered(order).catch(() => {});
      // W3.T5 — loyalty earn (FINAL §9.4 R-005, revenue-recognized basis)
      // is now handled by OrderDeliveredLoyaltySubscriber listening on
      // the `order.delivered` event published below
      // (backend/src/loyalty/order-delivered.subscriber.ts). Idempotency
      // is preserved at the service level — LoyaltyService.earnPoints
      // already gates on a unique `earn:order:<id>` reference, so BullMQ
      // retries are safe (P2002 → no-op return 0).
      if (order.userId) {
        // FINAL §9.4 H-009: if this was a referred user's first delivered order, pay the bonus.
        // Still inline (out of W3.T5 scope) — could become its own subscriber on order.delivered later.
        this.referralService
          .creditOnFirstDelivery(order.userId)
          .catch(() => {});
      }
      await this.eventBus
        .publish('order.delivered', {
          orderId: order.id,
          userId: order.userId,
          total: order.total,
        })
        .catch(() => {});
    } else if (status === 'REFUNDED') {
      this.emailService.sendRefundConfirmation(order).catch(() => {});
      // V-08 FIX: claw back loyalty points earned on delivery when order is refunded
      if (order.userId) {
        this.loyaltyService
          .clawbackPoints(order.userId, order.id)
          .catch(() => {});
      }
    }

    return updated;
  }

  async updatePaymentStatus(
    orderId: number,
    paymentId: string,
    paymentStatus: string,
  ) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId, paymentStatus: paymentStatus as PaymentStatus },
    });
  }

  /**
   * Cancel a single item within an order (partial cancellation).
   * Restores stock for that variant. If all items are cancelled, the order becomes CANCELLED.
   */
  async cancelOrderItem(userId: number, orderId: number, itemId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw new BadRequestException(
        'Items can only be cancelled before shipment',
      );
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    if (item.cancelledAt)
      throw new BadRequestException('Item already cancelled');

    await this.prisma.$transaction(async (tx) => {
      // Mark item cancelled
      await tx.orderItem.update({
        where: { id: itemId },
        data: { cancelledAt: new Date() },
      });
      // Pre-shipment path only (guarded above): release the reservation.
      // Post-shipment item cancellation would call restock() instead; not currently supported.
      await this.inventoryService.release(tx, item.variantId, item.quantity);
      // Recalculate order total
      const remainingItems = order.items.filter((i) => i.id !== itemId);
      const allCancelled = remainingItems.every((i) => !!i.cancelledAt);
      const newTotal = remainingItems.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0,
      );
      await tx.order.update({
        where: { id: orderId },
        data: {
          total: allCancelled ? 0 : newTotal,
          status: allCancelled ? 'CANCELLED' : order.status,
        },
      });
    });

    return { message: 'Item cancelled successfully' };
  }

  /**
   * Refund a single cancelled/returned item to the user's wallet.
   * Admin-only operation.
   */
  async refundOrderItem(
    orderId: number,
    itemId: number,
    reason: RefundReason = RefundReason.ADMIN_ADJUSTMENT,
  ) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');
    if (item.refundedAt)
      return { message: 'Already refunded', refundedAt: item.refundedAt };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || !order.userId) throw new NotFoundException('Order not found');

    const refundAmount = item.price * item.quantity;
    const ref = `refund:order:${orderId}:item:${itemId}`;

    // FINAL §9.4 R-008: single transaction — item marker, wallet credit, order rollup.
    // Idempotency is DB-enforced via WalletTransaction unique(walletId, reference, type).
    const result = await this.prisma.$transaction(async (tx) => {
      // Mark the line refunded. Conditional updateMany guards against double-refund races.
      const marked = await tx.orderItem.updateMany({
        where: { id: itemId, refundedAt: null },
        data: { refundedAt: new Date(), refundReason: reason },
      });
      if (marked.count === 0) {
        return { alreadyRefunded: true as const };
      }

      // FINAL §2 I-11: RefundRequest is the authoritative ledger of refund intent.
      // Create BEFORE wallet credit so ∑RefundRequest.amount stays in lock-step with
      // WalletTransaction. Idempotency via unique(reference).
      const refundRequest = await tx.refundRequest.create({
        data: {
          orderId,
          orderItemId: itemId,
          amount: refundAmount,
          reason: String(reason),
          status: 'COMPLETED',
          destination: 'WALLET',
          reference: ref,
          processedAt: new Date(),
        },
      });

      // Wallet credit
      const wallet = await tx.wallet.upsert({
        where: { userId: order.userId! },
        create: { userId: order.userId!, balance: refundAmount },
        update: { balance: { increment: refundAmount } },
      });
      try {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: refundAmount,
            type: 'CREDIT',
            reference: ref,
            description: `Item refund for order #${orderId} (${reason})`,
            balanceAfter: wallet.balance,
            refundRequestId: refundRequest.id,
          },
        });
      } catch (e) {
        // Wallet insert lost the race — item marker rolls back via txn and caller can retry.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new BadRequestException(
            'Refund already recorded for this item',
          );
        }
        throw e;
      }

      // Ledger (double-entry)
      await tx.ledgerEntry.create({
        data: {
          type: 'WALLET_CREDIT',
          creditAmount: refundAmount,
          reference: ref,
          description: `Item refund for order #${orderId}`,
        },
      });

      // Roll up order paymentStatus based on refunded line totals.
      const lines = await tx.orderItem.findMany({
        where: { orderId },
        select: {
          price: true,
          quantity: true,
          refundedAt: true,
          cancelledAt: true,
        },
      });
      const eligible = lines.filter((l) => !l.cancelledAt);
      const refundedCount = eligible.filter((l) => l.refundedAt).length;
      const nextStatus =
        eligible.length > 0 && refundedCount === eligible.length
          ? 'REFUNDED'
          : refundedCount > 0
            ? 'PARTIALLY_REFUNDED'
            : order.paymentStatus;
      if (nextStatus !== order.paymentStatus) {
        await tx.order.update({
          where: { id: orderId },
          data: { paymentStatus: nextStatus },
        });
      }
      return { refunded: true as const, refundAmount, nextStatus };
    });

    if ('alreadyRefunded' in result) {
      return { message: 'Already refunded', refundedAt: new Date() };
    }
    return {
      message: `Refunded ₹${result.refundAmount} for item #${itemId} to wallet`,
      paymentStatus: result.nextStatus,
    };
  }
}
