# AUTH & USER MANAGEMENT — Toàn bộ Use-case & Luồng
*Phiên bản 4.0 — Production Final · Web-only · OTP Email 2FA*

---

## 📋 CHANGELOG v3.0 → v4.0

| Hạng mục | v3.0 (cũ) | v4.0 (mới) |
|---|---|---|
| Phone login | Phone + OTP SMS (3 bước) | **Phone + Password** (giống email) |
| Endpoints login/phone | `POST /auth/login/send-otp` + `/verify-otp` | **Đã xóa** |
| UC-04 — 2FA method | TOTP (Google Authenticator) | **OTP Email** |
| UC-04 — Gửi OTP | Không có | `POST /auth/2fa/send-otp` ← MỚI |
| UC-04 — `method` field | `["totp","backup_code"]` | `"otp_email"` (string) |
| UC-04 — Backup codes | Có (8 codes bcrypt) | **Đã xóa** |
| UC-12 — Bật 2FA | TOTP setup: QR + secret + backup codes | Chỉ xác nhận password |
| UC-12 — Tắt 2FA | `password + totp_code` | Chỉ `password` |
| Redis `otp:phone_login:{phone}` | Tồn tại | **Đã xóa** |
| Redis `otp:2fa:{temp_token}` | Không có | TTL 300s ← MỚI |
| Redis `2fa:setup:{user_id}` | Lưu TOTP secret tạm | **Đã xóa** |
| Redis `login:fail:{phone}` | Không có | TTL 900s ← MỚI |
| DB `two_factor_secret` | VARCHAR(64) lưu TOTP secret | **DROP COLUMN** |

---

## 📋 Danh sách Use-case

```
UC-01  Đăng ký tài khoản mới
UC-02  Xác minh email bằng OTP
UC-03  Đăng nhập (Email+Password / Phone+Password)
UC-04  Xác thực 2 lớp — 2FA OTP Email
UC-05  Refresh Access Token
UC-06  Đăng xuất (1 thiết bị)
UC-07  Đăng xuất tất cả thiết bị
UC-08  Quên mật khẩu → OTP → Đặt lại
UC-09  Đổi mật khẩu (đang đăng nhập)
UC-10  Đăng nhập / Đăng ký bằng OAuth
UC-11  Liên kết / Huỷ liên kết OAuth
UC-12  Bật / Tắt 2FA
UC-13  Xem danh sách phiên đăng nhập
UC-14  Revoke 1 phiên cụ thể
UC-15  Xác minh số điện thoại bằng OTP
```

## Tổng quan Endpoint Auth

```
# Đăng ký
POST /auth/check-email           ← kiểm tra email trước khi đăng ký
POST /auth/register              ← tạo tài khoản
POST /auth/verify-otp            ← xác minh email bằng OTP
POST /auth/resend-otp            ← gửi lại OTP xác minh email

# Đăng nhập
POST /auth/login                 ← duy nhất — nhận email hoặc phone, đều cần password

# 2FA (kích hoạt sau login khi two_factor_enabled = 1)
POST /auth/2fa/send-otp          ← gửi OTP email
POST /auth/2fa/verify            ← xác minh OTP → tạo session
POST /auth/2fa/enable            ← bật 2FA
POST /auth/2fa/disable           ← tắt 2FA

# Session
POST /auth/refresh               ← refresh access token
POST /auth/logout                ← đăng xuất 1 thiết bị
POST /auth/logout-all            ← đăng xuất tất cả

# Mật khẩu
POST /auth/forgot-password              ← yêu cầu reset
POST /auth/reset-password/verify-otp   ← xác minh OTP reset
POST /auth/reset-password              ← đặt mật khẩu mới
POST /auth/change-password             ← đổi mật khẩu (đã đăng nhập)

# OAuth
GET  /auth/oauth/{provider}                  ← khởi tạo OAuth
GET  /auth/oauth/{provider}/callback         ← callback
POST /auth/oauth/link                        ← liên kết bằng password
POST /auth/oauth/link/send-otp               ← gửi OTP liên kết (OAuth-only acc)
POST /auth/oauth/link/verify                 ← xác minh OTP liên kết
GET  /auth/oauth/{provider}/link             ← liên kết thêm provider (đã đăng nhập)
DELETE /auth/oauth/{provider}/link           ← huỷ liên kết

# Phone
POST /auth/phone/send-otp        ← gửi OTP xác minh SĐT (đã đăng nhập)
POST /auth/phone/verify          ← xác minh OTP SĐT

# Sessions
GET    /auth/sessions            ← danh sách phiên
DELETE /auth/sessions/{id}       ← revoke 1 phiên
```

> ⚠️ **Đã xóa:** `POST /auth/login/send-otp`, `POST /auth/login/verify-otp`,
> `POST /auth/2fa/setup`, `POST /auth/2fa/confirm`

---

## ⚠️ Ràng buộc bảo mật toàn cục

```
1. HTTPS bắt buộc — tất cả token (refresh, OTP session, grant) phải qua TLS
2. Refresh token → httpOnly; Secure; SameSite=Strict cookie (hoặc body nếu mobile)
3. Access token → memory only (không localStorage) ở web client
4. Mọi response trả token phải kèm: Referrer-Policy: no-referrer
5. Rate limit headers: Retry-After khi 429
6. User-Agent lưu trong device_info cho audit (không dùng để auth)
7. OTP luôn hash SHA256 trước khi lưu Redis — không lưu plaintext
8. Mọi token 1 lần dùng (OTP, grant, link) phải DEL ngay sau khi dùng
```

---

## 🗂️ Redis Key Reference (chuẩn duy nhất)

