import { Module } from '@nestjs/common';
import { AuthsService } from './auths.service';
import { AuthsController } from './auths.controller';
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

  controllers: [AuthsController],
  providers: [AuthsService],
  exports: [AuthsService, JwtModule]
})
export class AuthsModule {}
   