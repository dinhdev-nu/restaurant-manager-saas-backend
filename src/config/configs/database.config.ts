import { registerAs } from "@nestjs/config";

export interface IDatabaseConfig {
    mongodbUri: string;
    redisHost: string;
    redisPort: number;
    redisPassword?: string;
    redisDb: number;
}

export default registerAs('database', () => ({
    mongodbUri: process.env.MONGO_URI,

    redisHost: process.env.REDIS_HOST,
    redisPort: Number(process.env.REDIS_PORT),
    redisPassword: process.env.REDIS_PASSWORD,
    redisDb: Number(process.env.REDIS_DB),
}))