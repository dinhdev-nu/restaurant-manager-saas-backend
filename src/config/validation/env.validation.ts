import { plainToInstance } from "class-transformer";
import { IsEnum, IsInt, IsString, Max, Min, validateSync } from "class-validator";


export enum Environment {
    DEVELOPMENT = 'development',
    PRODUCTION = 'production',
    TEST = 'test',
    PROVISION = 'provision',
}

export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug',
    VERBOSE = 'verbose',
}

export class EnvironmentVariables {
    @IsEnum(Environment)
    NODE_ENV: Environment;

    @IsString()
    HOST: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    PORT: number;

    @IsInt()
    @Min(1)
    THROTTLE_TTL: number;

    @IsInt()
    @Min(1) 
    THROTTLE_LIMIT: number;

    @IsInt()
    @Min(0)
    THROTTLE_BLOCK_DURATION: number;

    @IsInt()
    @Min(1)
    THROTTLE_DEFAULT_TTL: number;

    @IsInt()
    @Min(1)
    THROTTLE_DEFAULT_LIMIT: number;

    @IsInt()
    @Min(0)
    THROTTLE_DEFAULT_BLOCK_DURATION: number;
    
    @IsString()
    CORS_ORIGIN: string;

    @IsString()
    CORS_METHODS: string;

    @IsString()
    CORS_ALLOWED_HEADERS: string;

    @IsString()
    CORS_CREDENTIALS: string;

    @IsString()
    JWT_ACCESS_SECRET: string;
    
    @IsString()
    JWT_ACCESS_TTL: string;

    @IsString()
    JWT_REFRESH_SECRET: string;

    @IsString()
    JWT_REFRESH_TTL: string;

    @IsEnum(LogLevel)
    LOG_LEVEL: LogLevel;

    @IsString()
    LOG_DIR: string;

    @IsString()
    LOG_FILE_NAME: string;

    @IsInt()
    LOG_MAX_SIZE_MB: number;

    @IsInt()
    @Min(1) 
    LOG_MAX_FILES_DAYS: number;

    @IsString()
    REDIS_HOST: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    REDIS_PORT: number;

    @IsInt()
    @Min(0)
    REDIS_DB: number;

    @IsString()
    MONGO_URI: string;  

    @IsString()
    SMTP_SERVICE: string;

    @IsString()
    SMTP_HOST: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    SMTP_PORT: number;

    @IsString()
    SMTP_USER: string;

    @IsString()
    SMTP_PASSWORD: string;

    @IsString()
    SENDGRID_SENDER: string;

    @IsString()
    SENDGRID_API_KEY: string;

    @IsString()
    GOOGLE_CLIENT_ID: string;

    @IsString()
    GOOGLE_CLIENT_SECRET: string;

    @IsString()
    GOOGLE_REDIRECT_URI: string;

    @IsString()
    CLIENT_URL: string;

    @IsInt()
    @Min(1)
    @Max(999999)
    PAYMENT_BANK_ID: number;

    @IsString()
    PAYMENT_ACCOUNT_NUMBER: string;

    @IsString()
    PAYMENT_TEMPLATE: string;
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(
        EnvironmentVariables,
        config, // Convert plain object to class instance
        { enableImplicitConversion: true } // Convert Types
    )
    const errors = validateSync(validatedConfig, { skipMissingProperties: false });
    if (errors.length > 0) {
        throw new Error(`Config validation error: ${errors.map(e => e.toString()).join('\n')}`);
    }

    return validatedConfig;
}