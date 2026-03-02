import { registerAs } from "@nestjs/config";

export interface ICorsConfig {
    origin: string;
    methods: string;
    allowedHeaders: string;
    credentials: string;
}

export default registerAs('cors', () => ({
    origin: process.env.CORS_ORIGIN,
    methods: process.env.CORS_METHODS,
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS,
    credentials: process.env.CORS_CREDENTIALS,
}))