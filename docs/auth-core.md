## AUTH & USER MANAGEMENT — Toàn bộ Use-case & Luồng
*(Phiên bản 3.0 — Production Final)*

---

# 📋 DANH SÁCH USE-CASE

```
UC-01  Đăng ký tài khoản mới
UC-02  Xác minh email bằng OTP
UC-03  Đăng nhập (Email+Password / Phone+OTP)
UC-04  Xác thực 2 lớp (2FA - TOTP)
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

## Tổng quan API Login

```
POST /auth/login           ← điểm vào duy nhất, detect method từ identifier
POST /auth/login/send-otp  ← step 2 nếu phone (gửi OTP)
POST /auth/login/verify-otp← step 3 nếu phone (xác minh OTP + tạo session)
```

> 📌 **Lý do thiết kế:**
> Client chỉ cần 1 endpoint đầu vào.
> Server tự detect `identifier` là email hay phone → rẽ nhánh xử lý.
> Phone vẫn cần 2 bước tiếp theo vì bản chất là flow OTP, nhưng API surface gọn hơn.

---

# ⚠️ Ràng buộc bảo mật toàn cục

```
1. HTTPS bắt buộc — tất cả token (refresh, OTP session, grant) phải qua TLS
2. Refresh token → httpOnly; Secure; SameSite=Strict cookie (hoặc body nếu mobile)
3. Access token → memory (không localStorage) ở web client
4. Mọi response trả token phải kèm: Referrer-Policy: no-referrer
5. Rate limit headers: Retry-After khi 429
6. User-Agent lưu trong device_info cho audit (không dùng để auth)
```

---

# 🗂️ Quy ước Redis Key (Chuẩn duy nhất — áp dụng toàn bộ document)

```
# OTP
otp:email_verify:{user_id}          TTL 300s    { otp_hash, attempt }
otp:pwreset:{user_id}               TTL 900s    { otp_hash, attempt }
otp:phone_verify:{user_id}          TTL 300s    { otp_hash, phone, attempt }
otp:phone_login:{phone_e164}        TTL 300s    { otp_hash, attempt, user_id }

# Trạng thái tạm
2fa:pending:{temp_token}            TTL 300s    { user_id, ip, remember_me, device_info }
2fa:setup:{user_id}                 TTL 600s    { totp_secret_encrypted }
pwreset:session:{token}             TTL 900s    { user_id }
pwreset:grant:{token}               TTL 300s    { user_id }
oauth:state:{state}                 TTL 300s    { provider, pkce_verifier }
oauth:link:{token}                  TTL 600s    { user_id, provider, provider_user_id }

# Session
session:{token_hash}                TTL = expires_at - now   { user_id, system_role }
jwt:blacklist:{jti}                 TTL = exp còn lại        "1"

# Sliding rotation lock (chống race condition refresh)
rotate:lock:{token_hash}            TTL 10s     "1"  (SET NX)
rotate:result:{token_hash}          TTL 10s     { new_access_token, new_refresh_token? }

# Rate limiting
ratelimit:check-email:{ip}          TTL 60s
ratelimit:register:{ip}             TTL 3600s
ratelimit:login:ip:{ip}             TTL 900s      ← dùng chung cho cả email & phone
ratelimit:login:email:{email}       TTL 900s      ← chỉ áp dụng nhánh email
ratelimit:login:phone:{phone_e164}  TTL 900s      ← chỉ áp dụng nhánh phone
ratelimit:pwreset:ip:{ip}           TTL 3600s
ratelimit:resend:{user_id}          TTL 600s
ratelimit:sms:{user_id}             TTL 86400s
ratelimit:change-pw:{user_id}       TTL 3600s
login:fail:{email}                  TTL 900s
2fa:fail:{user_id}                  TTL 300s
```

> ⚠️ **Quan trọng:** Mọi GET/SET/DEL OTP đều phải dùng đúng key prefix theo bảng trên.
> Không được dùng prefix khác ở bất kỳ endpoint nào.

---

# UC-01 — Đăng ký tài khoản mới

## Bước 1/4 — Kiểm tra Email

**Trigger:** User nhập email xong, blur khỏi ô input (không cần nhấn nút)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/check-email ►│                           │               │
  │  { email }               │                           │               │
  │                          ├─ Rate limit? ────────────────────────────►│
  │                          │  INCR ratelimit:check-email:{ip}          │
  │                          │  EX 60s                   │               │
  │                          │  [> 20 lần/phút → 429]    │               │
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
  │                          │  ← KHÔNG trả user_id      │               │
  │                          │    (tránh user enumeration)│              │
  │                          │                           │               │
  │                          │  [status = 'active'       │               │
  │                          │   / 'inactive' / 'banned']│               │
  │                          │  → 409 "Email đã được sử dụng"            │
  │                          │                           │               │
  │                          │  [không tìm thấy]         │               │
  │                          │  → 200 { available: true }│               │
  │◄──────────────────────── ┤                           │               │
```

> 📌 **[v3 FIX] Không trả user_id trong check-email:**
> Phiên bản cũ trả `user_id` khi pending → rò rỉ thông tin internal ID.
> Thay bằng: resend-otp nhận `email` thay vì `user_id`.
> Server tự lookup `user_id` từ email với status='pending'.

---

## Bước 2/4 — Tạo mật khẩu *(Pure client-side)*

```
Không gọi API.

Client tự validate realtime khi user gõ:
  ✓ Tối thiểu 8 ký tự
  ✓ Có chữ hoa A–Z
  ✓ Có chữ số 0–9
  ✓ Có ký tự đặc biệt !@#$...
  ✓ Confirm password khớp

State client giữ tạm: { email, password }
Không gửi server cho đến Bước 3.
```

---

## Bước 3/4 — Nhập thông tin + Tạo tài khoản

**Trigger:** User nhấn "Tiếp tục" ở Bước 3

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
  │                          │  INCR ratelimit:register:{ip}             │
  │                          │  EX 3600s                 │               │
  │                          │  [> 5 lần/giờ → 429]      │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate email / pw / phone              │
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email = ?          │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          │  [status = 'pending']     │               │
  │                          │  → 409 {                  │               │
  │                          │      code: 'pending_verification',        │
  │                          │      action: 'resend_otp' │               │
  │                          │    }                      │               │
  │                          │  [status = 'active'/...] │               │
  │                          │  → 409 "Email đã tồn tại" │               │
  │                          │  [không tìm thấy] ✓       │               │
  │                          │                           │               │
  │                          ├─ Check phone (nếu có) ───►│               │
  │                          │  SELECT users             │               │
  │                          │  WHERE phone = ?          │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [trùng → 409 "SĐT đã dùng"]             │
  │                          │                           │               │
  │                          ├─ bcrypt.hash(password, 12)│               │
  │                          │  (CPU-bound, ~200ms)      │               │
  │                          │                           │               │
  │                          ├─ INSERT users ───────────►│               │
  │                          │  id              = UUID() │               │
  │                          │  email           = ?      │               │
  │                          │  password_hash   = bcrypt │               │
  │                          │  full_name       = ?      │               │
  │                          │  phone           = ?      │               │
  │                          │  system_role     = 'user' │               │
  │                          │  status          = 'pending'              │
  │                          │  email_verified_at = NULL │               │
  │                          │◄──────────────────────────┤               │
  │                          │  → user_id                │               │
  │                          │                           │               │
  │                          ├─ Sinh OTP 6 số            │               │
  │                          │  crypto.randomInt(100000, 999999)         │
  │                          │                           │               │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  otp:email_verify:{user_id}               │
  │                          │  { otp_hash: SHA256(otp), attempt: 0 }    │
  │                          │  EX 300 (5 phút)          │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Push job → Email Queue   │               │
  │                          │  (async, không block)     │               │
  │                          │                           │               │
  │◄─ 201 {                  │                           │               │
  │    message: "OTP sent"   │                           │               │
  │  }                       │                           │               │
  │  ← KHÔNG trả user_id     │                           │               │