```
# OTP
otp:email_verify:{user_id}          TTL 300s    { otp_hash, attempt }
otp:pwreset:{user_id}               TTL 900s    { otp_hash, attempt }
otp:phone_verify:{user_id}          TTL 300s    { otp_hash, phone, attempt }
otp:2fa:{temp_token}                TTL 300s    { otp_hash, attempt, user_id }    ← MỚI v4

# Trạng thái tạm
2fa:pending:{temp_token}            TTL 300s    { user_id, ip, remember_me, device_info }
pwreset:session:{token}             TTL 900s    { user_id }
pwreset:grant:{token}               TTL 300s    { user_id }
oauth:state:{state}                 TTL 300s    { provider, pkce_verifier }
oauth:link:{token}                  TTL 600s    { user_id, provider, provider_user_id }

# Session
session:{token_hash}                TTL = expires_at - now    { user_id, system_role }
jwt:blacklist:{jti}                 TTL = exp còn lại         "1"

# Sliding rotation lock (chống race condition)
rotate:lock:{token_hash}            TTL 10s     "1"  (SET NX)
rotate:result:{token_hash}          TTL 10s     { new_access_token, new_refresh_token? }

# Rate limiting
ratelimit:check-email:{ip}          TTL 60s
ratelimit:register:{ip}             TTL 3600s
ratelimit:login:ip:{ip}             TTL 900s      ← IP chung cho cả hai nhánh
ratelimit:login:email:{email}       TTL 900s      ← nhánh email
ratelimit:login:phone:{phone_e164}  TTL 900s      ← nhánh phone
ratelimit:2fa:{user_id}             TTL 300s      ← rate limit send-otp 2FA  ← MỚI v4
ratelimit:pwreset:ip:{ip}           TTL 3600s
ratelimit:resend:{sha256(email)}    TTL 600s
ratelimit:sms:{user_id}             TTL 86400s
ratelimit:change-pw:{user_id}       TTL 3600s

# Đếm lỗi đăng nhập
login:fail:{email}                  TTL 900s      ← nhánh email
login:fail:{phone}                  TTL 900s      ← nhánh phone  ← MỚI v4
2fa:fail:{user_id}                  TTL 300s
```

> ⚠️ Mọi GET/SET/DEL OTP đều phải dùng đúng key prefix theo bảng trên.

---

# UC-01 — Đăng ký tài khoản mới

## Bước 1/4 — Kiểm tra Email

*Trigger: User blur khỏi ô email — không cần nhấn nút.*

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/check-email ►│                           │               │
  │  { email }               │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:check-email:{ip}  EX 60s  │
  │                          │  [> 20/phút → 429]        │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate format email    │               │
  │                          │  [sai → 422]              │               │
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email = ?          │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          │  [status = 'pending']     │               │
  │                          │  → 200 {                  │               │
  │                          │      available: false,    │               │
  │                          │      reason: 'pending_verification',      │
  │                          │      action: 'resend_otp',│               │
  │                          │      hint_email: masked   │               │
  │                          │    }                      │               │
  │                          │                           │               │
  │                          │  [active / inactive / banned]             │
  │                          │  → 409 "Email đã được sử dụng"            │
  │                          │                           │               │
  │                          │  [không tìm thấy]         │               │
  │                          │  → 200 { available: true }│               │
  │◄─────────────────────────┤                           │               │
```

> 📌 Không trả `user_id` — tránh user enumeration. `resend-otp` nhận `email`,
> server tự lookup với `status = 'pending'`.

---

## Bước 2/4 — Tạo mật khẩu *(pure client-side)*

```
Không gọi API.

Client validate realtime:
  ✓ Tối thiểu 8 ký tự
  ✓ Có chữ hoa A–Z
  ✓ Có chữ số 0–9
  ✓ Có ký tự đặc biệt !@#$...
  ✓ Confirm password khớp

State client giữ tạm: { email, password } — không gửi server cho đến Bước 3.
```

---

## Bước 3/4 — Nhập thông tin & Tạo tài khoản

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/register ───►│                           │               │
  │  {                       │                           │               │
  │    email,                │                           │               │
  │    password,             │                           │               │
  │    full_name,            │                           │               │
  │    phone (optional)      │                           │               │
  │  }                       │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:register:{ip}  EX 3600s   │
  │                          │  [> 5/giờ → 429]          │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate fields          │               │
  │                          │  [sai → 422]              │               │
  │                          │                           │               │
  │                          ├─ SELECT users WHERE email = ?            ►│
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [pending → 409 pending_verification]     │
  │                          │  [active/inactive/banned → 409]           │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ SELECT users WHERE phone = ? (nếu có) ──►│
  │                          │  [trùng → 409 "SĐT đã dùng"]             │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ bcrypt.hash(password, 12)│               │
  │                          │                           │               │
  │                          ├─ INSERT users ───────────►│               │
  │                          │  id=UUID(), status='pending'              │
  │                          │  email_verified_at=NULL   │               │
  │                          │  system_role='user'       │               │
  │                          │◄──────────────────────────┤               │
  │                          │  → user_id                │               │
  │                          │                           │               │
  │                          ├─ Sinh OTP 6 số            │               │
  │                          │  crypto.randomInt(100000, 999999)         │
  │                          │                           │               │
  │                          ├─ SET otp:email_verify:{user_id}──────────►│
  │                          │  { otp_hash: SHA256(otp), attempt: 0 }    │
  │                          │  EX 300                   │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Push → Email Queue (async)               │
  │◄─ 201 { message: "OTP sent" }                        │               │
  │   ← KHÔNG trả user_id    │                           │               │
```

---

## Bước 4/4 — Xác minh OTP Email

*Trigger: User điền đủ 6 số (auto-submit).*

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/verify-otp ─►│                           │               │
  │  { email, otp }          │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email = ?          │               │
  │                          │  AND status = 'pending'   │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ GET otp:email_verify:{user_id}──────────►│
  │                          │  [MISS → 400 "OTP hết hạn"]               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ attempt >= 5?            │               │
  │                          │  DEL otp:email_verify ───────────────────►│
  │                          │  → 429 "Khoá, yêu cầu OTP mới"            │
  │                          │                           │               │
  │                          ├─ SHA256(otp) vs otp_hash  │               │
  │                          │  [SAI] HINCRBY attempt +1────────────────►│
  │                          │  → 400 "Sai OTP, còn N lần"               │
  │                          │                           │               │
  │                          │  [ĐÚNG]                   │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  email_verified_at=NOW()  │               │
  │                          │  status='active'          │               │
  │                          │◄──────────────────────────┤               │
  │                          ├─ DEL otp:email_verify:{user_id}──────────►│
  │◄─ 200 { verified: true } │                           │               │
```

---

## ⏰ Xử lý tài khoản pending không xác minh

### Cơ chế 1 — Resend OTP

```
POST /auth/resend-otp { email }
  ├─ INCR ratelimit:resend:{sha256(email)}  EX 600s  [> 3/10 phút → 429]
  ├─ SELECT users WHERE email = ? AND status = 'pending'
  │  [không có → 400]
  ├─ DEL otp:email_verify:{user_id}    ← xoá OTP cũ trước
  ├─ Sinh OTP mới → SET EX 300
  └─ Push Email Queue → 200 OK
