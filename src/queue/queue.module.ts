import { Global, Module } from "@nestjs/common";
import { BullModule } from '@nestjs/bullmq'
import { INJECTION_TOKEN } from "src/common/constants/injection-token.constant";
import Redis from "ioredis";
import { OTPProcessor } from "./processors/otp.processor";
import { OTPProducer } from "./producers/otp.producer";
import { OTP_QUEUE } from "./jobs/otp.job";
import { MailModule } from "src/shared/mail/mail.module";

@Global()
@Module({
    imports: [
        MailModule,
        BullModule.registerQueueAsync(
            {
                name: OTP_QUEUE,
                inject: [INJECTION_TOKEN.REDIS_CLIENT],
                useFactory: (redis: Redis) => ({
                    connection: redis as any,
                    defaultJobOptions: {
                        attempts: 2,
                        removeOnComplete: true,
                        removeOnFail: true,
                    }
                })
            }
        )
    ],
    providers: [
        OTPProducer,
        OTPProcessor
    ],
    exports: [
        OTPProducer
    ]
})
export class QueueModule {}