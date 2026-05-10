// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * D-04 / I-13: Create an Invoice row with an atomic sequential number.
   * Called after order transitions to CONFIRMED.
   * Idempotent — if Invoice already exists for orderId, returns existing row.
   *
   * India financial year: April → March.
   * Invoice format: INV/YYYY-YY/NNNNNN  e.g. INV/2026-27/000001
   */
  async createInvoiceRecord(orderId: number): Promise<void> {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existing) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      this.logger.warn(`createInvoiceRecord: order ${orderId} not found`);
      return;
    }

    const financialYear = this.getFinancialYear(new Date());

    // Atomic sequence increment using a transaction with row lock.
    await this.prisma.$transaction(async (tx) => {
      // Upsert the InvoiceSequence row so it exists before locking.
      await tx.$executeRaw`
        INSERT INTO "InvoiceSequence" ("financialYear", "lastSequence")
        VALUES (${financialYear}, 0)
        ON CONFLICT ("financialYear") DO NOTHING
      `;

      // Lock the row and increment atomically.
      const rows = await tx.$queryRaw<{ lastSequence: number }[]>`
        UPDATE "InvoiceSequence"
        SET "lastSequence" = "lastSequence" + 1
        WHERE "financialYear" = ${financialYear}
        RETURNING "lastSequence"
      `;

      const sequence = rows[0].lastSequence;
      const invoiceNumber = `INV/${financialYear}/${String(sequence).padStart(6, '0')}`;

      await tx.invoice.create({
        data: {
          orderId,
          invoiceNumber,
          financialYear,
          sequence,
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          shippingFee: order.shippingFee,
          taxAmount: order.taxAmount,
          total: order.total,
        },
      });
    });

    this.logger.log(
      `Invoice created for order #${orderId} (FY ${financialYear})`,
    );
  }

  /** India financial year: Apr 1 of year Y → Mar 31 of year Y+1 → "Y-(Y+1 short)" */
  private getFinancialYear(date: Date): string {
    const month = date.getMonth(); // 0-indexed
    const year = date.getFullYear();
    const fyStart = month >= 3 ? year : year - 1;
    const fyEndShort = String(fyStart + 1).slice(-2);
    return `${fyStart}-${fyEndShort}`;
  }

  async generateInvoice(
    userId: number,
    orderId: number,
    isAdmin = false,
  ): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
        invoice: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!isAdmin && order.userId !== userId) throw new ForbiddenException();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const violet = rgb(0.49, 0.23, 0.93);
    const black = rgb(0, 0, 0);
    const gray = rgb(0.5, 0.5, 0.5);

    let y = height - 60;

    // Header
    page.drawText('ShopVerse', {
      x: 50,
      y,
      size: 28,
      font: boldFont,
      color: violet,
    });
    y -= 20;
    page.drawText('Tax Invoice', { x: 50, y, size: 14, font, color: gray });

    // Order info
    y -= 40;
    const invoiceRef = order.invoice?.invoiceNumber ?? `ORD-${order.id}`;
    page.drawText(`Invoice: ${invoiceRef}`, {
      x: 50,
      y,
      size: 12,
      font: boldFont,
      color: black,
    });
    y -= 18;
    page.drawText(
      `Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`,
      { x: 50, y, size: 11, font, color: black },
    );
    y -= 18;
    page.drawText(
      `Status: ${order.status}  |  Payment: ${order.paymentStatus}`,
      { x: 50, y, size: 11, font, color: black },
    );

    // Bill to
    y -= 35;
    const snapshot = order.addressSnapshot as {
      fullName?: string;
      line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
    } | null;
    page.drawText('Bill To:', {
      x: 50,
      y,
      size: 12,
      font: boldFont,
      color: black,
    });
    y -= 18;
    const customerName = order.user
      ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`.trim()
      : (snapshot?.fullName ?? 'Guest');
    page.drawText(customerName, { x: 50, y, size: 11, font, color: black });
    if (snapshot?.line1) {
      y -= 16;
      page.drawText(snapshot.line1, { x: 50, y, size: 11, font, color: black });
    }
    if (snapshot?.city) {
      y -= 16;
      page.drawText(`${snapshot.city}, ${snapshot.state} ${snapshot.pincode}`, {
        x: 50,
        y,
        size: 11,
        font,
        color: black,
      });
    }

    // Table header
    y -= 35;
    page.drawRectangle({
      x: 50,
      y: y - 4,
      width: 495,
      height: 22,
      color: violet,
    });
    page.drawText('Item', {
      x: 58,
      y,
      size: 11,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    page.drawText('Qty', {
      x: 360,
      y,
      size: 11,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    page.drawText('Unit Price', {
      x: 400,
      y,
      size: 11,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    page.drawText('Total', {
      x: 495,
      y,
      size: 11,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // Items
    for (const item of order.items) {
      y -= 22;
      const name = item.variant.product.name.slice(0, 45);
      page.drawText(name, { x: 58, y, size: 10, font, color: black });
      page.drawText(String(item.quantity), {
        x: 360,
        y,
        size: 10,
        font,
        color: black,
      });
      page.drawText(`₹${item.price.toFixed(2)}`, {
        x: 400,
        y,
        size: 10,
        font,
        color: black,
      });
      page.drawText(`₹${(item.price * item.quantity).toFixed(2)}`, {
        x: 495,
        y,
        size: 10,
        font,
        color: black,
      });
    }

    // Totals
    y -= 30;
    page.drawLine({
      start: { x: 50, y: y + 10 },
      end: { x: 545, y: y + 10 },
      thickness: 0.5,
      color: gray,
    });
    page.drawText(`Subtotal: ₹${order.subtotal.toFixed(2)}`, {
      x: 380,
      y,
      size: 11,
      font,
      color: black,
    });
    if (order.discountAmount > 0) {
      y -= 18;
      page.drawText(`Discount: -₹${order.discountAmount.toFixed(2)}`, {
        x: 380,
        y,
        size: 11,
        font,
        color: black,
      });
    }
    if (order.shippingFee > 0) {
      y -= 18;
      page.drawText(`Shipping: ₹${order.shippingFee.toFixed(2)}`, {
        x: 380,
        y,
        size: 11,
        font,
        color: black,
      });
    }
    if (order.taxAmount > 0) {
      y -= 18;
      page.drawText(`Tax (GST): ₹${order.taxAmount.toFixed(2)}`, {
        x: 380,
        y,
        size: 11,
        font,
        color: black,
      });
    }
    y -= 20;
    page.drawText(`Total: ₹${order.total.toFixed(2)}`, {
      x: 380,
      y,
      size: 13,
      font: boldFont,
      color: violet,
    });

    // Footer
    page.drawText('Thank you for shopping with ShopVerse!', {
      x: 50,
      y: 40,
      size: 10,
      font,
      color: gray,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
