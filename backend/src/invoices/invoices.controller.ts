import { Controller, Get, Param, ParseIntPipe, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':orderId')
  async download(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const buffer = await this.invoicesService.generateInvoice(req.user.id, orderId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderId}.pdf"`);
    res.send(buffer);
  }
}
