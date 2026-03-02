import { registerAs } from "@nestjs/config";

export interface ILogConfig {
    level: string;
    dir: string;
    fileName: string;
    maxSize: number;
}

export default registerAs('log', () => ({
    level: process.env.LOG_LEVEL,
    dir: process.env.LOG_DIR,
    fileName: process.env.LOG_FILE_NAME,
    maxSize: Number(process.env.LOG_MAX_SIZE_MB),
}))