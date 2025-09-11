import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'rishabhcahnd188@gmail.com',
        pass: 'gegs fwcb qbdq jxro',
      },
    });
  }

  async sendOtp(email: string, otp: string) {
    const mailOptions = {
      from: '"My App" <rishabhcahnd188@gamil.com>', // sender address
      to: email,
      subject: 'OTP for Password Reset',
      text: `Your OTP is: ${otp}`,
    };

    const info = await this.transporter.sendMail(mailOptions);
    console.log('OTP sent to email:', email);
    return info;
  }
}
