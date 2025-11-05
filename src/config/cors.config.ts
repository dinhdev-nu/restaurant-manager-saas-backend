import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

export const corsOptions: CorsOptions = {
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:4028"],
    methods: process.env.CORS_METHODS?.split(",") || ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true,
}