import { Inject, Injectable } from "@nestjs/common";
import { INJECTION_TOKEN } from "src/common/constants/injection-token.constant";
import { IUserRepository } from "./repositories/user.repository";
import { CheckEmailDTO, LoginDTO, RegisterDTO, ResendOTPDTO, VerifyOTPDTO } from "./dto/auth.dto";
import { BadRequestException, ConflictException, ForbiddenException, InternalServerException, NotFoundException, TooManyRequestException, UnauthorizedException } from "src/common/exceptions";
import { ERROR_CODE } from "src/common/constants/error-code.constant";
import { HashUtil } from "src/common/utils/hash.util";
import { OtpUtils } from "src/common/utils/otp.util";
import { Connection, Types } from "mongoose";
import Redis from "ioredis";
import { OTPProducer } from "src/queue/producers/otp.producer";
import { UserDocument } from "./schema/user.xxx.schema";
import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { AppConfigService } from "src/config/config.service";
import { ISessionRepository } from "./repositories/session.repository";
import { TimeUtil } from "src/common/utils/time.util";
import { DeviceInfo, UserSessionDocument } from "./schema/user_session.xxx.schema";
import { IOAuthProviderRepository } from "./repositories/oauth-provider.repository";
import { InjectConnection } from "@nestjs/mongoose";

const OTP_EMAIL_PREFIX = "otp:email_verify:"
const LOGIN_FAILED_PREFIX = "login:fail:"
const SESSION_PREFIX = "session:"
const PENDING_2FA_PREFIX = "2fa:pending:"
const OTP_2FA_FAIL_PREFIX = "2fa:fail:"
export const JWT_BLACKLIST_PREFIX = "jwt:blacklist:";

const RORATE_LOCK_PREFIX = "rotate_lock:";
const RORATE_RESULT_PREFIX = "rotate_result:";

const OTP_PWRESET_PREFIX = "otp:pwreset:";
const PWRESET_SESSION_PREFIX = "pwreset:session:";
const PWRESET_GRANT_PREFIX = "pwreset:grant:";
const RATELIMIT_CHANGE_PW_PREFIX = "rate:change_pw:";

const RATELIMIT_SMS_PREFIX = "rate:sms:";
const OTP_PHONE_VERIFY_PREFIX = "otp:phone_verify:";

const OAUTH_STATE_PREFIX = "oauth:state:"

interface PENDING_2FA_DATA {
    user_id: string;
    ip: string | null;
    remember_me: boolean;
    device_info: DeviceInfo | null;
    send_to: string; // email or phone number
}
const OTP_EXPIRATION_TIME = 5 * 60; // 5 minutes
const OTP_2FA_PREFIX = "otp:2fa:";
type OTPValue = {
    otpHash: string;
    attempt: number;
}
export interface AccessTokenPayload {
    sub: Types.ObjectId; // user id
    system_role: 'user' | 'admin';
    jti: string;
    iat: number;
    exp: number;
}

interface SessionData {
    user_id: Types.ObjectId;
    system_role: 'user' | 'admin';
    remember_me: boolean;
}

interface RefreshTokenPayload extends AccessTokenPayload {
    version: number;
}

interface GoogleTokenResponse {
    access_token: string;
    refresh_token?: string;
    id_token: string;
    expires_in: number;
    token_type: string;
}

interface OAuthStateData {
    provider: string;
    pkce_verifier: string;
}

const REFRESH_TTL_NOT_REMEMBER = "24h"; // 24 hours

@Injectable()
export class AuthService {
    constructor(
        @Inject(INJECTION_TOKEN.USER_REPOSITORY) 
        private readonly userRepository: IUserRepository,

        @Inject(INJECTION_TOKEN.SESSION_REPOSITORY)
        private readonly sessionRepository: ISessionRepository,

        @Inject(INJECTION_TOKEN.OAUTH_PROVIDER_REPOSITORY)
        private readonly providerRepository: IOAuthProviderRepository,

        @Inject(INJECTION_TOKEN.REDIS_CLIENT)
        private readonly redis: Redis,

        @InjectConnection() 
        private readonly  conn: Connection,

        private readonly config: AppConfigService,

        private readonly jwt: JwtService,

        private readonly otpProducer: OTPProducer
    ) {}

    async checkEmailExist(dto: CheckEmailDTO): 
    Promise<{ available: boolean, acction?: string, hint?: string }> 
    {
        const user = await this.userRepository.findUserExistByEmail(dto.email);
        if (user === null) { 
            return { available: true }
        }
        
        if (user.status === 'pending') {
            return { available: false , acction: 'resend_otp', hint: dto.email }
        } else if (['active', 'inactive', 'banned'].includes(user.status)) {
            throw new ConflictException( ERROR_CODE.USER_EXISTS, `Email ${dto.email} đã tồn tại` )
        }

        return { available: true }
    }

    async register(dto: RegisterDTO): 
    Promise<{ message: string, acction?: string, hint?: string }> 
    {
        // Check user exist again
        const userExist = await this.checkEmailExist({ email: dto.email });
        if (!userExist.available) {
            return { message: "User pending", acction: "resend_otp", hint: userExist.hint };
        }

        // Check phone exist
        if (dto.phone) {
            const phoneExist = await this.userRepository.findUserExistByPhone(dto.phone);
            if (phoneExist) {
                throw new ConflictException(
                    ERROR_CODE.USER_EXISTS, `Số điện thoại ${dto.phone} đã tồn tại`
                )
            }
        }

        // Hash password
        const hashedPassword = await HashUtil.hash(dto.password);
        // Create User 
        const user = await this.userRepository.create({
            email: dto.email,
            password_hash: hashedPassword,
            full_name: dto.full_name,
            phone: dto.phone,
            system_role: 'user',
            status: 'pending',
            email_verified_at: null
        })

        // Create OTP
        const otp = OtpUtils.generateOTP()
        const hashedOTP = await HashUtil.hashWithSHA256(otp);
        
        const KEY = `${OTP_EMAIL_PREFIX}${user._id}`;
        const value = JSON.stringify({
            otpHash: hashedOTP,
            attempt: 0
        } as OTPValue)
        this.redis.set(KEY, value, 'EX', OTP_EXPIRATION_TIME);

        // Send OTP queue
        await this.otpProducer.sendMailOTP({
            email: dto.email,
            userId: user._id,
            otp,
            ttl: OTP_EXPIRATION_TIME
        });

        return { message: "OTP sent" }
    }

