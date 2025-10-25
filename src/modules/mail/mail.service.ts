import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import * as nodemailer from "nodemailer"
import * as path from 'path';

@Injectable()
export class MailService {

  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      }
    })
  }

  async sendOtpMail(to: string, subject: string, otp: string) {
    // Đọc file html
    let templatePath = path.join(__dirname, 'templates', 'otp-register.html');
    if(!existsSync(templatePath)) {
      templatePath = path.join(process.cwd(), 'src', 'modules', 'mail', 'templates', 'otp-register.html');
    }
    let html = readFileSync(templatePath, 'utf-8');

    // Replace OTP
    html = html.replace('{{.otp}}', otp);

    // Gửi email
    await this.transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      html
    })

  }


}
