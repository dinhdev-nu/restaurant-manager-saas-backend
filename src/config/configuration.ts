
// export function
export default () => ({
    server: {
        nodeEnv : process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT!, 10) || 3000,
        host: process.env.HOST || 'localhost',
    },

    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: process.env.CORS_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE',
    }, 

    jwt: {
        access_secret: process.env.JWT_ACCESS_SECRET || "accecc_secret_key",
        access_ttl : process.env.JWT_ACCESS_TTL || "15m", // 15 minutes
        refresh_secret: process.env.JWT_REFRESH_SECRET || "refresh_secret_key",
        refresh_ttl : process.env.JWT_REFRESH_TTL || "7d", // 7 days
    },

    log: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || 'logs',
        file_name: process.env.LOG_FILE_NAME || 'log_xxx.log',
        max_size: parseInt(process.env.LOG_MAX_SIZE!, 10) || 5, // 5MB
    },

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT!, 10) || 6379,
        database: parseInt(process.env.REDIS_DB!, 10) || 1,
    },

    mongodb: {
        uri: process.env.MONGODB_URI,
    },

    mail: {
        service: process.env.MAIL_SERVICE || 'gmail',
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },

    google: {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    },

    client: {
        url: process.env.CLIENT_URL || 'http://localhost:4028',
    },

    vietQr: {
        bank_id: parseInt(process.env.BANK_ID!, 10) || 970436,
        account_no: process.env.ACCOUNT_NO || '1234567890',
        template: process.env.TEMPLATE || 'John Doe',
    }
})