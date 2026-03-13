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
    // Tim template o ca runtime src va dist
    const candidates = [
      path.join(__dirname, 'templates', 'otp-register.html'),
      path.join(process.cwd(), 'src', 'shared', 'mail', 'templates', 'otp-register.html'),
      path.join(process.cwd(), 'dist', 'shared', 'mail', 'templates', 'otp-register.html'),
    ];

    const templatePath = candidates.find((p) => existsSync(p));
    if (!templatePath) {
      throw new Error(`OTP template not found. Checked: ${candidates.join(', ')}`);
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
