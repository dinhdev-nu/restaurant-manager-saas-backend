import { randomInt } from 'crypto';
import { OTP_LENGTH } from '../constants/otp.const';


export const GenerateOTP = (): string => {
    const timePart = Date.now().toString().slice(- OTP_LENGTH / 2)
    const random = randomInt(0, 1000).toString().padStart(OTP_LENGTH / 2, "0")

    return random + timePart;
}


export const isValidOTP = (otp: string): boolean => {
    if (!otp || otp.length !== OTP_LENGTH) return false;

    return !isNaN(Number(otp));
}

export const CompareOTPs = (otp1: string, otp2: string): boolean => {
    return otp1 === otp2;
}
