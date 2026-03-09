import { Types } from "mongoose";
export const OTP_QUEUE = 'otp_queue';
export enum OTPJobName {
    SEND_MAIL_OTP = 'send_mail_otp',
    SEND_SMS_OTP = 'send_sms_otp',
}

export interface SendMailOTPJobData {
    email: string;
    otp: string;
    ttl: number;
    userId: Types.ObjectId;
}

export interface SendSMSOTPJobData {
    phone: string;
    otp: string;
    ttl: number;
    userId: Types.ObjectId;
}

export type OTPJobData = SendMailOTPJobData | SendSMSOTPJobData;