import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './schema/user.schema';
import { SessionSchema } from './schema/session.schema';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';

@Module({

  imports: [
    JwtModule,
    MongooseModule.forFeature([
    { name: "User", schema: UserSchema },
    { name: "Session", schema: SessionSchema }
  ]),
    MailModule
  ],

  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule]
})
export class AuthModule {}
   