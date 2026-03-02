import { registerAs } from "@nestjs/config";

export interface IMailConfig {
    service: string;
    user: string;
    pass: string;
}

export default registerAs('mail', () => ({
    service: process.env.SMTP_SERVICE,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
}))