```

### Cơ chế 2 — Cron cleanup (chạy mỗi giờ)

```
SELECT id FROM users
  WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL 24 HOUR
  AND deleted_at IS NULL

→ UPDATE deleted_at = NOW()   ← soft delete, giữ audit trail
  (Hard delete sau 30 ngày bởi job riêng)
```

---

# UC-03 — Đăng nhập (Email + Password / Phone + Password)

> 📌 Phone chỉ là *identifier* thay thế email. Cơ chế xác thực **đồng nhất**:
> password bắt buộc cho cả hai nhánh. 2FA (OTP Email) áp dụng đồng nhất khi `two_factor_enabled = 1`.

## Bước 1 — Nhận diện identifier & rẽ nhánh

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/login ──────►│                           │               │
  │  {                       │                           │               │
  │    identifier,           │  ← email hoặc phone e164  │               │
  │    password,             │  ← bắt buộc cả hai nhánh  │               │
  │    identifier_type: 'email' | 'phone',      
  │    remember_me: bool,    │                           │               │
  │    device_info: {...}    │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit IP ──────────────────────────►│
  │                          │  INCR ratelimit:login:ip:{ip}  EX 900s    │
  │                          │  [> 20 → 429 + Retry-After]               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate password bắt buộc              │
  │                          │  [không có → 422]         │               │
  │                          │                           │               │
  │                          ├─ Detect identifier        │               │
  │                          │  isEmail? → [NHÁNH A]     │               │
  │                          │  isPhone? → [NHÁNH B]     │               │
  │                          │  [không khớp → 422]       │               │
```

---

### NHÁNH A — Email + Password

```
  [Từ detect email]
                            │
                            ├─ INCR ratelimit:login:email:{email} ─────►│
                            │  EX 900s  [> 10 → 429]    │               │
                            │◄─────────────────────────────────────────┤
                            │                           │               │
                            ├─ SELECT users ───────────►│               │
                            │  WHERE email = ?          │               │
                            │  AND deleted_at IS NULL   │               │
                            │◄──────────────────────────┤               │
                            │  [không thấy → 404]       │               │
                            │  [banned  → 403]          │               │
                            │  [inactive → 403]         │               │
                            │  [pending  → 403          │               │
                            │   "Chưa xác minh email"]  │               │
                            │                           │               │
                            ├─ bcrypt.compare(pw, hash) │               │
                            │                           │               │
                            │  [SAI]                    │               │
                            │  INCR login:fail:{email} ────────────────►│
                            │  EX 900s → 401            │               │
                            │                           │               │
                            │  [sai >= 10 lần]          │               │
                            │  UPDATE status='inactive'►│               │
                            │  → 403 "Tài khoản bị khoá"│               │
                            │                           │               │
                            │  [ĐÚNG]                   │               │
                            │  DEL login:fail:{email} ─────────────────►│
                            │                           │               │
                            ├─ two_factor_enabled = 1?  │               │
                            │  [CÓ]    → sang UC-04     │               │
                            │  [KHÔNG] → Tạo session    │               │
                           ◄─ 200 { access_token, refresh_token }
```

---

### NHÁNH B — Phone + Password

```
  [Từ detect phone]
                            │
                            ├─ INCR ratelimit:login:phone:{phone_e164} ►│
                            │  EX 900s  [> 10 → 429]    │               │
                            │◄─────────────────────────────────────────┤
                            │                           │               │
                            ├─ SELECT users ───────────►│               │
                            │  WHERE phone = ?          │               │
                            │  AND deleted_at IS NULL   │               │
                            │◄──────────────────────────┤               │
                            │  [không thấy → 400]       │               │
                            │  [banned  → 403]          │               │
                            │  [inactive → 403]         │               │
                            │  [pending  → 403          │               │
                            │   "Chưa xác minh email"]  │               │
                            │                           │               │
                            ├─ bcrypt.compare(pw, hash) │               │
                            │                           │               │
                            │  [SAI]                    │               │
                            │  INCR login:fail:{phone} ────────────────►│
                            │  EX 900s → 401            │               │
                            │                           │               │
                            │  [sai >= 10 lần]          │               │
                            │  UPDATE status='inactive'►│               │
                            │  → 403 "Tài khoản bị khoá"│               │
                            │                           │               │
                            │  [ĐÚNG]                   │               │
                            │  DEL login:fail:{phone} ─────────────────►│
                            │                           │               │
                            ├─ two_factor_enabled = 1?  │               │
                            │  [CÓ]    → sang UC-04     │               │
                            │  [KHÔNG] → Tạo session    │               │
                           ◄─ 200 { access_token, refresh_token }
```

> 📌 NHÁNH B hoàn toàn giống NHÁNH A — chỉ khác `WHERE phone = ?`
> và key rate limit / login:fail dùng `{phone}` thay `{email}`.

---

## Tạo session *(dùng chung cho cả hai nhánh)*

```
Server
  ├─ Sinh access_token JWT
  │    payload: { user_id, system_role, jti: UUID(), iat, exp }
  │    exp = 15 phút  |  algorithm: RS256
  │
  ├─ Sinh refresh_token
  │    serect_key
  │    TTL = remember_me=true ? 30 ngày : 24 giờ
  │
  ├─ INSERT user_sessions
  │    token_hash  = SHA256(refresh_token)
  │    expires_at  = now + TTL
  │    remember_me = ?
  │    device_info = { browser, os, device, user_agent }
  │    ip_address  = req_ip
  │
  ├─ SET session:{SHA256(refresh_token)}
  │    { user_id, system_role }  EX = TTL
  │
  └─ UPDATE users
       last_login_at = NOW()
       last_login_ip = req_ip
```

---

# UC-04 — Xác thực 2FA (OTP Email)

*Kích hoạt sau UC-03 hoặc UC-10 khi `two_factor_enabled = 1`.*

> 📌 2FA dùng OTP 6 số gửi qua email — không còn TOTP, không cần backup codes.
> Luồng 3 bước rõ ràng: **nhận temp_token → gửi OTP → xác minh OTP → tạo session**.

## Luồng tổng quan

