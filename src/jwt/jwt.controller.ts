import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('jwt')
export class JwtController {
  constructor(private readonly jwtService: JwtService) { }

  @Post('register')
  async register(@Body() body: any) {
    return this.jwtService.register(body); // returns JWT without _id
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.jwtService.login(body.email, body.password); // returns JWT without _id
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req: any) {
    return { message: 'Protected route', user: req.user };
  }
}
