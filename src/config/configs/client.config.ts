import { registerAs } from "@nestjs/config";

export interface IClientConfig {
    clientUrl: string;

    bankId: number;
    accountNo: string;
    template: string;
}

export default registerAs('client', () => ({
    clientUrl: process.env.CLIENT_URL,

    bankId: Number(process.env.PAYMENT_BANK_ID),
    accountNo: process.env.PAYMENT_ACCOUNT_NUMBER,
    template: process.env.PAYMENT_TEMPLATE,
}))

