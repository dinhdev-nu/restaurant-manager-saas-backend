export const ERROR_CODE = {

    // RESOURCE
    RESOURCE_NOT_FOUND: "RESOURCE_001",

    // NOT FOUND
    OTP_NOT_FOUND: "NOTFOUND_001",       // OTP hết hạn / chưa được gửi
    TEMP_TOKEN_NOT_FOUND: "NOTFOUND_002", // temp_token / session_token hết hạn
    SESSION_NOT_FOUND: "NOTFOUND_003",    // Phiên đăng nhập không tồn tại

    // USER
    USER_NOT_FOUND: "USER_001",
    USER_EXISTS: "USER_002",
    USER_PENDING: "USER_003",            // Tài khoản chưa kích hoạt email
    PASSWORD_NOT_SET: "USER_004",        // Tài khoản OAuth chưa thiết lập mật khẩu
    PHONE_NOT_VERIFIED: "USER_005",      // Số điện thoại chưa được xác minh

    // OTP
    OTP_INVALID: "OTP_001",              // Sai mã OTP
    OTP_ATTEMPT_EXCEEDED: "OTP_002",     // Nhập sai OTP quá số lần cho phép → cần OTP mới
    OTP_SEND_LIMIT_EXCEEDED: "OTP_003",  // Gửi OTP quá nhiều lần trong khoảng thời gian

    // AUTH
    UNAUTHORIZED: "AUTH_001",            // Không có / không hợp lệ token (generic)
    FORBIDDEN: "AUTH_002",
    TOKEN_EXPIRED: "AUTH_003",
    USER_STATUS_INVALID: "AUTH_004",     // Tài khoản bị khóa / inactive / banned
    INVALID_TOKEN: "AUTH_005",           // Token sai cấu trúc / chữ ký
    INVALID_CREDENTIALS: "AUTH_006",     // Sai mật khẩu (FE hiển thị "Sai mật khẩu")

    // VALIDATION
    VALIDATION_ERROR: "VALIDATION_001",
    INVALID_ID_ERROR: "VALIDATION_002",
    INVALID_INPUT_ERROR: "VALIDATION_003",
    DUPLICATE_ITEMS: "VALIDATION_004",
    INVALID_IP_ADDRESS: "VALIDATION_005",
    INVALID_PROVIDER: "VALIDATION_006",

    // CONFLICT
    CONFLICT_ERROR: "CONFLICT_001",
    CONFLICT_INPUT_ERROR: "CONFLICT_002",
    INSUFFICIENT_STOCK: "CONFLICT_003",

    // RATE LIMIT
    TOO_MANY_REQUESTS: "RATELIMIT_001",

    // TIMEOUT
    REQUEST_TIMEOUT_ERROR: "TIMEOUT_001",
    EXTERNAL_API_TIMEOUT: "TIMEOUT_002",

    // OAUTH
    OAUTH_EXCHANGE_FAILED: "OAUTH_001",

    // COMMON
    COMMON_ERROR: "COMMON_001",

    // INTERNAL
    INTERNAL_ERROR: "INTERNAL_001",
    TRANSACTION_ERROR: "INTERNAL_002",

} as const;

export type ErrorCode = typeof ERROR_CODE[keyof typeof ERROR_CODE];