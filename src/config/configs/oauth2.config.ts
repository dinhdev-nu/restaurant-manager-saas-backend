import { registerAs } from "@nestjs/config";

export interface IOAuth2Config {
    googleClientId: string;
    googleClientSecret: string;
    googleRedirectUri: string;
}

export default registerAs('oauth2', () => ({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
}))
