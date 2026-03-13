import { Global, Module } from "@nestjs/common";
import { BullModule } from '@nestjs/bullmq'
import { INJECTION_TOKEN } from "src/common/constants/injection-token.constant";
import Redis from "ioredis";
import { OTPProcessor } from "./processors/otp.processor";
import { OTPProducer } from "./producers/otp.producer";
import { OTP_QUEUE } from "./jobs/otp.job";
import { MailModule } from "src/shared/mail/mail.module";
import { AppConfigService } from "src/config/config.service";

@Global()
@Module({
    imports: [
        MailModule,
        BullModule.registerQueueAsync(
            {
                name: OTP_QUEUE,
                inject: [AppConfigService],
                useFactory: (config: AppConfigService) => ({
                    connection: {
                        host: config.database.redisHost,
                        port: config.database.redisPort,
                        password: config.database.redisPassword || undefined,
                        db: config.database.redisDb,
                        maxRetriesPerRequest: null, 
                    },
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