import { randomInt } from 'crypto';

export const OTP_LENGTH = 6;

export const OtpUtils = {
    generateOTP: (): string => {
        const timePart = Date.now().toString().slice(- OTP_LENGTH / 2)
        const random = randomInt(0, 1000).toString().padStart(OTP_LENGTH / 2, "0")

        return random + timePart;
    },

    isValidOTP: (otp: string): boolean => {
        if (!otp || otp.length !== OTP_LENGTH) return false;

        return !isNaN(Number(otp));
    },

    isEqual: (otp1: string, otp2: string): boolean => {
        return otp1 === otp2;
    }


} as const;