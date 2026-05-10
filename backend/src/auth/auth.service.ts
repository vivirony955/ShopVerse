import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(email: string, password: string, firstName?: string, lastName?: string) {
    const existing = await this.usersService.findOneByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({ email, password: hashedPassword, firstName, lastName });
    const { password: _, ...result } = user;
    return result;
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) return null;

    // H2-01: account lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new BadRequestException(
        `Account temporarily locked. Try again in ${mins} minute(s).`,
      );
    }

    const valid = await bcrypt.compare(pass, user.password);

    if (!valid) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      // Lock for 15 min after 5th failure; extend to 60 min after 8th
      const lockout =
        attempts >= 8 ? new Date(Date.now() + 60 * 60 * 1000) :
        attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) :
        null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 }, lockedUntil: lockout },
      });
      return null;
    }

    // Reset on successful login
    if ((user.failedLoginAttempts ?? 0) > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const { password, ...result } = user;
    return result;
  }

  async login(user: any) {
    // V-10 FIX: include tokenVersion in payload so refresh tokens are tied to a
    // specific password epoch. When password changes, tokenVersion increments and
    // all previously issued refresh tokens become invalid.
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    const tv = dbUser?.tokenVersion ?? 0;
    const payload = { username: user.email, sub: user.id, role: user.role, tv };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      // V-10 FIX: validate tokenVersion against DB — if password changed since
      // this refresh token was issued, payload.tv will be stale → reject.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true, role: true },
      });
      if (!user || user.tokenVersion !== payload.tv) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
      const newAccessToken = this.jwtService.sign(
        { username: payload.username, sub: payload.sub, role: user.role, tv: user.tokenVersion },
        { expiresIn: '15m' },
      );
      return { access_token: newAccessToken };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * V-10: Change password. Verifies current password, hashes new one, and increments
   * tokenVersion to invalidate all currently active refresh tokens for this user.
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        tokenVersion: { increment: 1 },
      },
    });
    return { message: 'Password changed successfully. Please log in again.' };
  }
}