```
  [Login / OAuth thành công — two_factor_enabled = 1]
           │
           ▼
  BƯỚC 1: Server → 200 { state:"2fa_required", temp_token, method:"otp_email" }
           │
           ▼
  BƯỚC 2: POST /auth/2fa/send-otp { temp_token }
           │   → Server gửi OTP 6 số vào email của user
           │
           ▼
  BƯỚC 3: POST /auth/2fa/verify { temp_token, otp }
           │   [ĐÚNG] → DEL các key Redis → Tạo session
           ▼
         200 { access_token, refresh_token }
```

---

## Bước 1/3 — Trả 2fa_required *(trong UC-03 / UC-10)*

```
  [Sau khi password đúng hoặc OAuth profile thành công]

  Server
    ├─ Sinh temp_token = crypto.randomBytes(32).toString('hex')
    ├─ SET 2fa:pending:{temp_token}
    │    { user_id, ip: req_ip, remember_me, device_info }
    │    EX 300
    │
    └─ 200 {
         state:      "2fa_required",
         temp_token: "...",
         method:     "otp_email"
       }
```

---

## Bước 2/3 — Gửi OTP Email

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/2fa/send-otp►│                           │               │
  │  { temp_token }          │                           │               │
  │                          │                           │               │
  │                          ├─ GET 2fa:pending:{token} ────────────────►│
  │                          │  [MISS → 400 "Phiên hết hạn"]             │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ IP check                 │               │
  │                          │  stored_ip ≠ req_ip       │               │
  │                          │  → 400 "Phiên không hợp lệ"               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:2fa:{user_id}  EX 300s    │
  │                          │  [> 3 → 429]              │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ SELECT users WHERE id=? ►│               │
  │                          │  (lấy email để gửi)       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Sinh OTP 6 số            │               │
  │                          │  crypto.randomInt(100000, 999999)         │
  │                          │                           │               │
  │                          ├─ SET otp:2fa:{temp_token}────────────────►│
  │                          │  { otp_hash: SHA256(otp), │               │
  │                          │    attempt: 0,            │               │
  │                          │    user_id }              │               │
  │                          │  EX 300                   │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Push → Email Queue (async)               │
  │◄─ 200 { message: "OTP sent", expires_in: 300 }       │               │
```

> 📌 Key Redis dùng `temp_token` thay `user_id` để tránh collision khi user
> mở nhiều tab cùng lúc.

---

## Bước 3/3 — Xác minh OTP & Tạo session

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/2fa/verify ─►│                           │               │
  │  { temp_token, otp }     │                           │               │
  │                          │                           │               │
  │                          ├─ GET 2fa:pending:{token} ────────────────►│
  │                          │  [MISS → 400 "Phiên hết hạn"]             │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ IP check                 │               │
  │                          │  [khác → 400]             │               │
  │                          │                           │               │
  │                          ├─ INCR 2fa:fail:{user_id} ────────────────►│
  │                          │  EX 300s                  │               │
  │                          │  [> 5 → DEL 2fa:pending,  │               │
  │                          │    429 "Khoá 2FA"]        │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ GET otp:2fa:{temp_token}────────────────►│
  │                          │  [MISS → 400 "OTP hết hạn,│               │
  │                          │   gọi send-otp lại"]      │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ attempt >= 5?            │               │
  │                          │  DEL otp:2fa:{temp_token}────────────────►│
  │                          │  → 400 "Khoá OTP"         │               │
  │                          │                           │               │
  │                          ├─ SHA256(otp) vs otp_hash  │               │
  │                          │                           │               │
  │                          │  [SAI]                    │               │
  │                          │  HINCRBY attempt +1 ─────────────────────►│
  │                          │  → 401 "Sai OTP, còn N lần"               │
  │                          │                           │               │
  │                          │  [ĐÚNG]                   │               │
  │                          ├─ DEL 2fa:pending:{token} ────────────────►│
  │                          ├─ DEL otp:2fa:{temp_token}────────────────►│
  │                          ├─ DEL 2fa:fail:{user_id} ─────────────────►│
  │                          │                           │               │
  │                          ├─ Tạo session (như UC-03)  │               │
  │◄─ 200 { access_token, refresh_token }               │               │
```

> 📌 Khi OTP hết hạn ở Bước 3: client cho phép gọi lại `send-otp` với
> cùng `temp_token` nếu `2fa:pending` còn TTL.

---

# UC-05 — Refresh Access Token

*Gọi tự động khi access_token hết hạn (401).*

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/refresh ────►│                           │               │
  │  { refresh_token }       │                           │               │
  │  (hoặc httpOnly cookie)  │                           │               │
  │                          │                           │               │
  │                          ├─ token_hash = SHA256(rt)  │               │
  │                          │                           │               │
  │                          ├─ GET session:{hash} ─────────────────────►│
  │                          │◄─────────────────────────────────────────┤
  │                          │  [HIT] → dùng luôn, bỏ qua MySQL         │
  │                          │                           │               │
  │                          │  [MISS]                   │               │
  │                          │  SELECT user_sessions ───►│               │
  │                          │  WHERE token_hash = ?     │               │
  │                          │  AND is_revoked = 0       │               │
  │                          │  AND expires_at > NOW()   │               │
  │                          │  [không tìm / revoked / hết hạn → 401]   │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ SELECT users status ────►│               │
  │                          │  [banned / inactive → 401]│               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Sliding session check    │               │
  │                          │  remember_me=0:           │               │
  │                          │    expires < now+1d → rotate              │
  │                          │  remember_me=1:           │               │
  │                          │    expires < now+7d → rotate              │
  │                          │    expires > now+7d → giữ nguyên          │
  │                          │                           │               │
  │                          ├─ [Nếu rotate]             │               │
  │                          │  SET NX rotate:lock:{hash}────────────────►│
  │                          │  EX 10s                   │               │
  │                          │  [HIT lock] GET rotate:result:{hash}      │
  │                          │           → trả cached result             │
  │                          │                           │               │
  │                          ├─ Sinh access_token mới    │               │
  │                          │  (jti mới, exp +15 phút)  │               │
  │                          │                           │               │
  │                          ├─ [Nếu rotate]             │               │
  │                          │  INSERT session mới ─────►│               │
  │                          │  UPDATE cũ is_revoked=1  ►│               │
  │                          │  SET rotate:result:{hash}────────────────►│
  │                          │  EX 10s                   │               │
  │                          │                           │               │
  │◄─ 200 {                  │                           │               │
  │    access_token,         │                           │               │
  │    refresh_token?        │  ← có khi rotate          │               │
  │  }                       │                           │               │
