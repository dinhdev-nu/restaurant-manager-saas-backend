import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { AppConfigService } from 'src/config/config.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        transport: {
          host: config.mail.host,
          port: config.mail.port,
          secure: config.mail.port === 465, // Use secure connection for port 465
          auth: {
            user: config.mail.user,
            pass: config.mail.pass,
          },
          tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
          }
        },
        defaults: {
          from: `"No Reply" <${config.mail.user}>`,
        }
      })
    })
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
