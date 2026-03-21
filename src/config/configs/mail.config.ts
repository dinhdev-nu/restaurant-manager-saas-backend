import { registerAs } from "@nestjs/config";

export interface IMailConfig {
    service: string;
    host: string;
    port: number;
    user: string;
    pass: string;
}

export default registerAs('mail', () => ({
    service: process.env.SMTP_SERVICE,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
}))