```

---

## Bước 4/4 — Xác minh OTP Email

**Trigger:** User điền đủ 6 số (auto-submit)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/verify-otp  ►│                           │               │
  │  { email, otp }          │                           │               │
  │  ← dùng email thay vì    │                           │               │
  │    user_id (v3 FIX)      │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email = ?          │               │
  │                          │  AND status = 'pending'   │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │◄──────────────────────────┤               │
  │                          │  [không thấy → 404]       │               │
  │                          │                           │               │
  │                          ├─ GET Redis ──────────────────────────────►│
  │                          │  otp:email_verify:{user_id}               │
  │                          │◄─────────────────────────────────────────┤
  │                          │  [MISS → 404 "OTP hết hạn"]               │
  │                          │                           │               │
  │                          ├─ Kiểm tra attempt         │               │
  │                          │  [attempt >= 5]           │               │
  │                          │  → DEL otp:email_verify ─────────────────►│
  │                          │  → 429 "Khoá, yêu cầu OTP mới"            │
  │                          │                           │               │
  │                          ├─ So sánh SHA256(otp) vs otp_hash          │
  │                          │                           │               │
  │                          │  [SAI]                    │               │
  │                          │  HINCRBY attempt +1 ─────────────────────►│
  │                          │  → 400 "Sai OTP, còn N lần"               │
  │                          │                           │               │
  │                          │  [ĐÚNG]                   │               │
  │                          │                           │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  email_verified_at = NOW()│               │
  │                          │  status = 'active'        │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL otp:email_verify:{user_id}          ►│
  │                          │  (xoá ngay, chống reuse)  │               │
  │                          │                           │               │
  │◄─ 200 { verified: true } │                           │               │
```

---

## ⏰ Xử lý tài khoản pending không xác minh

### Giải pháp: 3 cơ chế song song

**[Cơ chế 1] — Re-register flow**
```
User thử đăng ký lại cùng email
  │
  ├─ POST /auth/check-email
  │   → { available: false, reason: 'pending_verification', action: 'resend_otp' }
  │
  ├─ User nhấn "Gửi lại OTP"
  │
  └─ POST /auth/resend-otp { email }   ← v3: dùng email thay vì user_id
```

**[Cơ chế 2] — Resend OTP**
```
POST /auth/resend-otp { email }
  │
  ├─ Rate limit: INCR ratelimit:resend:{sha256(email)}
  │  [> 3 lần/10 phút → 429]
  │
  ├─ SELECT users WHERE email = ? AND status = 'pending' AND deleted_at IS NULL
  │  [không có → 400 — không leak thông tin thêm]
  │
  ├─ DEL otp:email_verify:{user_id}   ← xoá OTP cũ
  ├─ Sinh OTP mới → SET Redis EX 300
  └─ Push Email Queue → 200 OK
```

**[Cơ chế 3] — Cron Job cleanup (chạy mỗi giờ)** ** Chưa **
```
SELECT id FROM users
  WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL 24 HOUR
  AND deleted_at IS NULL

UPDATE users SET deleted_at = NOW() WHERE id IN (...)
Log: N accounts cleaned up
```

> 📌 Soft delete thay hard delete: giữ audit trail. Hard delete sau 30 ngày bởi job riêng.

---

# UC-03 — Đăng nhập (Email + Password / Phone + OTP)

