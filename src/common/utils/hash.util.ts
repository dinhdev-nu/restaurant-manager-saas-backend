import * as bycrypt from "bcrypt"

const SALT_ROUNDS = 10;

export const HashUtil = {
    async generateSalt(): Promise<string> {
        return bycrypt.genSalt(SALT_ROUNDS);
    },
    async hash(plainText: string): Promise<string> {
        return bycrypt.hash(plainText, SALT_ROUNDS);
    },
    async hashWithSalt(plainText: string, salt: string): Promise<string> {
        return bycrypt.hash(plainText, salt);
    },
    async compare(plainText: string, hash: string): Promise<boolean> {
        return bycrypt.compare(plainText, hash);
    }
} as const