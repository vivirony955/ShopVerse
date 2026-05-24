// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { AuthenticatedRequest } from '../common/types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  // ─── Addresses ─────────────────────────────────────────────────────────────

  @Get('me/addresses')
  getAddresses(@Req() req: AuthenticatedRequest) {
    return this.usersService.getAddresses(req.user.id);
  }

  @Post('me/addresses')
  addAddress(@Req() req: AuthenticatedRequest, @Body() dto: CreateAddressDto) {
    return this.usersService.addAddress(req.user.id, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(req.user.id, id, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.deleteAddress(req.user.id, id);
  }

  @Patch('me/addresses/:id/default')
  setDefaultAddress(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.setDefaultAddress(req.user.id, id);
  }
}
