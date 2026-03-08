import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import * as nodemailer from "nodemailer"
import * as path from 'path';
import { AppConfigService } from 'src/config/config.service';

@Injectable()
export class MailService {

  private transporter: nodemailer.Transporter;

  constructor(
    private readonly config: AppConfigService
  ) {

    this.transporter = nodemailer.createTransport({
      service: this.config.mail.service,
      auth: {
        user: this.config.mail.user,
        pass: this.config.mail.pass,
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
      from: this.config.mail.user,
      to,
      subject,
      html
    })

  }


}
