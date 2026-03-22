import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { AppConfigService } from 'src/config/config.service';
import * as sgMail from '@sendgrid/mail';

// @Injectable()
// export class MailService {

//   constructor( 
//     private readonly mailer: MailerService,
//     private readonly config: AppConfigService
//   ) {}

//   async sendOtpMail(to: string, subject: string, otp: string) {
//     // Tim template o ca runtime src va dist
//     let html = await this.getTemplate('otp.template.html');

//     // Replace OTP
//     html = html.replace('{{.otp}}', otp);

//     // Gửi email
//     await this.mailer.sendMail({
//       from: this.config.mail.user,
//       to,
//       subject,
//       html
//     })
//   }

//   private async getTemplate(templateName: string): Promise<string> {
//     const templateDir = path.join(__dirname, 'templates', templateName);
//     console.log('Looking for email template at:', templateDir);
//     if (!existsSync(templateDir)) {
//       console.error(`Email template "${templateName}" not found`);
//     }

//     return readFileSync(templateDir, 'utf-8');
//   }
// }

@Injectable()
export class MailService {
  constructor( private readonly config: AppConfigService ) {
    sgMail.setApiKey(this.config.mail.sendgridApiKey);
  }

    async sendOtpMail(to: string, subject: string, otp: string) {
      // Tim template o ca runtime src va dist
      let html = await this.getTemplate('otp.template.html');
      // Replace OTP
      html = html.replace('{{.otp}}', otp);
      const msg = {
        to,
        from: this.config.mail.sendgridSender,
        subject,
        html,
      };
      try {
        await sgMail.send(msg);
      } catch (error) {
        console.error(`Failed to send OTP email to ${to}:`, error);
        throw error;
      }
    }

    private async getTemplate(templateName: string): Promise<string> {
      const templateDir = path.join(__dirname, 'templates', templateName);
      console.log('Looking for email template at:', templateDir);
      if (!existsSync(templateDir)) {
        console.error(`Email template "${templateName}" not found`);
      }

      return readFileSync(templateDir, 'utf-8');
   }
}
