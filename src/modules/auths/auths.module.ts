import { Module } from '@nestjs/common';
import { AuthsService } from './auths.service';
import { AuthsController } from './auths.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './schema/user.schema';
import { SessionSchema } from './schema/session.schema';
import { JwtModule, JwtService } from '@nestjs/jwt';

@Module({

  imports: [
    JwtModule.registerAsync({ // async load config
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET || "access_secret",
        signOptions: { expiresIn: process.env.JWT_ACCESS_TTL || '2h' }
      })
    }),
    MongooseModule.forFeature([
    { name: "User", schema: UserSchema },
    { name: "Session", schema: SessionSchema }
  ])],

  controllers: [AuthsController],
  providers: [
    AuthsService,
    {
      provide: 'JWT_REFRESH_SECRET',
      useFactory: () => {
        return new JwtService({
          secret: process.env.JWT_REFRESH_SECRET || "refresh_secret",
          signOptions: { expiresIn: process.env.JWT_REFRESH_TTL || '7d' }
        })
      }
    }
  ],
})
export class AuthsModule {}
   