    async verifyOTP(dto: VerifyOTPDTO): Promise<{ verified: boolean }> {

        // Get user pending document
        const user = await this.userRepository.getUserPendingDocumentByEmail(dto.email);
        if (!user) {
            throw new NotFoundException( ERROR_CODE.USER_NOT_FOUND, `Người dùng không tồn tại` )
        }

        // Get OTP
        const KEY = `${OTP_EMAIL_PREFIX}${user._id}`;
        const rawOtp = await this.redis.get(KEY);
        if (!rawOtp) {
            throw new NotFoundException( ERROR_CODE.OTP_NOT_FOUND, "OTP đã hết hạn" )
        }

        const otpValue = JSON.parse(rawOtp) as OTPValue;

        // Check attempt
        if (otpValue.attempt >= 5) {
            await this.redis.del(KEY);
            throw new TooManyRequestException( ERROR_CODE.OTP_ATTEMPT_EXCEEDED, "Nhập sai OTP quá số lần cho phép. Vui lòng yêu cầu OTP mới" )
        }
        
        // Verify OTP
        const isValidOTP = await HashUtil.compareSha256(dto.otp, otpValue.otpHash);
        if (!isValidOTP) {
            otpValue.attempt += 1;
            await this.redis.set(KEY, JSON.stringify(otpValue), 'KEEPTTL');
            throw new BadRequestException(
                ERROR_CODE.OTP_INVALID,
                "Sai OTP. Còn " + (5 - otpValue.attempt) + " lần thử."
            )
        }
        
        // Update user
        user.email_verified_at = new Date();
        user.status = 'active';
        await user.save();
        await this.redis.del(KEY);   
        
        return { verified: true }
    }

    async resendOTP(dto: ResendOTPDTO): Promise<{ message: string }> {

        // rate limit : email 
        const emailHash = await HashUtil.hashWithSHA256(dto.email);
        const RATE_LIMIT_KEY = `resend_otp:email:${emailHash}`;
        const count = await this.redis.incr(RATE_LIMIT_KEY);
        if(count === 1) await this.redis.expire(RATE_LIMIT_KEY, 600);// 10 minutes
        if (count > 3) {
            throw new TooManyRequestException(
                ERROR_CODE.TOO_MANY_REQUESTS,
                "Bạn đã thử quá nhiều lần. Vui lòng quay lại sau 10 phút"
            )
        }

        // Check user exist and pending status
        const userExist = await this.userRepository.findUserPendingByEmail(dto.email);
        if (!userExist) {
            throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND,`Email ${dto.email} không tồn tại`)
        }
        
        // Del old OTP
        const KEY = `${OTP_EMAIL_PREFIX}${userExist._id}`;
        await this.redis.del(KEY);
        
        // Create new OTP
        const otp = OtpUtils.generateOTP()
        const hashedOtp = await HashUtil.hashWithSHA256(otp);
        const value = JSON.stringify({
            otpHash: hashedOtp,
            attempt: 0
        } as OTPValue)
        await this.redis.set(KEY, value, 'EX', OTP_EXPIRATION_TIME);

        await this.otpProducer.sendMailOTP({
            email: dto.email,
            userId: userExist._id,
            otp,
            ttl: OTP_EXPIRATION_TIME
        });

