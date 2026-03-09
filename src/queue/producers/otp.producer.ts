import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { OTP_QUEUE, OTPJobName, SendMailOTPJobData, SendSMSOTPJobData } from "../jobs/otp.job";
import { Queue } from "bullmq";

@Injectable()
export class OTPProducer {
    constructor(
        @InjectQueue(OTP_QUEUE) private readonly otpQueue: Queue
    ){}

    async sendMailOTP(data: SendMailOTPJobData) {
        return this.otpQueue.add(OTPJobName.SEND_MAIL_OTP, data, {
            attempts: 3, // Retry up to 3 times if the job fails
            backoff: { type: 'exponential', delay: 5000 }, 
            removeOnComplete: { count: 5 }, // Keep only the last 5 completed jobs
            removeOnFail: { count: 5 }, // Keep only the last 5 failed jobs
        })
    }

    async sendSMSOTP(data: SendSMSOTPJobData) {
        return this.otpQueue.add(OTPJobName.SEND_SMS_OTP, data, {
            attempts: 3, // Retry up to 3 times if the job fails
            backoff: { type: 'exponential', delay: 3000 }, 
            priority: 1, // Higher priority for SMS OTPs
            removeOnComplete: { count: 5 }, // Keep only the last 5 completed jobs
            removeOnFail: { count: 5 }, // Keep only the last 5 failed jobs
        })
    }
}