```

---

# UC-06 — Đăng xuất (1 thiết bị)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/logout ─────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  { refresh_token }       │                           │               │
  │                          │                           │               │
  │                          ├─ token_hash = SHA256(rt)  │               │
  │                          │                           │               │
  │                          ├─ UPDATE user_sessions ───►│               │
  │                          │  SET is_revoked=1          │               │
  │                          │  WHERE token_hash=?       │               │
  │                          │                           │               │
  │                          ├─ DEL session:{token_hash}────────────────►│
  │                          │                           │               │
  │                          ├─ SET jwt:blacklist:{jti} ────────────────►│
  │                          │  EX remaining_jwt_ttl     │               │
  │◄─ 200 { logged_out: true }│                          │               │
```

---

# UC-07 — Đăng xuất tất cả thiết bị

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/logout-all ─►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT user_sessions ───►│               │
  │                          │  WHERE user_id=?          │               │
  │                          │  AND is_revoked=0         │               │
  │                          │  AND expires_at > NOW()   │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE all is_revoked=1 ►│               │
  │                          │                           │               │
  │                          ├─ DEL session:{hash} (mỗi session)────────►│
  │                          │                           │               │
  │                          ├─ SET jwt:blacklist:{jti} ────────────────►│
  │                          │  (current token) EX ttl   │               │
  │◄─ 200 { logged_out_count: N }                        │               │
```

---

# UC-08 — Quên mật khẩu → OTP → Đặt lại

## Bước 1/3 — Yêu cầu reset

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/             │                           │               │
  │   forgot-password ──────►│                           │               │
  │  { email }               │                           │               │
  │                          │                           │               │
  │                          ├─ INCR ratelimit:pwreset:ip:{ip} EX 3600s ►│
  │                          │  [> 5/giờ → 429]          │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email=?            │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │◄──────────────────────────┤               │
  │                          │  [không tìm / banned]     │               │
  │                          │  → vẫn 200 (timing-safe)  │               │
  │                          │                           │               │
  │                          │  [active / inactive]      │               │
  │                          ├─ Sinh session_token (32B hex)             │
  │                          ├─ SET pwreset:session:{token}─────────────►│
  │                          │  { user_id }  EX 900      │               │
  │                          ├─ DEL otp:pwreset:{user_id}────────────────►│
  │                          │  (xoá OTP cũ nếu có)      │               │
  │                          ├─ Sinh OTP → SET otp:pwreset:{user_id} ───►│
  │                          │  { otp_hash, attempt:0 }  EX 900          │
  │                          ├─ Push Email Queue         │               │
  │◄─ 200 {                  │                           │               │
  │    message: "If email exists, OTP sent",             │               │
  │    session_token         │                           │               │
  │  }                       │                           │               │
```

## Bước 2/3 — Xác minh OTP

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/reset-password/verify-otp               │               │
  │  { session_token, otp } ►│                           │               │
  │                          │                           │               │
  │                          ├─ GET pwreset:session:{token}─────────────►│
  │                          │  [MISS → 400 "Phiên hết hạn"]             │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ GET otp:pwreset:{user_id}────────────────►│
  │                          │  [MISS → 400]             │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ attempt >= 5?            │               │
  │                          │  DEL cả hai key ─────────────────────────►│
  │                          │  → 400 "Khoá"             │               │
  │                          │                           │               │
  │                          ├─ SHA256(otp) vs otp_hash  │               │
  │                          │  [SAI] attempt+1 → 400    │               │
  │                          │                           │               │
  │                          │  [ĐÚNG]                   │               │
  │                          ├─ Sinh grant_token (32B hex)               │
  │                          ├─ SET pwreset:grant:{grant_token}─────────►│
  │                          │  { user_id }  EX 300      │               │
  │                          ├─ DEL pwreset:session:{token}─────────────►│
  │                          ├─ DEL otp:pwreset:{user_id}────────────────►│
  │◄─ 200 { reset_grant_token }                          │               │
```

## Bước 3/3 — Đặt mật khẩu mới

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/             │                           │               │
  │   reset-password ───────►│                           │               │
  │  {                       │                           │               │
  │    reset_grant_token,    │                           │               │
  │    new_password          │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ GET pwreset:grant:{token}────────────────►│
  │                          │  [MISS → 400]             │               │
  │                          │◄─────────────────────────────────────────┤
  │                          ├─ DEL pwreset:grant:{token}────────────────►│
  │                          │  (single-use ngay lập tức)│               │
  │                          │                           │               │
  │                          ├─ Validate password strength               │
  │                          │  [yếu → 422]              │               │
  │                          │                           │               │
  │                          ├─ bcrypt.hash(new_pw, 12)  │               │
  │                          │                           │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  password_hash = ?        │               │
  │                          │  status = 'active'        │               │
  │                          │  (inactive → active)      │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ SELECT + revoke all sessions             │
  │                          │  UPDATE is_revoked=1 ────►│               │
  │                          ├─ DEL session:{hash} (tất cả)─────────────►│
  │◄─ 200 { reset: true }    │                           │               │
```

---

# UC-09 — Đổi mật khẩu (đang đăng nhập)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/             │                           │               │
  │   change-password ──────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  { current_password,     │                           │               │
  │    new_password }        │                           │               │
  │                          │                           │               │
  │                          ├─ INCR ratelimit:change-pw:{user_id}──────►│
  │                          │  EX 3600s  [> 5 → 429]    │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │◄──────────────────────────┤               │
  │                          │  [password_hash IS NULL]  │               │
  │                          │  → 400 "Tài khoản OAuth,  │               │
  │                          │    không có mật khẩu"     │               │
  │                          │                           │               │
  │                          ├─ bcrypt.compare(curr, hash)               │
  │                          │  [sai → 401]              │               │
  │                          │                           │               │
  │                          ├─ Validate new_password    │               │
  │                          │  [yếu → 422]              │               │
  │                          │                           │               │
  │                          ├─ bcrypt.hash(new_pw, 12)  │               │
  │                          ├─ UPDATE users pw_hash ───►│               │
  │                          │                           │               │
  │                          ├─ Revoke tất cả session    │               │
  │                          │  trừ current ────────────►│               │
  │                          ├─ DEL session:{hash} ─────────────────────►│
  │                          │  (tất cả trừ current)     │               │
  │◄─ 200 { changed: true }  │                           │               │
