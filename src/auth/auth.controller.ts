import { Controller, Body, Post, Get, Put, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../jwt/jwt-auth.guard';
import { Auth } from './auth.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('signup')
  async signup(@Body() data: Partial<Auth>) {
    return this.authService.createUser(data); // returns saved user (without token)
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password); // returns token
  }

  @UseGuards(JwtAuthGuard)
  @Get('users')
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Post('send-otp')
  async sendOtp(@Body('email') email: string) {
    return this.authService.sendOtp(email);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyOtp(body.email, body.otp);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { email: string; newPassword: string }) {
    return this.authService.resetPassword(body.email, body.newPassword);
  }
}