        return { message: "Sent"}
    }

    async login(dto: LoginDTO): 
    Promise<
        { access_token: string, refresh_token: string } | 
        { state: '2fa_required', temp_token: string, method: 'email' }> 
    {

        // Ratelimit identifier (email or phone) — giới hạn tổng số lần thử trong 15 phút
        const indentifierRateKey = `login_attempt:${dto.identifier}`;
        const indentifierCount = await this.redis.incr(indentifierRateKey);
        if (indentifierCount === 1) await this.redis.expire(indentifierRateKey, 15 * 60); // 15 minutes
        if (indentifierCount > 10) {
            throw new TooManyRequestException(
                ERROR_CODE.TOO_MANY_REQUESTS,
                "Bạn đã thử quá nhiều lần. Vui lòng quay lại sau 15 phút"
            )
        }

        // Kiểm tra số lần đăng nhập sai liên tiếp (reset khi thành công)
        const FAIL_KEY = `${LOGIN_FAILED_PREFIX}${dto.identifier}`;
        const rawFailCount = await this.redis.get(FAIL_KEY);
        if (rawFailCount && parseInt(rawFailCount) >= 5) {
            throw new TooManyRequestException(
                ERROR_CODE.TOO_MANY_REQUESTS,
                "Bạn đã thử quá nhiều lần. Vui lòng quay lại sau 15 phút"
            )
        }

        // Get user 
        let user: UserDocument | null = null;
        if (dto.identifier_type === 'email') {
            user = await this.userRepository.findUserExistByEmail(dto.identifier);
        } else {
            user = await this.userRepository.findUserExistByPhone(dto.identifier);
        }
        if (!user) {
            throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, `Tài khoản không tồn tại`)
        }
        if (user.status === 'banned' || user.status === 'inactive') {
            throw new ForbiddenException(ERROR_CODE.USER_STATUS_INVALID, `Tài khoản bị khóa.`)
        } else if (user.status === 'pending') {
            throw new ForbiddenException(ERROR_CODE.USER_PENDING, `Tài khoản chưa được kích hoạt.`)
        }
        if (dto.identifier_type === 'phone' && !user.phone_verified_at) {
            throw new ForbiddenException(ERROR_CODE.PHONE_NOT_VERIFIED, `Số điện thoại chưa được xác minh.`)
        }
        if (user.password_hash === null) { // Login bằng OAuth — chưa thiết lập password
            throw new ForbiddenException(ERROR_CODE.PASSWORD_NOT_SET, `Vui lòng login bằng Google và thiết lập password`)
        }

        // Check password
        const isPasswordValid = await HashUtil.compare(dto.password, user.password_hash);
        if (!isPasswordValid) {
            // Tăng counter fail chỉ khi sai mật khẩu
            const newFailCount = await this.redis.incr(FAIL_KEY);
            if (newFailCount === 1) await this.redis.expire(FAIL_KEY, 15 * 60);
            throw new UnauthorizedException(ERROR_CODE.INVALID_CREDENTIALS, "Sai mật khẩu");
        }

        await this.redis.del(FAIL_KEY);

        // Check 2FA (nếu có) 
        if (user.two_factor_enabled) {
            // do something
            const temp_token = await HashUtil.randomBytesHex(32);
            await this.redis.set(`${PENDING_2FA_PREFIX}${temp_token}`, JSON.stringify({
                user_id: user._id.toString(),
                ip: dto.user_ip ?? null,
                remember_me: dto.remember_me,
                device_info: dto.device_info ?? null,
                send_to: user.email
            } as PENDING_2FA_DATA), 'EX', 15 * 60); // 15 minutes
            return {
                state: '2fa_required',
                temp_token,
                method: 'email'
            };
        }

        // Create Session
        const { access_token, refresh_token } = await this.createSession(user, dto);

        return {
            access_token,
            refresh_token
        }
    }

    private async createSession(user: UserDocument, dto: LoginDTO){

        // Generate token pair
        const { access_token, refresh_token } = await this.generateTokenPair(
            user._id,
            user.system_role,
            dto.remember_me
        );

        const refresh_token_ttl = dto.remember_me ? this.config.jwt.refreshTtl : REFRESH_TTL_NOT_REMEMBER;
        const refreshTokenHash = await HashUtil.hashWithSHA256(refresh_token);

        // Save session to DB
        const session = await this.sessionRepository.create({
            user_id: user._id,
            expires_at: new Date(Date.now() + TimeUtil.parseTtlString(refresh_token_ttl) * 1000),
            remember_me: dto.remember_me,
            token_hash: refreshTokenHash,
            device_info: dto.device_info ?? null,
            ip_address: dto.user_ip ?? null
        })

        // Save session to redis
        const KEY_SESSION = `${SESSION_PREFIX}${refreshTokenHash}`;
        await this.redis.set(KEY_SESSION, JSON.stringify({
            user_id: session.user_id,
            system_role: user.system_role,
            remember_me: session.remember_me
        } as SessionData), 'EX', TimeUtil.parseTtlString(refresh_token_ttl))

        // Update user 
        await this.userRepository.update(user._id, {
            last_login_at: new Date(),
            last_login_ip: dto.user_ip ?? null
        })

        return {
            access_token,
            refresh_token
        }
    }

    async refreshToken(refresh_token: string): Promise<{ access_token: string, refresh_token?: string, remember_me?: boolean}> { 
        // Verify refresh token
        let payload: RefreshTokenPayload;
        try {
            payload = this.jwt.verify(refresh_token, { secret: this.config.jwt.refreshSecret, algorithms: ['HS256'] });
        } catch (err) {
              if (err.name === "TokenExpiredError") throw new UnauthorizedException(ERROR_CODE.TOKEN_EXPIRED, "Token hết hạn");
                throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Token không hợp lệ");
        }

        // Get Session
        const hash = await HashUtil.hashWithSHA256(refresh_token);
        const KEY_SESSION = `${SESSION_PREFIX}${hash}`;
        const rawSession = await this.redis.get(KEY_SESSION);

        let session: UserSessionDocument | SessionData;
        if (!rawSession) {
            // Get DB
            const dbSession = await this.sessionRepository.findSessionByTokenHash(hash);
            if (!dbSession || dbSession.is_revoked || dbSession.expires_at < new Date()) {
                throw new UnauthorizedException(
                    ERROR_CODE.UNAUTHORIZED,
                    "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."
                )
            }
            session = dbSession;
            // Cache session to redis
            await this.redis.set(KEY_SESSION, JSON.stringify({
                user_id: dbSession.user_id,
                system_role: payload.system_role,
                remember_me: dbSession.remember_me
            } as SessionData), 'EX', Math.floor((dbSession.expires_at.getTime() - Date.now()) / 1000))
        } else {
            session = JSON.parse(rawSession) as SessionData;
        }

        // Check User 
        const user = await this.userRepository.findById(payload.sub);
        if (!user || user.deleted_at || user.status === 'banned' || user.status === 'inactive') {
            throw new ForbiddenException(ERROR_CODE.USER_STATUS_INVALID,`Tài khoản bị khóa.`)
        }

        // Sliding session expiration
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = payload.exp - now;
        const retoteThreshold = session.remember_me ? 7 * 24 * 60 * 60 : 24 * 60 * 60; // 7 days or 24 hours
       
        if (timeLeft > retoteThreshold) {
            const accessTokenPayload: AccessTokenPayload = {
                sub: payload.sub,
                system_role: payload.system_role,
                jti: payload.jti,
                iat: now,
                exp: now + TimeUtil.parseTtlString(this.config.jwt.accessTtl) // 15 minutes
            }
            const access_token = this.jwt.sign(accessTokenPayload, {
                secret: this.config.jwt.accessSecret,
                algorithm: 'HS256'
            });
            return { access_token }
        }

        // Handle refresh token rotation
        const lockKey = `${RORATE_LOCK_PREFIX}${hash}`;
        const resultKey = `${RORATE_RESULT_PREFIX}${hash}`;
        const acquired = await this.redis.set(lockKey, 'locked', 'EX', 10, 'NX'); // Thời gian lock 10s
        
        if (!acquired) {
            return await this.waitForRotationResult(resultKey);
        } 

        // Generate new token pair
        const { access_token, refresh_token: newRefreshToken } = await this.generateTokenPair(
            new Types.ObjectId(payload.sub),
            payload.system_role,
            session.remember_me
        );

        const newHash = await HashUtil.hashWithSHA256(newRefreshToken);
        const newTtl = session.remember_me ? this.config.jwt.refreshTtl : REFRESH_TTL_NOT_REMEMBER;
        
        // Update session in DB
        const oldSession = await this.sessionRepository.updateSessionLogoutByTokenHash(newHash);

        // Create new session and update old session with transaction
        await this.sessionRepository.create({
            user_id: new Types.ObjectId(payload.sub),
            expires_at: new Date(Date.now() + TimeUtil.parseTtlString(newTtl) * 1000),
            remember_me: session.remember_me,
            token_hash: newHash,
            device_info: oldSession?.device_info ?? null,
            ip_address: oldSession?.ip_address ?? null
        })

        // Update Redis
        const newSessionData: SessionData = {
            user_id: new Types.ObjectId(payload.sub),
            system_role: payload.system_role,
            remember_me: session.remember_me
        }
        await Promise.all([
            this.redis.set(`${SESSION_PREFIX}${newHash}`, JSON.stringify(newSessionData), 'EX', TimeUtil.parseTtlString(newTtl)),
            this.redis.del(KEY_SESSION),
            this.redis.set(resultKey, JSON.stringify({ access_token, refresh_token: newRefreshToken }), 'EX', 10),
            this.redis.del(lockKey)
        ])
        
        return { access_token, refresh_token: newRefreshToken, remember_me: session.remember_me }
    }

    async send2FAEmailOTP(temp_token: string, req_ip: string): Promise<{ message: string, expires_in: number}> {
        
        // Get pending 2FA data
        const KEY_PENDING_2FA = `${PENDING_2FA_PREFIX}${temp_token}`;
        const rawPending = await this.redis.get(KEY_PENDING_2FA);

        if (!rawPending) {
            throw new BadRequestException(ERROR_CODE.TEMP_TOKEN_NOT_FOUND,"Phiên hết hạn")
        }

        const pending = JSON.parse(rawPending) as PENDING_2FA_DATA;

        // IP check
        if (pending.ip && pending.ip !== req_ip) {
            throw new BadRequestException(ERROR_CODE.INVALID_IP_ADDRESS,"Phiên không hợp lệ")
        }

        // Rate limit check
        const RATE_KEY = 'rate:send:2fa:' + pending.user_id
        const count = await this.redis.incr(RATE_KEY);
        if (count === 1) await this.redis.expire(RATE_KEY, 15 * 60); // 15 minutes
        if (count > 3) {
            throw new TooManyRequestException(
                ERROR_CODE.TOO_MANY_REQUESTS,
                "Bạn đã thử quá nhiều lần. Vui lòng quay lại sau 15 phút"
            )
        }

        // Create OTP
        const otp = OtpUtils.generateOTP()
        const hashedOTP = await HashUtil.hashWithSHA256(otp);

        const OTP_KEY = `${OTP_2FA_PREFIX}${temp_token}`;
        const otpValue = JSON.stringify({
            otpHash: hashedOTP,
            attempt: 0,
            user_id: pending.user_id
        } as OTPValue & { user_id: string })

        await Promise.all([

            this.redis.set(OTP_KEY, otpValue, 'EX', OTP_EXPIRATION_TIME),
            
            // Gia hạn thời gian tồn tại của temp_token để người dùng có thể nhập OTP
            this.redis.set(KEY_PENDING_2FA, rawPending, 'EX', 15 * 60), // 15 minutes
    
            // Send OTP queue
            this.otpProducer.sendMailOTP({
                email: pending.send_to,
                userId: new Types.ObjectId(pending.user_id),
                otp,
                ttl: OTP_EXPIRATION_TIME
            })
        ])

        return {
            message: "OTP đã được gửi lại",
            expires_in: OTP_EXPIRATION_TIME
        }
    }

    async verify2FAOTP(temp_token: string, otp: string, req_ip: string): Promise<{ access_token: string, refresh_token: string, remember_me: boolean}> {
        const KEY_PENDING_2FA = `${PENDING_2FA_PREFIX}${temp_token}`;

        // Get pending 2FA data
        const rawPending = await this.redis.get(KEY_PENDING_2FA);
        if (!rawPending) {
            throw new BadRequestException(ERROR_CODE.TEMP_TOKEN_NOT_FOUND,"Phiên hết hạn")
        }

        const pending = JSON.parse(rawPending) as PENDING_2FA_DATA;

        // IP check
        if (pending.ip && pending.ip !== req_ip) {
            throw new BadRequestException(ERROR_CODE.INVALID_IP_ADDRESS,"Phiên không hợp lệ")
        }

        // Rate limit check
        const OTP_2FA_FAIL_KEY = `${OTP_2FA_FAIL_PREFIX}${pending.user_id}`;
        const rawFailCount = await this.redis.get(OTP_2FA_FAIL_KEY);
        if (rawFailCount && parseInt(rawFailCount ?? "0") >= 5) {
            await this.redis.del(KEY_PENDING_2FA);
            throw new TooManyRequestException(ERROR_CODE.TOO_MANY_REQUESTS,"Khóa 2FA. Phiên bị hủy")
        }

        // Get OTP
        const OTP_KEY = `${OTP_2FA_PREFIX}${temp_token}`;
        const rawOtp = await this.redis.get(OTP_KEY);
        if (!rawOtp) {
            throw new BadRequestException(ERROR_CODE.OTP_NOT_FOUND,"OTP không tồn tại hoặc đã hết hạn")
        }

        const otpData = JSON.parse(rawOtp) as OTPValue & { user_id: string };
        if(otpData.attempt >= 5) {
            this.redis.del(OTP_KEY);
            throw new BadRequestException(ERROR_CODE.OTP_ATTEMPT_EXCEEDED, "Nhập sai OTP quá số lần cho phép. Vui lòng gửi OTP mới")
        }

        const isValidOTP = await HashUtil.compareSha256(otp, otpData.otpHash);
        if (!isValidOTP) {
            const newFail = await this.redis.incr(OTP_2FA_FAIL_KEY);
            if (newFail === 1) await this.redis.expire(OTP_2FA_FAIL_KEY, 15 * 60);

            otpData.attempt += 1;
            await this.redis.set(OTP_KEY, JSON.stringify(otpData), 'KEEPTTL');

            throw new BadRequestException(ERROR_CODE.OTP_INVALID,`Sai OTP. Còn ${5 - newFail} lần`)
        }

        // Del OTP and pending 2FA
        await Promise.all([
            this.redis.del(OTP_KEY),
            this.redis.del(KEY_PENDING_2FA),
            this.redis.del(OTP_2FA_FAIL_KEY)
        ])

        // Create session
        const user = await this.userRepository.findUserExistById(new Types.ObjectId(pending.user_id));
        if (!user || user.status === 'banned') {
            throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND,"User không tồn tại")
        }

        const [update, tokens] = await Promise.all([
            // Cập nhật last login
            this.userRepository.update(user._id, {
                last_login_at: new Date(),
                last_login_ip: req_ip
            }),
            this.createSession(user, {
                identifier: user.email,
                identifier_type: 'email',
                password: '', // Không cần password ở đây vì đã xác thực bằng OTP
                remember_me: pending.remember_me,
                device_info: pending.device_info,
                user_ip: pending.ip
            } as LoginDTO) 
        ])

        return {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            remember_me: pending.remember_me
        }
    }

    async logout(refresh_token: string, access_token_jti: string): Promise<{ logged_out: boolean }> {

        // Hash token
        const hashRT = await HashUtil.hashWithSHA256(refresh_token);
        const KEY_SESSION = `${SESSION_PREFIX}${hashRT}`;
        const remainingTtl = await this.redis.ttl(KEY_SESSION);

        // Update session in DB
        const session = await this.sessionRepository.updateSessionLogoutByTokenHash(hashRT);
        if (!session) return { logged_out: false };

        // Remove session in Redis
        await this.redis.del(KEY_SESSION);

        // Set blacklist
        if ( access_token_jti && remainingTtl > 0 ) {
            const KEY_BLACKLIST = `${JWT_BLACKLIST_PREFIX}${access_token_jti}`; // jti của access token
            await this.redis.set(KEY_BLACKLIST, 'blacklisted', 'EX', remainingTtl); 
        }

        return { logged_out: true }
    }

    private async handleLogoutAllSessions(
        user_id: Types.ObjectId,
    ): Promise<{ logged_out_count: number }> {

        const [ sessions, updateResult ] = await Promise.all([
            // Get all sessions of user 
            this.sessionRepository.findAllByUserId(user_id),
            // Update all sessions to logout in DB
            this.sessionRepository.updateSessionsLogoutByUserId(user_id)
        ]);

        // Del all sessions in Redis
        const SESSION_KEYS = sessions.map(s => `${SESSION_PREFIX}${s.token_hash}`);
        if (SESSION_KEYS.length > 0) await this.redis.del(...SESSION_KEYS);
        return { logged_out_count: updateResult.modifiedCount };
    }

    async logoutAllSessions(
        user_id: Types.ObjectId,
        current_refresh_token: string,
        current_access_token_jti: string,
    ): Promise<{ logged_out_count: number }> {

        const updateResult = await this.handleLogoutAllSessions(user_id);

        // Set blacklist for all current tokens
        const hashRT = await HashUtil.hashWithSHA256(current_refresh_token);
        const remainingTtl = await this.redis.ttl(`${SESSION_PREFIX}${hashRT}`);

        if (current_access_token_jti && remainingTtl > 0) {
            const KEY_BLACKLIST = `${JWT_BLACKLIST_PREFIX}${current_access_token_jti}`;
            await this.redis.set(KEY_BLACKLIST, 'blacklisted', 'EX', remainingTtl);
        }

        return { logged_out_count: updateResult.logged_out_count };
    }

    // Password 
    async forgotPassword(email: string): Promise<{ message: string, session_token: string }> {
        const user = await this.userRepository.findUserExistByEmail(email);
        if (!user || user.status === 'banned') {
            throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, `Email ${email} không tồn tại`)
        }

        // Generate session for forgot password
        const sessionToken = await HashUtil.randomBytesHex(32);
        await Promise.all([
            this.redis.set(`${PWRESET_SESSION_PREFIX}${sessionToken}`, JSON.stringify({
                user_id: user._id,
            }), 'EX', 15 * 60), // 15 minutes
            
            this.redis.del(`${OTP_PWRESET_PREFIX}${user._id}`), // Xoá OTP cũ nếu có
        ])
        
        const otp = OtpUtils.generateOTP();
        const hashedOTP = await HashUtil.hashWithSHA256(otp);
        await this.redis.set(`${OTP_PWRESET_PREFIX}${user._id}`, JSON.stringify({
            otpHash: hashedOTP,
            attempt: 0
        } as OTPValue), 'EX', OTP_EXPIRATION_TIME);
        
        await this.otpProducer.sendMailOTP({
            email: user.email,
            userId: user._id,
            otp,
            ttl: OTP_EXPIRATION_TIME
        })
        
        return { message: "OTP đã được gửi đến email của bạn", session_token: sessionToken };
    }

    async verifyForgotPasswordOTP(session_token: string, otp: string): Promise<{ verified: boolean, reset_grant_token: string}> {
        // Get session data
        const sessionKey = `${PWRESET_SESSION_PREFIX}${session_token}`;
        const rawSession = await this.redis.get(sessionKey);
        if (!rawSession) {
            throw new BadRequestException(ERROR_CODE.TEMP_TOKEN_NOT_FOUND, "Phiên hết hạn")
        }
        // Get otp
        const sessionData = JSON.parse(rawSession) as { user_id: string };
        const otpKey = `${OTP_PWRESET_PREFIX}${sessionData.user_id}`;
        const rawOtp = await this.redis.get(otpKey);
        if (!rawOtp) {
            throw new NotFoundException(ERROR_CODE.OTP_NOT_FOUND, "OTP đã hết hạn")
        }

        const otpData = JSON.parse(rawOtp) as OTPValue;
        if (otpData.attempt >= 5) {
            await this.redis.del(otpKey);
            throw new TooManyRequestException(ERROR_CODE.OTP_ATTEMPT_EXCEEDED, "Nhập sai OTP quá số lần cho phép. Vui lòng yêu cầu lại")
        }

        // Check OTP 
        const isValidOTP = await HashUtil.compareSha256(otp, otpData.otpHash);
        if (!isValidOTP) {
            otpData.attempt += 1;
            await this.redis.set(otpKey, JSON.stringify(otpData), 'KEEPTTL');
            throw new BadRequestException(ERROR_CODE.OTP_INVALID, `Sai OTP. Còn ${5 - otpData.attempt} lần thử`)
        }

        // Generate reset token
        const grantToken = await HashUtil.randomBytesHex(32);
        await Promise.all([
            this.redis.set(`${PWRESET_GRANT_PREFIX}${grantToken}`, JSON.stringify({
                user_id: sessionData.user_id
            }), 'EX', 15 * 60), // 15 minutes
            this.redis.del(otpKey),
            this.redis.del(sessionKey)
        ])

        return { verified: true, reset_grant_token: grantToken }
    }

    async resetPassword(grant_token: string, new_password: string): Promise<{ reset: boolean }> {
        // Get grant data
        const grantKey = `${PWRESET_GRANT_PREFIX}${grant_token}`;
        const rawGrant = await this.redis.get(grantKey);
        if (!rawGrant) {
            throw new BadRequestException(ERROR_CODE.TEMP_TOKEN_NOT_FOUND, "Phiên hết hạn")
        }
        
        // Xóa grant token để đảm bảo tính một lần
        await this.redis.del(grantKey);
        
        const { user_id } = JSON.parse(rawGrant) as { user_id: string };
        const userID = new Types.ObjectId(user_id);

        // Hash new password
        const hashedPassword = await HashUtil.hash(new_password);

        // Update password in DB
        await this.userRepository.update(userID, {
            password_hash: hashedPassword,
            status: 'active' // Kích hoạt lại tài khoản nếu đang ở trạng thái pending
        })

        // Revoke all sessions
        await this.handleLogoutAllSessions(userID);
        return { reset: true }
    }


    async changePassword(
        user_id: Types.ObjectId, refresh_token: string, 
        current_password: string, new_password: string
    ): Promise<{ changed: boolean }> {
        // Rate limit user_id
        const RATE_KEY = `${RATELIMIT_CHANGE_PW_PREFIX}${user_id}`;
        const count = await this.redis.incr(RATE_KEY);
        if (count === 1) await this.redis.expire(RATE_KEY, 3600); // 1h
        if (count > 5) {
            throw new TooManyRequestException(
                ERROR_CODE.TOO_MANY_REQUESTS,
                "Bạn đã thử quá nhiều lần. Vui lòng quay lại sau 15 phút"
            )
        }

        // Get user
        const user = await this.userRepository.findById(user_id);
        if (!user) throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, "User không tồn tại")

        // Cho phép user có mật khẩu null (đăng nhập bằng Oauth) thiết lập mật khẩu mà không cần xác thực mật khẩu hiện tại
        if (
            user.password_hash
            && !(await HashUtil.compare(current_password, user.password_hash))
        ) {
            throw new UnauthorizedException(ERROR_CODE.INVALID_CREDENTIALS, "Mật khẩu hiện tại không đúng")
        }

        // Hash new password
        const hashedPassword = await HashUtil.hash(new_password);
        await this.userRepository.update(user_id, { password_hash: hashedPassword })

        // Revoke all sessions không tính hiện tại
        const hash = await HashUtil.hashWithSHA256(refresh_token);
        const sessions = await this.sessionRepository.findSessionsExcludingTokenHash(user_id, hash);
        if (sessions.length === 0) {
            return { changed: true }
        }
        await this.sessionRepository.UpdateSessionsExcludingTokenHash(user_id, hash);

        // Xoá session trong Redis
        const SESSION_KEYS = sessions.map(s => `${SESSION_PREFIX}${s.token_hash}`);
        await this.redis.del(...SESSION_KEYS);

        return { changed: true }
    }

    // 2FA
    async enable2FA(user_id: Types.ObjectId, password: string): Promise<{ enabled: boolean}> {
        // Get user 
        const user = await this.userRepository.findUserExistById(user_id);
        if (!user) throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, "User không tồn tại")
        
        if (user.two_factor_enabled) return { enabled: true }

        if (!user.password_hash) throw new BadRequestException(ERROR_CODE.PASSWORD_NOT_SET, "Vui lòng thiết lập mật khẩu trước khi bật 2FA")

        if (!user.email_verified_at) {
            throw new BadRequestException(ERROR_CODE.USER_PENDING, "Email chưa được xác minh")
        }
        
        const isPasswordValid = await HashUtil.compare(password, user.password_hash ?? '');
        if (!isPasswordValid) {
            throw new UnauthorizedException(ERROR_CODE.INVALID_CREDENTIALS, "Mật khẩu không đúng")
        }

        await this.userRepository.update(user_id, { two_factor_enabled: true });
        return { enabled: true }
    }

    async disable2FA(user_id: Types.ObjectId, password: string): Promise<{ disabled: boolean}> {
         // Get user 
        const user = await this.userRepository.findUserExistById(user_id);
        if (!user) throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, "User không tồn tại")
        
        if (!user.two_factor_enabled) return { disabled: true }
        
        const isPasswordValid = await HashUtil.compare(password, user.password_hash ?? '');
        if (!isPasswordValid) {
            throw new UnauthorizedException(ERROR_CODE.INVALID_CREDENTIALS, "Mật khẩu không đúng")
        }

        await this.userRepository.update(user_id, { two_factor_enabled: false });
        return { disabled: true }
    }

    async getSessions(
        user_id: Types.ObjectId,
        current_refresh_token: string
    ): Promise<{ sessions: Array<any> }> {
        const sessions = await this.sessionRepository.findAllByUserId(user_id);
        
        const hash = await HashUtil.hashWithSHA256(current_refresh_token);
        const mapped = sessions.map(s => ({
            session_id: s._id,
            device_info: s.device_info,
            ip_address: s.ip_address,
            created_at: s.created_at,
            expires_at: s.expires_at,
            is_current: s.token_hash === hash,
        }))

        return { sessions:  mapped};
    }

    async revokeSession(
        user_id: Types.ObjectId, 
        session_id: Types.ObjectId, 
        current_refresh_token: string,
        access_token_jti: string
    ): Promise<{ revoked: boolean}> {

        const session = await this.sessionRepository.findOne({
            _id: session_id,
            user_id,
            is_revoked: false,
        });
        if (!session) {
            throw new NotFoundException(ERROR_CODE.SESSION_NOT_FOUND, "Phiên đăng nhập không tồn tại")
        }

        await Promise.all([
            this.sessionRepository.updateSessionLogoutByTokenHash(session.token_hash), // Cập nhật session trong DB
            this.redis.del(`${SESSION_PREFIX}${session.token_hash}`) // Xoá session trong Redis
        ])

        const isCurrentSession = await HashUtil.compareSha256(current_refresh_token, session.token_hash);
        if (isCurrentSession && access_token_jti) {
            const remainingTtl = await this.redis.ttl(`${SESSION_PREFIX}${session.token_hash}`);
            if (remainingTtl > 0) {
                await this.redis.set(`${JWT_BLACKLIST_PREFIX}${access_token_jti}`, '1', 'EX', remainingTtl);
            }
        }
            
        return { revoked: true } 

    }

    async sendPhoneOTP(user_id: Types.ObjectId, phone: string): Promise<{ message: string, expires_in: number}> {
        const RATE_KEY = `${RATELIMIT_SMS_PREFIX}${user_id}`;
        const count = await this.redis.incr(RATE_KEY);
        if (count === 1) await this.redis.expire(RATE_KEY, 86400); // 1 day
        else if (count > 5) {
            throw new TooManyRequestException(ERROR_CODE.TOO_MANY_REQUESTS, "Quá nhiều yêu cầu, vui lòng thử lại sau");
        }

        // Check phone exist 
        const phoneOwner = await this.userRepository.findUserExistByPhone(phone);
        if (phoneOwner && phoneOwner._id.toString() !== user_id.toString()) {
            throw new ConflictException(ERROR_CODE.CONFLICT_ERROR, "Số điện thoại đã được sử dụng")
        }

        // Generate OTP
        const otp = OtpUtils.generateOTP();
        const hashedOTP = await HashUtil.hashWithSHA256(otp);

        // Save OTP to Redis
        const OTP_KEY = `${OTP_PHONE_VERIFY_PREFIX}${user_id}`;
        await this.redis.set(OTP_KEY, JSON.stringify({
            otpHash: hashedOTP,
            attempt: 0,
            phone
        } as OTPValue & { phone: string }), 'EX', OTP_EXPIRATION_TIME); // 5 minutes

        await this.otpProducer.sendSMSOTP({
            phone,
            userId: user_id,
            otp,
            ttl: OTP_EXPIRATION_TIME
        })

        return { message: "Sent", expires_in: OTP_EXPIRATION_TIME };
    }
    
    async verifyPhoneOTP(user_id: Types.ObjectId, otp: string): Promise<{ verified: boolean }> {
        const OTP_KEY = `${OTP_PHONE_VERIFY_PREFIX}${user_id}`;
        const rawOtp = await this.redis.get(OTP_KEY);
        if (!rawOtp) {
            throw new BadRequestException(ERROR_CODE.OTP_NOT_FOUND, "OTP không tồn tại hoặc đã hết hạn")
        }

        const otpData = JSON.parse(rawOtp) as OTPValue & { phone: string };
        if (otpData.attempt >= 5) {
            await this.redis.del(OTP_KEY);
            throw new TooManyRequestException(ERROR_CODE.OTP_ATTEMPT_EXCEEDED, "Nhập sai OTP quá số lần cho phép. Vui lòng gửi OTP mới")
        }

        const isValidOTP = await HashUtil.compareSha256(otp, otpData.otpHash);
        if (!isValidOTP) {
            otpData.attempt += 1;
            await this.redis.set(OTP_KEY, JSON.stringify(otpData), 'KEEPTTL');
            throw new BadRequestException(ERROR_CODE.OTP_INVALID, `Sai OTP. Còn ${5 - otpData.attempt} lần thử`)
        }

        // Update user's phone and verified status
        await this.userRepository.update(user_id, {
            phone: otpData.phone,
            phone_verified_at: new Date()
        })

        await this.redis.del(OTP_KEY);
        return { verified: true }
    }


    // Outh2
    async oauthInit(provider: string): Promise<{ redirect_url : string }> {
        const state = await HashUtil.randomBytesHex(16);
        const pkce_verifier = await HashUtil.randomBytesHex(32);

        // Lưu state và pkce_verifier vào Redis để xác thực khi callback
        await this.redis.set(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify({
            provider,
            pkce_verifier
        }as OAuthStateData), 'EX', 15 * 60); // 15 minutes

        const pkce_challenge = await HashUtil.hashWithSHA256Base64Url(pkce_verifier);

        let redirect_url  = "";
        if (provider === 'google') {
            const params = new URLSearchParams({
                client_id: this.config.oauth2.googleClientId,
                redirect_uri: this.config.oauth2.googleRedirectUri,
                response_type: 'code',
                scope: 'openid email profile',
                state,
                code_challenge: pkce_challenge,
                code_challenge_method: 'S256'
            });
            redirect_url  = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        } else {
            throw new BadRequestException(ERROR_CODE.INVALID_PROVIDER, "Nhà cung cấp không hợp lệ")
        }
        return { redirect_url };
    }
    
    async oauthCallback(
        provider: string, code: string, state: string, dto: LoginDTO
    ): Promise<{ access_token: string, refresh_token: string }> 
    {
        const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
        const rawState = await this.redis.get(stateKey);
        if (!rawState) {
            throw new BadRequestException(ERROR_CODE.TEMP_TOKEN_NOT_FOUND, "Phiên hết hạn hoặc không hợp lệ")
        }
        await this.redis.del(stateKey);

        const stateData = JSON.parse(rawState) as OAuthStateData;
        if (stateData.provider !== provider) {
            throw new BadRequestException(ERROR_CODE.INVALID_PROVIDER, "Nhà cung cấp không hợp lệ")
        }

        let profile: any = null;
        // Exchange code for token
        if (provider === 'google') {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: this.config.oauth2.googleClientId,
                    client_secret: this.config.oauth2.googleClientSecret,
                    redirect_uri: this.config.oauth2.googleRedirectUri,
                    grant_type: 'authorization_code',
                    code_verifier: stateData.pkce_verifier
                })}
            );
            if (!tokenRes.ok) {
                const error = await tokenRes.json();
                throw new BadRequestException(ERROR_CODE.OAUTH_EXCHANGE_FAILED, `Lỗi khi trao đổi token: ${error.error_description || error.error}`)
            }

            const tokenData: GoogleTokenResponse = await tokenRes.json();
            const base64Payload = tokenData.id_token.split('.')[1];
            const json = Buffer.from(base64Payload, 'base64url').toString('utf-8');
            const payload = JSON.parse(json); 

            profile = {
                provider: 'google',
                provider_id: payload.sub,       // Google user ID
                email: payload.email,
                name: payload.name,
                avatar: payload.picture,
            }
        } else {
            throw new BadRequestException(ERROR_CODE.INVALID_PROVIDER, "Nhà cung cấp không hợp lệ")
        }

        // Check provider_id đã tồn tại
        const existingProvider = await this.providerRepository.findByProviderAndProviderId(profile.provider, profile.provider_id);
        if (existingProvider) {
            // Nếu đã tồn tại, đăng nhập vào tài khoản đó
            const user = await this.userRepository.findUserExistById(existingProvider.user_id);
            if (!user || user.status === 'banned') {
                throw new ForbiddenException(ERROR_CODE.USER_STATUS_INVALID, "Tài khoản bị khóa hoặc không tồn tại")
            }
            const [update, tokens] = await Promise.all([
                this.userRepository.update(user._id, {
                    avatar_url: profile.avatar,
                    full_name: profile.name,
                    last_login_at: new Date(),
                    last_login_ip: dto.user_ip ?? null,
                    status: 'active',       
                }),
                this.createSession(user, {
                    identifier: user.email,
                    identifier_type: 'email',
                    password: '', // Không cần password khi đăng nhập bằng OAuth
                    remember_me: false,
                    device_info: dto.device_info,
                    user_ip: dto.user_ip
                })
            ])
            return tokens;
        }
        
        const user = await this.userRepository.findUserExistByEmail(profile.email);
        if (user) {
            if (user.status === 'banned') {
                throw new ForbiddenException(ERROR_CODE.USER_STATUS_INVALID, "Tài khoản bị khóa")
            }

            await Promise.all([
                this.userRepository.update(user._id, {
                    avatar_url: profile.avatar,
                    full_name: profile.name,
                    last_login_at: new Date(),
                    last_login_ip: dto.user_ip ?? null,
                    status: 'active', 
                }),
                this.providerRepository.create({
                    user_id: user._id,
                    provider: profile.provider,
                    provider_user_id: profile.provider_id,
                })
            ])
            return await this.createSession(user, {
                identifier: user.email,
                identifier_type: 'email',
                password: '', // Không cần password khi đăng nhập bằng OAuth
                remember_me: false,
                device_info: dto.device_info,
                user_ip: dto.user_ip
            })
        }

        // Nếu chưa tồn tại, tạo tài khoản mới

        const session = await this.conn.startSession();

        const createdUser = await session.withTransaction(async () => {
            const newUser = await this.userRepository.create({
                email: profile.email,
                full_name: profile.name,
                avatar_url: profile.avatar,
                status: 'active',
                email_verified_at: new Date(),
                password_hash: null,
                system_role: 'user',
                two_factor_enabled: false
            }, session)
            await this.providerRepository.create({
                user_id: newUser._id,
                provider: profile.provider,
                provider_user_id: profile.provider_id,
            }, session)
            return newUser;
        })

        session.endSession();

        return await this.createSession(createdUser, {
            identifier: profile.email,
            identifier_type: 'email',
            password: '', // Không cần password khi đăng nhập bằng OAuth
            remember_me: false,
            device_info: dto.device_info,
            user_ip: dto.user_ip
        })
    }

    // CronJob: Xóa các user pending quá 24h
    // @Cron('0 0 * * *') // Chạy vào lúc 00:00 hàng ngày
    async deletePendingUsers() {
        console.log("Running deletePendingUsers job...");
    }
    // CronJob: Xóa các user đã bị xóa (soft delete) quá 30 ngày
    //@Cron('0 0 * * *') // Chạy vào lúc 00:00 hàng ngày
    async removeUserByDeleteAt() {
        console.log("Running removeUserByDeleteAt job...");
    }

    // CronJob: Cập nhật trạng thái inactive cho user không quá 15 phút
    async updateUserStatusInactive() {
    }

    private async generateTokenPair(
        user_id: Types.ObjectId,
        system_role: 'user' | 'admin',
        remember_me: boolean
    ): Promise<{ access_token: string, refresh_token: string}> {
        // Generate accsss token
        const now = Math.floor(Date.now() / 1000);
        const refreshTokenTtl = remember_me ? this.config.jwt.refreshTtl : REFRESH_TTL_NOT_REMEMBER;
        const accessTokenPayload: AccessTokenPayload = {
            sub: user_id,
            system_role: system_role,
            jti: randomUUID(),
            iat: now,
            exp: now + TimeUtil.parseTtlString(this.config.jwt.accessTtl) // 15 minutes
        }
        // Generate refresh token
        const refreshTokenPayload: RefreshTokenPayload = {
            sub: user_id,
            system_role: system_role,
            jti: randomUUID(),
            version: 1,
            iat: now,
            exp: now + TimeUtil.parseTtlString(refreshTokenTtl) // 7 days or 24 hours
        }

        const access_token = this.jwt.sign(
            accessTokenPayload,{ secret: this.config.jwt.accessSecret }
        )
        const refresh_token = this.jwt.sign(
            refreshTokenPayload,{ secret: this.config.jwt.refreshSecret }
        )
        
        return { access_token, refresh_token };
    }

    

    private async waitForRotationResult(resultKey: string): Promise<any> {
        let attempts = 0;
        while (attempts < 10) { // Thử tối đa 5 giây (mỗi lần 500ms)
            const cached = await this.redis.get(resultKey);
            if (cached) return JSON.parse(cached);
            
            await new Promise(res => setTimeout(res, 500));
            attempts++;
        }
        throw new UnauthorizedException( ERROR_CODE.UNAUTHORIZED, "Hệ thống bận, vui lòng thử lại" );
    }
}