```

---

# UC-10 — Đăng nhập / Đăng ký bằng OAuth

## Bước 1 — Khởi tạo

```
GET /auth/oauth/{provider}   (Google | Facebook | Apple | Zalo)

Server
  ├─ state = crypto.randomBytes(16).toString('hex')
  ├─ Sinh code_verifier (PKCE)
  ├─ SET oauth:state:{state} { provider, pkce_verifier }  EX 300
  └─ Redirect → provider auth URL (+ state + code_challenge)
```

## Bước 2 — Callback & Rẽ 3 CASE

```
GET /auth/oauth/{provider}/callback?code=...&state=...

  1. GET oauth:state:{state}       [MISS → 400 CSRF fail]
  2. DEL oauth:state:{state}
  3. Exchange code → access_token → fetch provider profile
     { provider_user_id, email, full_name, avatar_url }
  4. Rẽ nhánh:
```

### CASE A — Đã liên kết

```
SELECT oauth_providers
  WHERE provider=? AND provider_user_id=?
  [tìm thấy]
    SELECT users  [banned → 403]
    two_factor_enabled=1 → sang UC-04
    [KHÔNG] → Tạo session → 200 tokens
```

### CASE B — Email tồn tại, chưa liên kết

```
[Có password_hash]
  Sinh link_token → SET oauth:link:{token}  EX 600
  200 { state:"link_required", link_token, masked_email }

  POST /auth/oauth/link { link_token, password }
    GET oauth:link:{token} → { user_id, provider, provider_user_id }
    bcrypt.compare(password)   [sai → 401]
    [đúng]
      INSERT oauth_providers
      DEL oauth:link:{token}
      → Tạo session → 200 tokens

[KHÔNG có password_hash — OAuth-only account]
  Sinh link_token → SET oauth:link:{token}  EX 600
  200 { state:"link_required_otp", link_token, masked_email }

  POST /auth/oauth/link/send-otp { link_token }
    → Gửi OTP vào email của user

  POST /auth/oauth/link/verify { link_token, otp }
    → OTP đúng → INSERT oauth_providers → Tạo session → 200 tokens
```

### CASE C — Email chưa tồn tại (đăng ký mới)

```
INSERT users
  email             = provider_email
  full_name         = provider_name
  avatar_url        = provider_avatar
  status            = 'active'        ← provider đã verify email
  email_verified_at = NOW()
  password_hash     = NULL            ← OAuth-only account

INSERT oauth_providers

→ Tạo session → 201 { is_new_user: true, tokens }
```

---

# UC-11 — Liên kết / Huỷ liên kết OAuth

```
# Liên kết thêm provider (đang đăng nhập):
GET /auth/oauth/{provider}/link    Authorization: Bearer
  → Flow giống UC-10 nhưng user đã auth sẵn
  → INSERT oauth_providers cho user hiện tại

# Huỷ liên kết:
DELETE /auth/oauth/{provider}/link    Authorization: Bearer
  │
  ├─ Kiểm tra còn cách login khác?
  │  [password_hash IS NOT NULL] → OK xoá
  │  [Chỉ 1 provider, không có password] → 400
  │  "Cần giữ ít nhất 1 phương thức đăng nhập"
  │
  ├─ DELETE oauth_providers WHERE user_id=? AND provider=?
  └─ 200 { unlinked: true }
```

---

# UC-12 — Bật / Tắt 2FA

> 📌 2FA là OTP Email — chỉ cần bật/tắt flag. Không có TOTP setup, không có QR code,
> không có backup codes.

## Bật 2FA

```
Client                    Server                      MySQL
  │                          │                           │
  ├─ POST /auth/2fa/enable ─►│                           │
  │  Authorization: Bearer   │                           │
  │  { password }            │                           │
  │                          │                           │
  │                          ├─ SELECT users ───────────►│
  │                          │◄──────────────────────────┤
  │                          │                           │
  │                          │  [two_factor_enabled=1]   │
  │                          │  → 400 "Đã bật 2FA rồi"  │
  │                          │                           │
  │                          │  [password_hash IS NULL]  │
  │                          │  → 400 "Đặt mật khẩu     │
  │                          │    trước khi bật 2FA"     │
  │                          │                           │
  │                          │  [email_verified_at NULL] │
  │                          │  → 400 "Xác minh email   │
  │                          │    trước"                 │
  │                          │                           │
  │                          ├─ bcrypt.compare(pw, hash) │
  │                          │  [sai → 401]              │
  │                          │                           │
  │                          ├─ UPDATE users ───────────►│
  │                          │  two_factor_enabled=1     │
  │                          │◄──────────────────────────┤
  │◄─ 200 { enabled: true }  │                           │
```

## Tắt 2FA

```
Client                    Server                      MySQL
  │                          │                           │
  ├─ POST /auth/2fa/disable ►│                           │
  │  Authorization: Bearer   │                           │
  │  { password }            │                           │
  │                          │                           │
  │                          ├─ SELECT users ───────────►│
  │                          │◄──────────────────────────┤
  │                          │                           │
  │                          │  [two_factor_enabled=0]   │
  │                          │  → 400 "Chưa bật 2FA"    │
  │                          │                           │
  │                          ├─ bcrypt.compare(pw, hash) │
  │                          │  [sai → 401]              │
  │                          │                           │
  │                          ├─ UPDATE users ───────────►│
  │                          │  two_factor_enabled=0     │
  │                          │◄──────────────────────────┤
  │◄─ 200 { disabled: true } │                           │
```

> 📌 Tắt 2FA không revoke session hiện tại. Lần login tiếp theo không cần OTP.

> ⚠️ **DB Migration:** `ALTER TABLE users DROP COLUMN two_factor_secret;`

---

# UC-13 — Xem danh sách phiên đăng nhập

```
Client                    Server                      MySQL
  │                          │                           │
  ├─ GET /auth/sessions ────►│                           │
  │  Authorization: Bearer   │                           │
  │                          │                           │
  │                          ├─ SELECT user_sessions ───►│
  │                          │  WHERE user_id=?          │
  │                          │  AND is_revoked=0         │
  │                          │  AND expires_at > NOW()   │
  │                          │  ORDER BY created_at DESC │
  │                          │◄──────────────────────────┤
  │                          │                           │
  │                          ├─ Đánh dấu current session │
  │                          │  (so SHA256(current_rt)   │
  │                          │   với từng token_hash)    │
  │◄─ 200 { sessions: [      │                           │
  │    {                     │                           │
  │      id,                 │                           │
  │      device_info,        │                           │
  │      ip_address,         │                           │
  │      created_at,         │                           │
  │      expires_at,         │                           │
  │      is_current: bool    │                           │
  │    }                     │                           │
  │  ]}                      │                           │
