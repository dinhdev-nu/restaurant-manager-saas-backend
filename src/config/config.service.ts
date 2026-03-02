import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ICorsConfig, IAppConfig, IJwtConfig, ILogConfig, IDatabaseConfig, IMailConfig, IClientConfig, IOAuth2Config } from "./configs";
import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

interface IConfigService {
    app: IAppConfig;
    isProduction: boolean;
    cors: ICorsConfig;
    corsOptions: CorsOptions;
    jwt: IJwtConfig;
    log: ILogConfig;
    database: IDatabaseConfig;
    mail: IMailConfig;
    client: IClientConfig;
    oauth2: IOAuth2Config;
}

// Wrap ConfigService — reads from registerAs namespaces
@Injectable()
export class AppConfigService implements IConfigService {
    constructor(
        private config: ConfigService
    ){}

    get app(): IAppConfig {
        return this.config.get<IAppConfig>('app')!;
    }

    get isProduction(): boolean {
        return this.app.nodeEnv === 'production';
    }

    get cors(): ICorsConfig {
        return this.config.get<ICorsConfig>('cors')!;
    }

    get corsOptions(): CorsOptions {
        const c = this.cors;
        return {
            origin: c.origin.split(','),
            methods: c.methods.split(','),
            allowedHeaders: c.allowedHeaders.split(','),
            credentials: c.credentials === 'true'
        };
    }

    get jwt(): IJwtConfig {
        return this.config.get<IJwtConfig>('jwt')!;
    }

    get log(): ILogConfig {
        return this.config.get<ILogConfig>('log')!;
    }

    get database(): IDatabaseConfig {
        return this.config.get<IDatabaseConfig>('database')!;
    }

    get mail(): IMailConfig {
        return this.config.get<IMailConfig>('mail')!;
    }

    get client(): IClientConfig {
        return this.config.get<IClientConfig>('client')!;
    }

    get oauth2(): IOAuth2Config {
        return this.config.get<IOAuth2Config>('oauth2')!;
    }
}
