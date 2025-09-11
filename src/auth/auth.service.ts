import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Auth, AuthDocument } from './auth.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Auth.name) private authModel: Model<AuthDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailerService: MailerService,
  ) { }

  // --- Signup ---
  async createUser(data: Partial<Auth>): Promise<Auth> {
    if (!data.password) throw new BadRequestException('Password is required');

    const existingUser = await this.authModel.findOne({ email: data.email });
    if (existingUser) throw new BadRequestException('Email already exists');

    const existingPhone = await this.authModel.findOne({ phone: data.phone });
    if (existingPhone) throw new BadRequestException('Phone already exists');

    const salt = await bcrypt.genSalt();
    data.password = await bcrypt.hash(data.password, salt);

    const user = new this.authModel(data);
    return user.save();
  }

  // --- Login ---
  async login(email: string, password: string) {
    const user = await this.authModel.findOne({ email });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new UnauthorizedException('Invalid password');

    const payload = { sub: user._id, email: user.email };
    const token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') || '1h',
    });

    return { message: 'Login successful', token };
  }

  // --- Get All Users ---
  async getAllUsers(): Promise<Auth[]> {
    return this.authModel.find().select('-password -otp -otpExpiry').exec();
  }

  // --- Get User by ID ---
  async getUserById(id: string): Promise<Auth> {
    const user = await this.authModel.findById(id).select('-password -otp -otpExpiry').exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // --- Update User ---
  async updateUser(id: string, data: Partial<Auth>): Promise<Auth> {
    if (data.password) delete data.password; // prevent updating password here
    const updated = await this.authModel.findByIdAndUpdate(id, data, { new: true }).select('-password -otp -otpExpiry');
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  // --- Delete User ---
  async deleteUser(id: string) {
    const deleted = await this.authModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('User not found');
    return { message: 'User deleted successfully' };
  }

  // --- Send OTP ---
  async sendOtp(email: string) {
    const user = await this.authModel.findOne({ email });
    if (!user) throw new NotFoundException('User not found');

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    user.otp = otp;
    user.otpExpiry = expiry;
    await user.save();

    await this.mailerService.sendOtp(email, otp);
    return { message: 'OTP sent successfully' };
  }

  // --- Verify OTP ---
  async verifyOtp(email: string, otp: string) {
    const user = await this.authModel.findOne({ email });
    if (!user) throw new NotFoundException('User not found');

    if (!user.otp || !user.otpExpiry) throw new BadRequestException('OTP not sent');
    if (user.otpExpiry < new Date()) throw new BadRequestException('OTP expired');
    if (user.otp !== otp) throw new BadRequestException('Invalid OTP');

    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return { message: 'OTP verified successfully' };
  }

  // --- Reset Password ---
  async resetPassword(email: string, newPassword: string) {
    const user = await this.authModel.findOne({ email });
    if (!user) throw new NotFoundException('User not found');

    if (!newPassword) throw new BadRequestException('New password is required');

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return { message: 'Password reset successfully' };
  }
}