```

---

# UC-14 — Revoke 1 phiên cụ thể

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ DELETE /auth/sessions   │                           │               │
  │    /{session_id} ───────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT user_sessions ───►│               │
  │                          │  WHERE id=?               │               │
  │                          │  AND user_id=?            │               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE is_revoked=1 ────►│               │
  │                          ├─ DEL session:{token_hash}────────────────►│
  │                          │                           │               │
  │                          ├─ Nếu là current session:  │               │
  │                          │  SET jwt:blacklist:{jti} ────────────────►│
  │                          │  EX remaining_ttl         │               │
  │◄─ 200 { revoked: true }  │                           │               │
```

---

# UC-15 — Xác minh số điện thoại bằng OTP

```
# Gửi OTP:
POST /auth/phone/send-otp    Authorization: Bearer    { phone }
  │
  ├─ INCR ratelimit:sms:{user_id}  EX 86400s  [> 5/ngày → 429]
  ├─ SELECT users WHERE phone=?  [trùng người khác → 409]
  ├─ Sinh OTP → SET otp:phone_verify:{user_id}
  │  { otp_hash, phone, attempt:0 }  EX 300
  ├─ Push SMS Queue
  └─ 200 { message: "OTP sent", expires_in: 300 }

# Xác minh:
POST /auth/phone/verify    Authorization: Bearer    { otp }
  │
  ├─ GET otp:phone_verify:{user_id}  [MISS → 400 "OTP hết hạn"]
  ├─ attempt >= 5? → DEL → 400 "Khoá"
  ├─ SHA256(otp) vs otp_hash
  │  [SAI] HINCRBY attempt+1 → 400 "Sai OTP, còn N lần"
  │  [ĐÚNG]
  │    UPDATE users SET phone=stored_phone, phone_verified_at=NOW()
  │    DEL otp:phone_verify:{user_id}
  └─ 200 { verified: true }
```

---

# 🔐 JWT Auth Middleware

```
Áp dụng cho mọi protected route:

  ├─ Lấy Bearer token từ Authorization header
  │  [không có → 401]
  │
  ├─ JWT.verify(token, publicKey)
  │  [chữ ký sai → 401]
  │  [expired   → 401 "Token hết hạn, hãy refresh"]
  │
  ├─ GET jwt:blacklist:{jti}  từ Redis
  │  [HIT → 401 "Token đã bị thu hồi"]
  │
  ├─ Decode payload: { user_id, system_role, jti, iat, exp }
  │  inject vào req.user
  │
  ├─ [Route cần restaurant_role]
  │  → query restaurant_members riêng
  │  → KHÔNG lưu restaurant_role vào JWT
  │    (JWT = platform-level auth, restaurant RBAC = layer riêng)
  │
  └─ next()

NOTE: Middleware KHÔNG query users table mỗi request.
      Trạng thái banned/inactive chỉ hiệu lực ngay lập tức khi:
        1. Refresh token bị revoke (session invalidated)
        2. JWT hết hạn (tối đa 15 phút)
      Đây là đánh đổi chấp nhận được với JWT stateless.
      Instant ban: thêm jwt:blacklist:{jti} cho current token.
```

---

# 🗺️ Redis Key Reference *(tổng hợp cuối)*

```
# OTP
otp:email_verify:{user_id}          TTL 300s    { otp_hash, attempt }
otp:pwreset:{user_id}               TTL 900s    { otp_hash, attempt }
otp:phone_verify:{user_id}          TTL 300s    { otp_hash, phone, attempt }
otp:2fa:{temp_token}                TTL 300s    { otp_hash, attempt, user_id }

# Trạng thái tạm
2fa:pending:{temp_token}            TTL 300s    { user_id, ip, remember_me, device_info }
pwreset:session:{token}             TTL 900s    { user_id }
pwreset:grant:{token}               TTL 300s    { user_id }
oauth:state:{state}                 TTL 300s    { provider, pkce_verifier }
oauth:link:{token}                  TTL 600s    { user_id, provider, provider_user_id }

# Session
session:{token_hash}                TTL = expires_at - now    { user_id, system_role }
jwt:blacklist:{jti}                 TTL = exp còn lại         "1"

# Sliding rotation lock
rotate:lock:{token_hash}            TTL 10s     "1"  (SET NX)
rotate:result:{token_hash}          TTL 10s     { new_access_token, new_refresh_token? }

# Rate limiting
ratelimit:check-email:{ip}          TTL 60s
ratelimit:register:{ip}             TTL 3600s
ratelimit:login:ip:{ip}             TTL 900s
ratelimit:login:email:{email}       TTL 900s
ratelimit:login:phone:{phone_e164}  TTL 900s
ratelimit:2fa:{user_id}             TTL 300s
ratelimit:pwreset:ip:{ip}           TTL 3600s
ratelimit:resend:{sha256(email)}    TTL 600s
ratelimit:sms:{user_id}             TTL 86400s
ratelimit:change-pw:{user_id}       TTL 3600s

# Đếm lỗi
login:fail:{email}                  TTL 900s
login:fail:{phone}                  TTL 900s
2fa:fail:{user_id}                  TTL 300s
```

---

# 📋 Test Case Coverage

## UC-01 — Đăng ký

| ID | Scenario | Expected |
|----|----------|----------|
| T01-01 | Email hợp lệ, chưa tồn tại | 200 `available: true` |
| T01-02 | Email format sai | 422 |
| T01-03 | Email đã active | 409 |
| T01-04 | Email đang pending | 200 `available: false, reason: pending_verification` |
| T01-05 | Register thành công | 201, OTP gửi, status=pending, không trả user_id |
| T01-06 | Register email đang pending | 409 `pending_verification` |
| T01-07 | Phone đã dùng bởi user khác | 409 |
| T01-08 | OTP đúng → verify | 200, status=active |
| T01-09 | OTP sai 5 lần → khoá | 429 locked |
| T01-10 | OTP hết hạn (sau 5 phút) | 400 expired |
| T01-11 | Resend OTP → OTP cũ bị xoá | 200, OTP cũ không dùng được |
| T01-12 | Resend OTP > 3 lần/10 phút | 429 |
| T01-13 | Resend OTP với email không pending | 400 |
| T01-14 | Cron cleanup: account pending > 24h | soft deleted |
| T01-15 | Register > 5 lần/giờ cùng IP | 429 |