## Bước 1 — Nhận diện identifier & rẽ nhánh

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/login ──────►│                           │               │
  │  {                       │                           │               │
  │    identifier,           │  ← email hoặc phone e164  │               │
  │    password,             │  ← có nếu email, bỏ trống nếu phone      │
  │    remember_me: bool,    │                           │               │
  │    device_info: {...}    │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit theo IP ─────────────────────►│
  │                          │  INCR ratelimit:login:ip:{ip}             │
  │                          │  EX 900s (15 phút)        │               │
  │                          │  [> 20 → 429 + Retry-After]               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Detect identifier type   │               │
  │                          │  isEmail(identifier)?     │               │
  │                          │    → [NHÁNH A: Email]     │               │
  │                          │  isPhone(identifier)?     │               │
  │                          │    → [NHÁNH B: Phone]     │               │
  │                          │  [không khớp cả hai → 422]│               │
```

---

### NHÁNH A — Email + Password

```
  [Tiếp theo từ detect email]
                            │
                            ├─ Rate limit theo Email ──────────────────►│
                            │  INCR ratelimit:login:email:{email}       │
                            │  EX 900s                  │               │
                            │  [> 10 → 429]             │               │
                            │◄─────────────────────────────────────────┤
                            │                           │               │
                            ├─ Validate: password bắt buộc             │
                            │  [không có → 422]         │               │
                            │                           │               │
                            ├─ SELECT users ───────────►│               │
                            │  WHERE email = ?          │               │
                            │  AND deleted_at IS NULL   │               │
                            │◄──────────────────────────┤               │
                            │  [không thấy → 401        │               │
                            │   "Thông tin không đúng"] │               │
                            │  [status='banned' → 403]  │               │
                            │  [status='inactive' → 403]│               │
                            │  [status='pending' → 403  │               │
                            │    "Chưa xác minh email"] │               │
                            │                           │               │
                            ├─ bcrypt.compare(pw, hash) │               │
                            │                           │               │
                            │  [sai]                    │               │
                            │  INCR login:fail:{email} ────────────────►│
                            │  EX 900s                  │               │
                            │  → 401 "Thông tin không đúng"             │
                            │                           │               │
                            │  [sai >= 10 lần]          │               │
                            │  UPDATE users             │               │
                            │    status = 'inactive' ──►│               │
                            │  → 403 "Tài khoản bị khoá"│               │
                            │                           │               │
                            │  [đúng]                   │               │
                            │  DEL login:fail:{email} ─────────────────►│
                            │                           │               │
                            ├─ two_factor_enabled = 1?  │               │
                            │  [CÓ] → sang UC-04        │               │
                            │  [KHÔNG] → Tạo session    │               │
                            │                           │               │
                           ◄─ 200 { access_token, refresh_token }      │
```

---

### NHÁNH B — Phone + OTP (bước 1/3)

```
  [Tiếp theo từ detect phone]
                            │
                            ├─ Validate: password KHÔNG được có        │
                            │  [có password → 422 "Phone login dùng OTP"]
                            │                           │               │
                            ├─ Rate limit theo phone ──────────────────►│
                            │  INCR ratelimit:login:phone:{phone_e164}  │
                            │  EX 900s                  │               │
                            │  [> 10 → 429]             │               │
                            │◄─────────────────────────────────────────┤
                            │                           │               │
                            ├─ SELECT users ───────────►│               │
                            │  WHERE phone = ?          │               │
                            │  AND deleted_at IS NULL   │               │
                            │◄──────────────────────────┤               │
                            │                           │               │
                            │  [không thấy]             │               │
                            │  → vẫn 200 (không leak)   │               │
                            │    Không gửi SMS thật      │               │
                            │                           │               │
                            │  [tìm thấy — status check]│               │
                            │  [banned / inactive →     │               │
                            │   vẫn 200, không gửi SMS] │               │
                            │  [pending → vẫn 200,      │               │
                            │   không gửi SMS]          │               │
                            │  NOTE: không leak status  │               │
                            │                           │               │
                            │  [active + phone_verified]│               │
```

## Bước 2 — Phone: Gửi OTP

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/login        │                           │               │
  │   /send-otp ────────────►│                           │               │
  │  { phone }               │                           │               │
  │                          │                           │               │
  │                          │ [Logic trên: tìm user, check status]      │
  │                          │                           │               │
  │                          ├─ Sinh OTP 6 số            │               │
  │                          │  crypto.randomInt(...)    │               │
  │                          │                           │               │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  otp:phone_login:{phone_e164}             │
  │                          │  { otp_hash: SHA256(otp), │               │
  │                          │    attempt: 0,            │               │
  │                          │    user_id (nếu tồn tại) }│               │
  │                          │  EX 300 (5 phút)          │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Push job → SMS Queue (nếu user hợp lệ)  │
  │◄─ 200 { message: "OTP sent", expires_in: 300 }       │               │
  │  (luôn 200 dù user không tồn tại — không leak)       │               │
```

## Bước 3 — Phone: Xác minh OTP + Tạo session

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/login        │                           │               │
  │   /verify-otp ──────────►│                           │               │
  │  {                       │                           │               │
  │    phone,                │                           │               │
  │    otp,                  │                           │               │
  │    remember_me: bool,    │                           │               │
  │    device_info: {...}    │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ GET otp:phone_login:{phone_e164}────────►│
  │                          │◄─────────────────────────────────────────┤
  │                          │  [MISS → 400 "OTP hết hạn"]               │
  │                          │                           │               │
  │                          ├─ [attempt >= 5]           │               │
  │                          │  DEL otp:phone_login:... ────────────────►│
  │                          │  → 400 "Khoá, yêu cầu lại"│               │
  │                          │                           │               │
  │                          ├─ SHA256(otp) vs otp_hash  │               │
  │                          │  [sai → HINCRBY attempt+1, 400]           │
  │                          │                           │               │
  │                          │  [đúng → lấy user_id từ Redis]            │
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE id = user_id       │               │
  │                          │◄──────────────────────────┤               │
  │                          │  [banned → 403]           │               │
  │                          │  [inactive → 403]         │               │
  │                          │  [pending → 403           │               │
  │                          │   "Xác minh email trước"]  │               │
  │                          │                           │               │
  │                          ├─ DEL otp:phone_login:{phone_e164}────────►│
  │                          │                           │               │
  │                          ├─ two_factor_enabled = 1?  │               │
  │                          │  [CÓ] → sang UC-04        │               │
  │                          │  [KHÔNG] → Tạo session    │               │
  │                          │                           │               │
  │◄─ 200 { access_token, refresh_token }               │               │
```

> 📌 **[v3 FIX] Status 'pending' blocked ở phone login:**
> User có account pending (email chưa verify) không thể login qua phone.
> → 403 "Vui lòng xác minh email trước khi đăng nhập".

---

## Tạo session *(dùng chung cho cả 2 nhánh)*

```
  Server
    ├─ Sinh access_token JWT
    │    payload: { user_id, system_role, jti: UUID(), iat, exp }
    │    exp = 15 phút
    │    algorithm: RS256 (khuyến nghị) hoặc HS256
    │
    ├─ Sinh refresh_token
    │    crypto.randomBytes(32) → hex (64 chars)
    │    TTL = remember_me ? 30 ngày : 24 giờ
    │
    ├─ INSERT user_sessions
    │    token_hash = SHA256(refresh_token)
    │    expires_at = now + TTL
    │    remember_me = ?
    │    device_info = { browser, os, device, user_agent }
    │    ip_address = req_ip
    │
    ├─ SET session:{SHA256(refresh_token)}
    │    { user_id, system_role }
    │    EX = TTL
    │
    └─ UPDATE users
         last_login_at = NOW()
         last_login_ip = req_ip
```

---

# UC-04 — Xác thực 2FA (TOTP)

*Kích hoạt sau UC-03 hoặc UC-10 khi `two_factor_enabled = 1`*

## Bước 1/2 — Server trả về yêu cầu 2FA

```
  [Sau khi verify password (UC-03) hoặc OAuth profile (UC-10) thành công]

  Server
    ├─ Sinh temp_token (crypto.randomBytes(32) → hex)
    ├─ SET Redis
    │  2fa:pending:{temp_token}
    │  { user_id, ip: req_ip, remember_me, device_info }
    │  EX 300 (5 phút)
    │
    └─ 200 {
         state: "2fa_required",
         temp_token,
         methods: ["totp", "backup_code"]
       }
```

## Bước 2/2 — Client nhập mã TOTP hoặc Backup Code

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/2fa/verify ─►│                           │               │
  │  {                       │                           │               │
  │    temp_token,           │                           │               │
  │    totp_code,            │  ← một trong hai          │               │
  │    backup_code           │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ GET 2fa:pending:{token} ────────────────►│
  │                          │◄─────────────────────────────────────────┤
  │                          │  [MISS → 400 "Phiên hết hạn"]             │
  │                          │                           │               │
  │                          ├─ So sánh IP               │               │
  │                          │  stored_ip vs req_ip      │               │
  │                          │  [khác IP → 400           │               │
  │                          │   "Phiên không hợp lệ"]   │               │
  │                          │  NOTE: Có thể bỏ check IP │               │
  │                          │  cho mobile (switch network)              │
  │                          │  → cấu hình qua env flag  │               │
  │                          │                           │               │
  │                          ├─ Rate limit 2FA ─────────────────────────►│
  │                          │  INCR 2fa:fail:{user_id}  │               │
  │                          │  EX 300s                  │               │
  │                          │  [> 5 lần → DEL pending,  │               │
  │                          │    400 "Khoá 2FA"]        │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          │  [Nếu backup_code có]     │               │
  │                          │  → xem luồng backup code  │               │
  │                          │    bên dưới               │               │
  │                          │                           │               │
  │                          ├─ SELECT two_factor_secret►│               │
  │                          │◄──────────────────────────┤               │
  │                          │  AES-256 decrypt → secret │               │
  │                          │                           │               │
  │                          ├─ TOTP.verify(code, secret)│               │
  │                          │  window ±1 (30 giây)      │               │
  │                          │  [sai → 401]              │               │
  │                          │                           │               │
  │                          │  [đúng]                   │               │
  │                          │  DEL 2fa:pending:{token} ────────────────►│
  │                          │  DEL 2fa:fail:{user_id} ─────────────────►│
  │                          │                           │               │
  │                          ├─ Tạo session (như UC-03)  │               │
  │◄─ 200 {                  │                           │               │
  │    access_token,         │                           │               │
  │    refresh_token         │                           │               │
  │  }                       │                           │               │
```

### Luồng Backup Code

```
  [Khi client gửi backup_code thay vì totp_code]
  │
  ├─ SELECT * FROM two_factor_backup_codes
  │    WHERE user_id = ?
  │    AND used_at IS NULL
  │
  ├─ For each code:
  │    bcrypt.compare(backup_code, code_hash)
  │    [match] →
  │      UPDATE two_factor_backup_codes SET used_at = NOW()
  │        WHERE id = ?
  │      → Tạo session (UC-03 flow)
  │      → 200 {
  │           access_token, refresh_token,
  │           warning: "Backup code đã dùng. Còn N code."
  │         }
  │
  ├─ [Không match] → 401 "Backup code không hợp lệ"
  │
  └─ [Dùng code cuối cùng] → warning thêm "Hãy tạo backup codes mới"
```

---

# UC-05 — Refresh Access Token

*Gọi tự động ở client khi access_token hết hạn (401)*

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
  │                          │                           │               │
  │                          │  [HIT] → dùng luôn        │               │
  │                          │                           │               │
  │                          │  [MISS]                   │               │
  │                          │  SELECT user_sessions ───►│               │
  │                          │  WHERE token_hash = ?     │               │
  │                          │  AND is_revoked = 0       │               │
  │                          │  AND expires_at > NOW()   │               │
  │                          │◄──────────────────────────┤               │
  │                          │  [không tìm / revoked     │               │
  │                          │   / hết hạn → 401]        │               │
  │                          │                           │               │
  │                          ├─ SELECT users status ────►│               │
  │                          │  [banned/inactive → 401]  │               │
  │                          │                           │               │
  │                          ├─ [Sliding session check]  │               │
  │                          │  remember_me = 0:         │               │
  │                          │    expires_at < now + 1d → rotate        │
  │                          │  remember_me = 1:         │               │
  │                          │    expires_at < now + 7d → rotate        │
  │                          │                           │               │
  │                          │  [Cần rotate]             │               │
  │                          │  → SET NX rotate:lock:{hash}─────────────►│
  │                          │    EX 10s                 │               │
  │                          │    [thua lock]            │               │
  │                          │    → GET rotate:result:{hash}────────────►│
  │                          │    [HIT] → trả result đó  │               │
  │                          │    [MISS, chờ 100ms] → retry              │
  │                          │                           │               │
  │                          │    [thắng lock]           │               │
  │                          │    → sinh refresh_token mới               │
  │                          │    → UPDATE user_sessions ►│               │
  │                          │    → SET session mới ─────────────────────►│
  │                          │    → DEL session cũ ──────────────────────►│
  │                          │    → SET rotate:result:{hash}─────────────►│
  │                          │      { new_at, new_rt }   │               │
  │                          │      EX 10s               │               │
  │                          │                           │               │
  │                          ├─ Sinh access_token mới    │               │
  │◄─ 200 {                  │                           │               │
  │    access_token,         │                           │               │
  │    refresh_token (mới    │                           │               │
  │      nếu đã rotate)      │                           │               │
  │  }                       │                           │               │
```

> ⚠️ **[v3] Race condition — giải pháp chi tiết:**
> Tab A thắng lock → rotate → SET `rotate:result:{hash}`.
> Tab B thua lock → GET `rotate:result:{hash}` → nhận kết quả của Tab A.
> Cả 2 tab đều nhận access_token mới. Chỉ 1 rotate xảy ra.
> TTL của `rotate:result` = 10s (đủ cho cả 2 tab nhận kết quả).

> ⚠️ **JWT 15-phút lag sau revoke:**
> Khi session bị revoke (logout, ban user), JWT đã cấp vẫn còn hiệu lực tối đa 15 phút.
> Đây là trade-off đã chấp nhận với JWT stateless. Blacklist `jwt:blacklist:{jti}` xử lý
> trường hợp logout chủ động. Với banned user: refresh sẽ thất bại ngay lập tức.

---

# UC-06 — Đăng xuất (1 thiết bị)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/logout ─────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  { refresh_token }       │                           │               │
  │                          │                           │               │
  │                          ├─ Decode JWT → { user_id, jti, exp }       │
  │                          │                           │               │
  │                          ├─ token_hash = SHA256(rt)  │               │
  │                          │                           │               │
  │                          ├─ SELECT user_sessions ───►│               │
  │                          │  WHERE token_hash = ?     │               │
  │                          │  AND user_id = jwt.user_id│               │
  │                          │◄──────────────────────────┤               │
  │                          │  [không tìm / mismatch    │               │
  │                          │   → 400 "Token không hợp lệ"]             │
  │                          │                           │               │
  │                          ├─ Blacklist JWT ──────────────────────────►│
  │                          │  SET jwt:blacklist:{jti}  │               │
  │                          │  "1"                      │               │
  │                          │  EX {exp - now}           │               │
  │                          │                           │               │
  │                          ├─ UPDATE user_sessions ───►│               │
  │                          │  is_revoked = 1           │               │
  │                          │                           │               │
  │                          ├─ DEL session:{hash} ─────────────────────►│
  │                          │                           │               │
  │◄─ 200 { message: "OK" }  │                           │               │
```

---

# UC-07 — Đăng xuất tất cả thiết bị

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/logout-all ─►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ Lấy { user_id, jti } từ JWT             │
  │                          │                           │               │
  │                          ├─ SELECT user_sessions ───►│               │
  │                          │  WHERE user_id = ?        │               │
  │                          │  AND is_revoked = 0       │               │
  │                          │◄──────────────────────────┤               │
  │                          │  → list { id, token_hash }│               │
  │                          │                           │               │
  │                          ├─ UPDATE user_sessions ───►│               │
  │                          │  is_revoked = 1           │               │
  │                          │  WHERE user_id = ?        │               │
  │                          │                           │               │
  │                          ├─ Redis UNLINK (pipeline) ────────────────►│
  │                          │  UNLINK session:{hash1}   │               │
  │                          │  UNLINK session:{hash2}   │               │
  │                          │  ...                      │               │
  │                          │                           │               │
  │                          ├─ Blacklist JWT hiện tại ─────────────────►│
  │                          │  SET jwt:blacklist:{jti}  │               │
  │                          │  EX remaining_ttl         │               │
  │                          │                           │               │
  │◄─ 200 { revoked: N }     │                           │               │
```

> 📌 **Giới hạn đã biết:**
> Chỉ JWT của current session được blacklist ngay lập tức.
> Các JWT của session khác vẫn valid tối đa 15 phút (exp time).
> Refresh token của TẤT CẢ session đã bị revoke trong DB+Redis → không thể refresh tiếp.
> → Window tấn công tối đa: 15 phút (JWT TTL).

---

# UC-08 — Quên mật khẩu → OTP → Đặt lại

## Bước 1/3 — Yêu cầu OTP

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/forgot-pw ──►│                           │               │
  │  { email }               │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:pwreset:ip:{ip}           │
  │                          │  EX 3600s                 │               │
  │                          │  [> 5 lần/giờ → 429]      │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email = ?          │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          │  [không tìm thấy]         │               │
  │                          │  → 200 + sleep(100-300ms) │               │
  │                          │  (timing-safe, không leak)│               │
  │                          │                           │               │
  │                          │  [tìm thấy]               │               │
  │                          │                           │               │
  │                          ├─ Invalidate active requests──────────────►│
  │                          │  UPDATE password_resets   │               │
  │                          │  SET used_at = NOW()      │               │
  │                          │  WHERE user_id = ?        │               │
  │                          │  AND used_at IS NULL      │               │
  │                          │                           │               │
  │                          ├─ DEL otp:pwreset:{uid} ──────────────────►│
  │                          │                           │               │
  │                          ├─ Sinh OTP 6 số            │               │
  │                          │                           │               │
  │                          ├─ INSERT password_resets ─►│               │
  │                          │  token_hash = SHA256(otp) │               │
  │                          │  expires_at = +15 phút    │               │
  │                          │  ip_address = req_ip      │               │
  │                          │  attempt_count = 0        │               │
  │                          │                           │               │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  otp:pwreset:{user_id}    │               │
  │                          │  { otp_hash, attempt: 0 } │               │
  │                          │  EX 900                   │               │
  │                          │                           │               │
  │                          ├─ Sinh pwreset_session_token               │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  pwreset:session:{token}  │               │
  │                          │  { user_id }              │               │
  │                          │  EX 900                   │               │
  │                          │                           │               │
  │                          ├─ Push job → Email Queue   │               │
  │◄─ 200 {                  │                           │               │
  │    message: "OTP sent",  │                           │               │
  │    pwreset_session_token │                           │               │
  │  }                       │                           │               │
```

> 📌 **[v3] Timing-safe:** Khi email không tồn tại, sleep ngẫu nhiên 100-300ms
> trước khi trả về 200, tránh timing attack phân biệt email tồn tại hay không.

## Bước 2/3 — Xác minh OTP

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/verify-reset-otp►│                       │               │
  │  { pwreset_session_token, otp }                      │               │
  │                          │                           │               │
  │                          ├─ GET pwreset:session:{t} ────────────────►│
  │                          │  [MISS → 400 "Phiên hết hạn"]             │
  │                          │  → { user_id }            │               │
  │                          │                           │               │
  │                          ├─ GET otp:pwreset:{uid} ──────────────────►│
  │                          │  [MISS → 400 "OTP hết hạn"]               │
  │                          │                           │               │
  │                          ├─ [attempt >= 5]           │               │
  │                          │  DEL otp + session ──────────────────────►│
  │                          │  UPDATE password_resets   │               │
  │                          │    attempt_count = 5      │               │
  │                          │  → 400 "Khoá"             │               │
  │                          │                           │               │
  │                          ├─ SHA256(otp) vs otp_hash  │               │
  │                          │  [sai → HINCRBY+1, 400]   │               │
  │                          │                           │               │
  │                          │  [đúng]                   │               │
  │                          ├─ Sinh reset_grant_token (32 bytes)        │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  pwreset:grant:{token}    │               │
  │                          │  { user_id }              │               │
  │                          │  EX 300                   │               │
  │                          │                           │               │
  │                          ├─ DEL otp:pwreset + session───────────────►│
  │◄─ 200 { reset_grant_token }                          │               │
```

## Bước 3/3 — Đặt mật khẩu mới

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/reset-pw ───►│                           │               │
  │  { reset_grant_token,    │                           │               │
  │    new_password }        │                           │               │
  │                          │                           │               │
  │                          ├─ GET pwreset:grant:{token}───────────────►│
  │                          │  [MISS → 400 "Token hết hạn/đã dùng"]    │
  │                          │  → { user_id }            │               │
  │                          │                           │               │
  │                          ├─ DEL pwreset:grant:{token}───────────────►│
  │                          │  (xoá ngay — single use)  │               │
  │                          │                           │               │
  │                          ├─ Validate new_password    │               │
  │                          │                           │               │
  │                          ├─ bcrypt.hash(pw, 12)      │               │
  │                          │                           │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  password_hash = new      │               │
  │                          │  status = 'active'        │               │
  │                          │  (recover inactive user)  │               │
  │                          │                           │               │
  │                          ├─ UPDATE password_resets ─►│               │
  │                          │  used_at = NOW()          │               │
  │                          │  WHERE user_id = ?        │               │
  │                          │  AND used_at IS NULL      │               │
  │                          │                           │               │
  │                          ├─ Revoke ALL sessions ─────►│               │
  │                          │  UPDATE user_sessions     │               │
  │                          │  SET is_revoked = 1       │               │
  │                          │  WHERE user_id = ?        │               │
  │                          │                           │               │
  │                          ├─ DEL all session Redis ──────────────────►│
  │                          │  (pipeline UNLINK)        │               │
  │                          │                           │               │
  │◄─ 200 { message: "OK" }  │                           │               │
```

---

# UC-09 — Đổi mật khẩu (đang đăng nhập)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/change-pw ──►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    current_password,     │                           │               │
  │    new_password          │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:change-pw:{user_id}      │
  │                          │  EX 3600s [> 5 → 429]     │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ bcrypt.compare(cur, hash)│               │
  │                          │  [sai → 401]              │               │
  │                          │                           │               │
  │                          ├─ new == current? → 422    │               │
  │                          │                           │               │
  │                          ├─ bcrypt.hash(new, 12)     │               │
  │                          │                           │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  password_hash = new      │               │
  │                          │                           │               │
  │                          ├─ Revoke OTHER sessions ──►│               │
  │                          │  WHERE user_id = ?        │               │
  │                          │  AND token_hash != current│               │
  │                          │  → DEL Redis (pipeline) ─────────────────►│
  │                          │  (current session giữ lại)│               │
  │                          │                           │               │
  │◄─ 200 { message: "OK" }  │                           │               │
```

---

# UC-10 — Đăng nhập / Đăng ký bằng OAuth

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ GET /auth/oauth/{provider}/authorize               │               │
  │                          │                           │               │
  │                          ├─ Sinh state (random 32B)  │               │
  │                          ├─ Sinh PKCE verifier       │               │
  │                          ├─ SET oauth:state:{state} ────────────────►│
  │                          │  { provider, pkce_verifier }              │
  │                          │  EX 300                   │               │
  │                          │                           │               │
  │◄─ 302 → Provider Auth URL │                          │               │
  │                          │                           │               │
  ├─ [User đăng nhập provider]│                          │               │
  │                          │                           │               │
  ├─ GET /auth/oauth/{provider}/callback                 │               │
  │    ?code=...&state=...   │                           │               │
  │                          │                           │               │
  │                          ├─ GET oauth:state:{state} ────────────────►│
  │                          │  [MISS → 400 CSRF fail]   │               │
  │                          │  DEL oauth:state:{state} ────────────────►│
  │                          │                           │               │
  │                          ├─ Exchange code → tokens   │               │
  │                          ├─ Fetch profile từ provider│               │
  │                          │  { provider_id, email, name, avatar }     │
  │                          │                           │               │
  │                          ├─ SELECT oauth_providers ─►│               │
  │                          │  WHERE provider = ?       │               │
  │                          │  AND provider_user_id = ? │               │
  │                          │◄──────────────────────────┤               │
```

### CASE A — Đã có OAuth link

```
  [Tìm thấy oauth_providers record]
  │
  ├─ SELECT users WHERE id = oauth.user_id
  │  [banned → 403]
  │  [inactive → 403]
  │
  ├─ two_factor_enabled? → UC-04
  ├─ [KHÔNG] → Tạo session → 200 tokens
```

### CASE B — Email đã tồn tại, chưa link

```
  [Không tìm thấy oauth record, nhưng email tồn tại trong users]
  │
  ├─ [v3 FIX] Kiểm tra: user có password_hash không?
  │
  │  [CÓ password_hash]
  │  ├─ Sinh link_token (32 bytes)
  │  ├─ SET oauth:link:{token} ────────────────────────────────────────►│
  │  │  { user_id, provider, provider_user_id }                         │
  │  │  EX 600 (10 phút)                                               │
  │  │                                                                  │
  │  ├─ 200 {
  │  │    state: "link_required",
  │  │    link_token,
  │  │    masked_email: "t***@gmail.com"
  │  │  }
  │  │
  │  ├─ [Client] User nhập password
  │  ├─ POST /auth/oauth/link { link_token, password }
  │  │  Server:
  │  │  GET oauth:link:{token} → { user_id, provider, provider_user_id }
  │  │  bcrypt.compare(password, user.password_hash)
  │  │  [sai → 401]
  │  │  [đúng]
  │  │  INSERT oauth_providers
  │  │  DEL oauth:link:{token}
  │  │  → Tạo session → 200 tokens
  │
  │  [KHÔNG có password_hash — OAuth-only user]
  │  ├─ Sinh link_token
  │  ├─ SET oauth:link:{token} ─────────────────────────────────────────►│
  │  ├─ 200 {
  │  │    state: "link_required_otp",
  │  │    link_token,
  │  │    masked_email
  │  │  }
  │  │  ← Client hướng dẫn: "Xác nhận qua OTP email"
  │  │
  │  ├─ POST /auth/oauth/link/send-otp { link_token }
  │  │  → Gửi OTP vào email của user
  │  │
  │  └─ POST /auth/oauth/link/verify { link_token, otp }
  │     → OTP đúng → INSERT oauth_providers → Tạo session
```

### CASE C — Email chưa tồn tại (đăng ký mới)

```
  [Không tìm thấy cả oauth record lẫn email]
  │
  ├─ INSERT users
  │    email = provider_email
  │    full_name = provider_name
  │    avatar_url = provider_avatar
  │    status = 'active'             ← không cần verify email
  │    email_verified_at = NOW()     ← provider đã verify
  │    password_hash = NULL          ← OAuth-only account
  │
  ├─ INSERT oauth_providers
  │
  └─ Tạo session → 201 { is_new_user: true, tokens... }
```

---

# UC-11 — Liên kết / Huỷ liên kết OAuth

```
# Liên kết thêm OAuth provider:
GET /auth/oauth/{provider}/link   (yêu cầu Bearer token)
  → Flow giống UC-10 nhưng đã auth sẵn
  → INSERT oauth_providers cho user hiện tại

# Huỷ liên kết:
DELETE /auth/oauth/{provider}/link
  Authorization: Bearer
  │
  ├─ Kiểm tra: còn cách login khác không?
  │  [password_hash IS NOT NULL] → OK xoá
  │  [Chỉ có 1 provider và không có password] → 400
  │  "Cần giữ ít nhất 1 phương thức đăng nhập"
  │
  ├─ DELETE oauth_providers WHERE user_id = ? AND provider = ?
  └─ 200 { unlinked: true }
```

---

# UC-12 — Bật / Tắt 2FA

## Bật 2FA

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/2fa/setup ──►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ Sinh TOTP secret         │               │
  │                          │  (base32, 20 bytes)       │               │
  │                          │                           │               │
  │                          ├─ AES-256 encrypt secret   │               │
  │                          │                           │               │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  2fa:setup:{user_id}      │               │
  │                          │  { totp_secret_encrypted }│               │
  │                          │  EX 600 (10 phút)         │               │
  │                          │                           │               │
  │                          ├─ Sinh 8 backup codes      │               │
  │                          │  format: XXXX-XXXX        │               │
  │                          │  crypto.randomBytes cho mỗi code          │
  │                          │  [giữ plaintext tạm trong memory]         │
  │                          │                           │               │
  │◄─ 200 {                  │                           │               │
  │    qr_code_url,          │                           │               │
  │    secret_key,           │  ← hiển thị 1 lần         │               │
  │    backup_codes: [...8]  │  ← plaintext, hiển thị 1 lần              │
  │  }                       │                           │               │
  │                          │                           │               │
  ├─ POST /auth/2fa/confirm ►│                           │               │
  │  { totp_code }           │                           │               │
  │                          │                           │               │
  │                          ├─ GET 2fa:setup:{user_id} ────────────────►│
  │                          │  [MISS → 400 "Phiên setup hết hạn"]       │
  │                          │                           │               │
  │                          ├─ Decrypt secret           │               │
  │                          ├─ TOTP.verify(code, secret)│               │
  │                          │  [sai → 400]              │               │
  │                          │                           │               │
  │                          │  [đúng]                   │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  two_factor_secret = enc  │               │
  │                          │  two_factor_enabled = 1   │               │
  │                          │                           │               │
  │                          ├─ DELETE FROM two_factor_backup_codes      │
  │                          │  WHERE user_id = ?        │               │
  │                          │  (xoá codes cũ nếu có)    │               │
  │                          │                           │               │
  │                          ├─ INSERT two_factor_backup_codes           │
  │                          │  (8 rows, bcrypt each)    │               │
  │                          │                           │               │
  │                          ├─ DEL 2fa:setup:{user_id} ────────────────►│
  │                          │                           │               │
  │◄─ 200 { enabled: true }  │                           │               │
```

## Tắt 2FA

```
POST /auth/2fa/disable
Authorization: Bearer
{ password, totp_code }
  │
  ├─ bcrypt.compare(password) [sai → 401]
  ├─ TOTP.verify(totp_code) [sai → 401]
  │
  ├─ UPDATE users
  │    two_factor_secret = NULL
  │    two_factor_enabled = 0
  │
  ├─ DELETE FROM two_factor_backup_codes WHERE user_id = ?
  │
  └─ 200 { disabled: true }
```

> 📌 **Backup codes specs:**
> - Số lượng: 8 codes
> - Format: `XXXXXX-XXXXXX` (12 ký tự alphanumeric + dấu gạch)
> - Sinh: `crypto.randomBytes(6)` → hex → uppercase
> - Lưu: bcrypt hash cost=10 trong `two_factor_backup_codes`
> - Mỗi code single-use (`used_at` track)
> - Khi còn ≤ 2 codes chưa dùng → cảnh báo user

---

# UC-13 — Xem danh sách phiên đăng nhập

```
Client                    Server                      MySQL
  │                          │                           │
  ├─ GET /auth/sessions ────►│                           │
  │  Authorization: Bearer   │                           │
  │                          │                           │
  │                          ├─ SELECT user_sessions ───►│
  │                          │  WHERE user_id = ?        │
  │                          │  AND is_revoked = 0       │
  │                          │  AND expires_at > NOW()   │
  │                          │  ORDER BY created_at DESC │
  │                          │◄──────────────────────────┤
  │                          │                           │
  │                          ├─ Đánh dấu current session │
  │                          │  (so SHA256(current_rt)   │
  │                          │   với từng token_hash)    │
  │◄─ 200 {                  │                           │
  │    sessions: [           │                           │
  │      {                   │                           │
  │        id,               │                           │
  │        device_info,      │                           │
  │        ip_address,       │                           │
  │        created_at,       │                           │
  │        expires_at,       │                           │
  │        is_current: bool  │                           │
  │      }                   │                           │
  │    ]                     │                           │
  │  }                       │                           │
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
  │                          │  WHERE id = ?             │               │
  │                          │  AND user_id = ?          │               │
  │                          │◄──────────────────────────┤               │
  │                          │  [không có → 404]         │               │
  │                          │                           │               │
  │                          ├─ UPDATE is_revoked = 1 ──►│               │
  │                          │                           │               │
  │                          ├─ DEL session:{token_hash}────────────────►│
  │                          │                           │               │
  │                          ├─ Nếu là current session:  │               │
  │                          │  SET jwt:blacklist:{jti} ────────────────►│
  │                          │  EX remaining_ttl         │               │
  │                          │                           │               │
  │◄─ 200 { revoked: true }  │                           │               │
```

---

# UC-15 — Xác minh số điện thoại bằng OTP SMS

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /auth/verify-phone►│                           │               │
  │  { phone }               │                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit SMS ─────────────────────────►│
  │                          │  INCR ratelimit:sms:{user_id}             │
  │                          │  EX 86400 [> 5/ngày → 429]                │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate format phone VN │               │
  │                          │                           │               │
  │                          ├─ Check phone trùng ──────►│               │
  │                          │  SELECT users             │               │
  │                          │  WHERE phone = ?          │               │
  │                          │  AND id != current_user   │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [trùng → 409]            │               │
  │                          │                           │               │
  │                          ├─ Sinh OTP 6 số            │               │
  │                          ├─ SET Redis ──────────────────────────────►│
  │                          │  otp:phone_verify:{user_id}               │
  │                          │  { otp_hash, phone, attempt: 0 }          │
  │                          │  EX 300                   │               │
  │                          │                           │               │
  │                          ├─ Push job → SMS Queue     │               │
  │◄─ 200 { message: "Sent" }│                           │               │
  │                          │                           │               │
  ├─ POST /auth/confirm-phone►│                          │               │
  │  { otp }                 │                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ GET otp:phone_verify:{user_id}──────────►│
  │                          │  [MISS → 400 "OTP hết hạn"]               │
  │                          │                           │               │
  │                          ├─ [attempt >= 5 → khoá]    │               │
  │                          ├─ SHA256(otp) vs otp_hash  │               │
  │                          │  [sai → increment, 400]   │               │
  │                          │                           │               │
  │                          │  [đúng]                   │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  phone = verified_phone   │               │
  │                          │  phone_verified_at = NOW()│               │
  │                          │                           │               │
  │                          ├─ DEL otp:phone_verify ───────────────────►│
  │◄─ 200 { verified: true } │                           │               │
```

---

# 🔒 Auth Middleware

```
Request đến
  │
  ├─ Lấy Authorization: Bearer {jwt}
  │  [không có → 401]
  │
  ├─ jwt.verify(token, SECRET)
  │  [invalid signature → 401]
  │  [expired → 401 "Token hết hạn, hãy refresh"]
  │
  ├─ GET jwt:blacklist:{jti} từ Redis
  │  [HIT → 401 "Token đã bị thu hồi"]
  │
  ├─ Decode payload:
  │  { user_id, system_role, jti, exp, iat }
  │  inject vào req.user
  │
  ├─ [Route cần check restaurant_role]
  │  → query restaurant_members riêng
  │  → không lưu restaurant_role vào JWT
  │    (JWT là platform-level auth, restaurant-level RBAC ở layer riêng)
  │
  └─ next()

NOTE: Middleware KHÔNG query users table mỗi request.
      Trạng thái banned/inactive chỉ có hiệu lực ngay lập tức khi:
      1. Refresh token bị revoke (session invalidated)
      2. JWT hết hạn (tối đa 15 phút)
      Đây là đánh đổi chấp nhận được với JWT stateless.
      Nếu cần instant ban: dùng jwt:blacklist:{jti} cho current token.
```

---

# 🗺️ Toàn bộ Redis Key Pattern *(chuẩn hoá)*

```
# OTP
otp:email_verify:{user_id}          TTL 300s    { otp_hash, attempt }
otp:pwreset:{user_id}               TTL 900s    { otp_hash, attempt }
otp:phone_verify:{user_id}          TTL 300s    { otp_hash, phone, attempt }
otp:phone_login:{phone_e164}        TTL 300s    { otp_hash, attempt, user_id }

# Trạng thái tạm
2fa:pending:{temp_token}            TTL 300s    { user_id, ip, remember_me, device_info }
2fa:setup:{user_id}                 TTL 600s    { totp_secret_encrypted }
pwreset:session:{token}             TTL 900s    { user_id }
pwreset:grant:{token}               TTL 300s    { user_id }
oauth:state:{state}                 TTL 300s    { provider, pkce_verifier }
oauth:link:{token}                  TTL 600s    { user_id, provider, provider_user_id }

# Session
session:{token_hash}                TTL = expires_at - now   { user_id, system_role }
jwt:blacklist:{jti}                 TTL = exp còn lại        "1"

# Race condition locks
rotate:lock:{token_hash}            TTL 10s     "1"  (SET NX)
rotate:result:{token_hash}          TTL 10s     { new_access_token, new_refresh_token? }

# Rate limiting
ratelimit:check-email:{ip}          TTL 60s
ratelimit:register:{ip}             TTL 3600s
ratelimit:login:ip:{ip}             TTL 900s
ratelimit:login:email:{email}       TTL 900s
ratelimit:login:phone:{phone_e164}  TTL 900s
ratelimit:pwreset:ip:{ip}           TTL 3600s
ratelimit:resend:{sha256(email)}    TTL 600s    ← v3: hash email thay vì user_id
ratelimit:sms:{user_id}             TTL 86400s
ratelimit:change-pw:{user_id}       TTL 3600s
login:fail:{email}                  TTL 900s
2fa:fail:{user_id}                  TTL 300s
```

---

# 📋 Test Case Coverage

## UC-01 — Đăng ký

| ID | Scenario | Expected |
|----|----------|----------|
| T01-01 | Email hợp lệ, chưa tồn tại | 200 available: true |
| T01-02 | Email format sai | 422 |
| T01-03 | Email đã active | 409 |
| T01-04 | Email đang pending | 200 available: false, reason: pending_verification |
| T01-05 | Register thành công | 201, OTP gửi, status=pending, không trả user_id |
| T01-06 | Register email đang pending | 409 pending_verification |
| T01-07 | Phone đã dùng bởi user khác | 409 |
| T01-08 | OTP đúng → verify | 200, status=active |
| T01-09 | OTP sai 5 lần → khoá | 400 locked |
| T01-10 | OTP hết hạn (sau 5 phút) | 400 expired |
| T01-11 | Resend OTP (dùng email) → OTP cũ bị xoá | 200, OTP cũ không dùng được |
| T01-12 | Resend OTP > 3 lần/10 phút | 429 |
| T01-13 | Resend OTP với email không pending | 400 |
| T01-14 | Cron cleanup: account pending > 24h | soft deleted |
| T01-15 | Register > 5 lần/giờ cùng IP | 429 |

## UC-03 — Đăng nhập (Unified)

| ID | Scenario | Expected |
|----|----------|----------|
| T03-01 | identifier là email hợp lệ | detect → nhánh email |
| T03-02 | identifier là phone hợp lệ | detect → nhánh phone |
| T03-03 | identifier không phải email lẫn phone | 422 |
| T03-04 | Email + password đúng, không 2FA | 200 tokens |
| T03-05 | Email + password đúng, có 2FA | 200 state:2fa_required |
| T03-06 | Email nhưng không gửi password | 422 |
| T03-07 | Phone nhưng gửi kèm password | 422 |
| T03-08 | Sai password | 401 |
| T03-09 | Sai password >= 10 lần → inactive | 403 |
| T03-10 | Login email với account inactive | 403 |
| T03-11 | Login email với account banned | 403 |
| T03-12 | Login email với account pending | 403 |
| T03-13 | remember_me=true → refresh TTL 30 ngày | ✓ |
| T03-14 | remember_me=false → refresh TTL 24h | ✓ |
| T03-15 | > 20 req/15 phút cùng IP | 429 |
| T03-16 | > 10 email login/15 phút cùng email | 429 |
| T03-17 | > 10 phone login/15 phút cùng phone | 429 |
| T03-18 | Phone chưa verified → 200 (không leak, không gửi SMS) | ✓ |
| T03-19 | Phone login: OTP đúng → tạo session | 200 tokens |
| T03-20 | Phone login: OTP sai 5 lần → khoá | 400 |
| T03-21 | Phone login: OTP hết hạn | 400 |
| T03-22 | Phone login + 2FA enabled → UC-04 | ✓ |
| T03-23 | Phone bị banned: /send-otp vẫn 200, không gửi SMS thật | ✓ |
| T03-24 | Phone login với account pending → 403 | ✓ [v3 FIX] |

## UC-04 — 2FA

| ID | Scenario | Expected |
|----|----------|----------|
| T04-01 | TOTP đúng | 200 tokens |
| T04-02 | TOTP sai | 401 |
| T04-03 | TOTP sai 5 lần | 400 locked |
| T04-04 | temp_token hết hạn | 400 |
| T04-05 | IP request khác IP trong 2fa:pending | 400 |
| T04-06 | Dùng backup code hợp lệ | 200 + warning còn N codes |
| T04-07 | Backup code đã dùng | 401 |
| T04-08 | OAuth login + 2FA enabled → redirect UC-04 | ✓ |
| T04-09 | Dùng backup code cuối cùng | 200 + warning "tạo codes mới" |

## UC-05 — Refresh Token

| ID | Scenario | Expected |
|----|----------|----------|
| T05-01 | Refresh hợp lệ | 200 access_token mới |
| T05-02 | Refresh token revoked | 401 |
| T05-03 | Refresh token hết hạn | 401 |
| T05-04 | remember_me=0: còn < 1 ngày → rotate | refresh_token mới |
| T05-05 | remember_me=1: còn < 7 ngày → rotate | refresh_token mới |
| T05-06 | remember_me=1: còn > 7 ngày | refresh_token giữ nguyên |
| T05-07 | 2 tab đồng thời gọi refresh (race) | chỉ 1 rotate, cả 2 nhận AT mới |
| T05-08 | User bị ban → refresh thất bại | 401 |

## UC-08 — Quên mật khẩu

| ID | Scenario | Expected |
|----|----------|----------|
| T08-01 | Email không tồn tại | 200 (timing-safe, không leak) |
| T08-02 | Email tồn tại | 200 + OTP gửi + pwreset_session_token |
| T08-03 | Gọi forgot-pw lần 2 → OTP cũ bị invalidate | ✓ |
| T08-04 | OTP đúng | 200 reset_grant_token |
| T08-05 | OTP sai 5 lần | 400 locked |
| T08-06 | reset_grant_token dùng 1 lần, lần 2 thất bại | 400 |
| T08-07 | Reset pw → account inactive → trở về active | ✓ |
| T08-08 | Reset pw → tất cả session bị revoke | ✓ |
| T08-09 | > 5 lần/giờ cùng IP | 429 |

## UC-10 — OAuth

| ID | Scenario | Expected |
|----|----------|----------|
| T10-01 | CASE A: đã link, login bình thường | 200 tokens |
| T10-02 | CASE A: user bị banned | 403 |
| T10-03 | CASE A: user có 2FA → UC-04 | ✓ |
| T10-04 | CASE B: email đã tồn tại, có password | 200 state:link_required |
| T10-05 | CASE B: user xác nhận link + đúng password | 200 tokens + linked |
| T10-06 | CASE B: user xác nhận link + sai password | 401 |
| T10-07 | CASE B: email tồn tại, không có password (OAuth-only) | 200 state:link_required_otp |
| T10-08 | CASE B: xác nhận link qua OTP email | 200 tokens + linked |
| T10-09 | CASE C: email mới | 201 is_new_user:true |
| T10-10 | state token sai / hết hạn | 400 CSRF fail |

## UC-12 — 2FA Setup

| ID | Scenario | Expected |
|----|----------|----------|
| T12-01 | Setup: sinh secret, lưu Redis tạm | ✓ |
| T12-02 | Confirm TOTP đúng → lưu DB, DEL Redis, insert 8 backup codes | ✓ |
| T12-03 | Confirm TOTP sai | 400 |
| T12-04 | Gọi setup lần 2 trong 10p → secret Redis bị overwrite | ✓ |
| T12-05 | Setup timeout (> 10p) → confirm thất bại | 400 |
| T12-06 | Tắt 2FA: đúng cả password + TOTP | 200, backup codes xoá |
| T12-07 | Tắt 2FA: sai password | 401 |
| T12-08 | backup_codes được bcrypt hash | ✓ |
| T12-09 | Còn ≤ 2 backup codes chưa dùng → warning | ✓ |