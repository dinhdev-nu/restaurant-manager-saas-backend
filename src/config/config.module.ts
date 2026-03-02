import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./validation/env.validation";
import { appConfig, clientConfig, corsConfig, databaseConfig, jwtConfig, oauth2Config, logConfig, mailConfig } from "./configs";
import { AppConfigService } from "./config.service";

// Wrap ConfigModule 
@Global()
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: `.env`,
            validate, // Validate env raw and convert to class instance
            load: [ 
                appConfig, clientConfig, corsConfig, mailConfig,
                databaseConfig, jwtConfig, oauth2Config, logConfig
            ]
        })
    ],
    providers: [AppConfigService],
    exports: [AppConfigService]
})
export class AppConfigModule {}