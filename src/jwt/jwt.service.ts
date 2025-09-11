import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class JwtService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: NestJwtService,
  ) { }

  // ✅ Register without MongoDB _id
  async register(userDto: any) {
    const hashedPassword = await bcrypt.hash(userDto.password, 10);
    const user = await this.usersService.create({ ...userDto, password: hashedPassword });

    const payload = { email: user.email, username: user.username }; // safe fields only
    return {
      message: 'User registered successfully',
      access_token: this.jwtService.sign(payload),
    };
  }

  // ✅ Login without MongoDB _id
  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.email, username: user.username }; // no MongoDB _id
    return {
      message: 'Login successful',
      access_token: this.jwtService.sign(payload),
    };
  }

  // ✅ Validate token
  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
