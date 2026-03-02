import { registerAs } from "@nestjs/config";

export interface IAppConfig {
    nodeEnv: string;
    host: string;
    port: number;
}
export default registerAs('app', () => ({
    nodeEnv: process.env.NODE_ENV,
    host: process.env.HOST,
    port: Number(process.env.PORT),
}))
