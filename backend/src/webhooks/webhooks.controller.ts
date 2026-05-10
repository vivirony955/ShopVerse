import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/webhook.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post()
  create(@Body() dto: CreateEndpointDto) {
    return this.svc.createEndpoint(dto);
  }

  @Get()
  list() {
    return this.svc.listEndpoints();
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEndpointDto) {
    return this.svc.updateEndpoint(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteEndpoint(id);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDeliveries(id);
  }
}