## UC-03 — Đăng nhập

| ID | Scenario | Expected |
|----|----------|----------|
| T03-01 | identifier là email | detect → nhánh email |
| T03-02 | identifier là phone | detect → nhánh phone |
| T03-03 | identifier không phải email lẫn phone | 422 |
| T03-04 | Không gửi password | 422 |
| T03-05 | Email + password đúng, không 2FA | 200 tokens |
| T03-06 | Email + password đúng, có 2FA | 200 `state:"2fa_required", method:"otp_email"` |
| T03-07 | Phone + password đúng, không 2FA | 200 tokens |
| T03-08 | Phone + password đúng, có 2FA | 200 `state:"2fa_required", method:"otp_email"` |
| T03-09 | Sai password (email) | 401 |
| T03-10 | Sai password (phone) | 401 |
| T03-11 | Sai password email >= 10 lần → inactive | 403 |
| T03-12 | Sai password phone >= 10 lần → inactive | 403 |
| T03-13 | Login với account inactive | 403 |
| T03-14 | Login với account banned | 403 |
| T03-15 | Login với account pending | 403 "Chưa xác minh email" |
| T03-16 | remember_me=true → refresh TTL 30 ngày | ✓ |
| T03-17 | remember_me=false → refresh TTL 24h | ✓ |
| T03-18 | > 20 req/15 phút cùng IP | 429 |
| T03-19 | > 10 login/15 phút cùng email | 429 |
| T03-20 | > 10 login/15 phút cùng phone | 429 |
| T03-21 | Phone không tồn tại trong DB | 401 |

## UC-04 — 2FA OTP Email

| ID | Scenario | Expected |
|----|----------|----------|
| T04-01 | send-otp: temp_token hết hạn | 400 "Phiên hết hạn" |
| T04-02 | send-otp: IP khác 2fa:pending | 400 "Phiên không hợp lệ" |
| T04-03 | send-otp: > 3 lần/5 phút | 429 |
| T04-04 | send-otp thành công | 200 `expires_in: 300` |
| T04-05 | verify: OTP đúng | 200 tokens |
| T04-06 | verify: OTP sai | 400 còn N lần |
| T04-07 | verify: OTP sai 5 lần | 400 locked |
| T04-08 | verify: OTP hết hạn | 400 "OTP hết hạn, gọi send-otp lại" |
| T04-09 | verify: temp_token hết hạn | 400 "Phiên hết hạn" |
| T04-10 | verify: 2fa:fail > 5 lần | 400 locked, DEL 2fa:pending |
| T04-11 | OAuth login + 2FA enabled | 200 `2fa_required` |
| T04-12 | OTP hết hạn → gọi lại send-otp (temp_token còn hạn) | 200 OTP mới gửi |

## UC-05 — Refresh Token

| ID | Scenario | Expected |
|----|----------|----------|
| T05-01 | Refresh hợp lệ | 200 access_token mới |
| T05-02 | Refresh token revoked | 401 |
| T05-03 | Refresh token hết hạn | 401 |
| T05-04 | remember_me=0, còn < 1 ngày → rotate | refresh_token mới |
| T05-05 | remember_me=1, còn < 7 ngày → rotate | refresh_token mới |
| T05-06 | remember_me=1, còn > 7 ngày | refresh_token giữ nguyên |
| T05-07 | 2 tab đồng thời gọi refresh (race) | chỉ 1 rotate, cả 2 nhận AT mới |
| T05-08 | User bị ban → refresh thất bại | 401 |

## UC-08 — Quên mật khẩu

| ID | Scenario | Expected |
|----|----------|----------|
| T08-01 | Email không tồn tại | 200 (timing-safe, không leak) |
| T08-02 | Email tồn tại | 200 + OTP gửi + session_token |
| T08-03 | Gọi forgot-pw lần 2 → OTP cũ bị invalidate | ✓ |
| T08-04 | OTP đúng | 200 reset_grant_token |
| T08-05 | OTP sai 5 lần | 400 locked |
| T08-06 | reset_grant_token dùng 1 lần, lần 2 thất bại | 400 |
| T08-07 | Reset pw → account inactive → về active | ✓ |
| T08-08 | Reset pw → tất cả session bị revoke | ✓ |
| T08-09 | > 5 lần/giờ cùng IP | 429 |

## UC-10 — OAuth

| ID | Scenario | Expected |
|----|----------|----------|
| T10-01 | CASE A: đã link, login bình thường | 200 tokens |
| T10-02 | CASE A: user bị banned | 403 |
| T10-03 | CASE A: user có 2FA → UC-04 | ✓ 2fa_required |
| T10-04 | CASE B: email đã tồn tại, có password | 200 `state:link_required` |
| T10-05 | CASE B: xác nhận link + đúng password | 200 tokens + linked |
| T10-06 | CASE B: xác nhận link + sai password | 401 |
| T10-07 | CASE B: email tồn tại, không có password (OAuth-only) | 200 `state:link_required_otp` |
| T10-08 | CASE B: xác nhận link qua OTP email | 200 tokens + linked |
| T10-09 | CASE C: email mới → đăng ký | 201 `is_new_user: true` |
| T10-10 | state token sai / hết hạn | 400 CSRF fail |

## UC-12 — 2FA Enable/Disable

| ID | Scenario | Expected |
|----|----------|----------|
| T12-01 | Enable: password đúng, email verified | 200 `enabled: true` |
| T12-02 | Enable: password sai | 401 |
| T12-03 | Enable: OAuth-only (không có password_hash) | 400 |
| T12-04 | Enable: email chưa verified | 400 |
| T12-05 | Enable: đã bật 2FA rồi | 400 |
| T12-06 | Disable: password đúng | 200 `disabled: true` |
| T12-07 | Disable: password sai | 401 |
| T12-08 | Disable: chưa bật 2FA | 400 |
| T12-09 | Sau disable: login không cần OTP 2FA | ✓ |