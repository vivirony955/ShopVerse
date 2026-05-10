import {
  Controller, Get, Patch, Post, Delete,
  Body, Param, UseGuards, Req, ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@Req() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  // ─── Addresses ─────────────────────────────────────────────────────────────

  @Get('me/addresses')
  getAddresses(@Req() req: any) {
    return this.usersService.getAddresses(req.user.id);
  }

  @Post('me/addresses')
  addAddress(@Req() req: any, @Body() dto: CreateAddressDto) {
    return this.usersService.addAddress(req.user.id, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(req.user.id, id, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteAddress(req.user.id, id);
  }

  @Patch('me/addresses/:id/default')
  setDefaultAddress(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.setDefaultAddress(req.user.id, id);
  }
}
