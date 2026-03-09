import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { OTP_QUEUE, OTPJobName, SendMailOTPJobData, SendSMSOTPJobData } from "../jobs/otp.job";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { MailService } from "src/shared/mail/mail.service";


@Processor(OTP_QUEUE,
    {
        concurrency: 5, // Process up to 5 jobs concurrently
    }
)
export class OTPProcessor extends WorkerHost {
    private readonly logger = new Logger(OTPProcessor.name);

    constructor(
        private readonly mail: MailService
    ) { super() }

    async process(job: Job): Promise<unknown> {
        switch (job.name) {
            case OTPJobName.SEND_MAIL_OTP:
                return this.handleSendMailOTP(job);
            case OTPJobName.SEND_SMS_OTP:
                return this.handleSendSMSOTP(job);
            default:
                this.logger.warn(`Received job with unknown name: ${job.name}`);
                return null;
        }
    }

    private async handleSendMailOTP(job: Job<SendMailOTPJobData>) {
        const { email, otp } = job.data;
        this.logger.log(`Processing SEND_MAIL_OTP job for email: ${email}`);
        try {
            await this.mail.sendOtpMail(email, 'Xác thực OTP', otp);
            this.logger.log(`Successfully sent OTP email to ${email}`);
            return { sent: true };
        } catch (error) {
            this.logger.error(`Failed to send OTP email to ${email}: ${error.message}`);
            throw error;
        }
    }

    private async handleSendSMSOTP(job: Job<SendSMSOTPJobData>) {
        const { phone, otp } = job.data;
        this.logger.log(`Processing SEND_SMS_OTP job for phone: ${phone}`);

        return { sent: true };
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.log(`Job completed: ${job.id} (${job.name})`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(`Job failed: ${job.id} (${job.name}) - ${error.message}`);
    }
}