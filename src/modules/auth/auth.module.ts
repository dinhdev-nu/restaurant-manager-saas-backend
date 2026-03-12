import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../../shared/mail/mail.module';
import { User, UserSchema } from './schema/user.xxx.schema';
import { UserSession, UserSessionSchema } from './schema/user_session.xxx.schema';
import { AuthController } from './auth.controller.xxx';
import { AuthService } from './auth.service.xxx';
import { OAuthProvider, OAuthProviderSchema } from './schema/oauth_provider.xxx.schema';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { UserRepository } from './repositories/user.repository';
import { SessionRepository } from './repositories/session.repository';
import { OAuthProviderRepository } from './repositories/oauth-provider.repository';

@Module({

  imports: [
    JwtModule,
    MongooseModule.forFeature([
    { name: User.name, schema: UserSchema },
    { name: UserSession.name, schema: UserSessionSchema },
    { name: OAuthProvider.name, schema: OAuthProviderSchema }
  ]),
    MailModule
  ],

  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: INJECTION_TOKEN.USER_REPOSITORY,
      useClass: UserRepository
    },
    {
      provide: INJECTION_TOKEN.SESSION_REPOSITORY,
      useClass: SessionRepository
    },
    {
      provide: INJECTION_TOKEN.OAUTH_PROVIDER_REPOSITORY,
      useClass: OAuthProviderRepository
    }
  ],
  exports: [AuthService, JwtModule]
})
export class AuthModule {}
   