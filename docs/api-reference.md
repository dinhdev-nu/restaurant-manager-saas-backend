# API Reference — Auth & User

> Base URL: `https://api.example.com`
> Tất cả request/response đều dùng `Content-Type: application/json`
> Các endpoint có 🔒 yêu cầu header `Authorization: Bearer <access_token>`

---

## Mục lục

### Auth (`/auths`)
| # | Method | Endpoint | Auth | Mô tả |
|---|--------|----------|------|--------|
| 1 | POST | `/auths/check-email` | Public | Kiểm tra email đã tồn tại chưa |
| 2 | POST | `/auths/register` | Public | Đăng ký tài khoản mới |
| 3 | POST | `/auths/verify-otp` | Public | Xác minh OTP sau đăng ký |
| 4 | POST | `/auths/resend-otp` | Public | Gửi lại OTP xác minh email |
| 5 | POST | `/auths/login` | Public | Đăng nhập (email hoặc phone) |
| 6 | POST | `/auths/2fa/send-otp` | Public | Gửi OTP 2FA (sau khi login trả về `temp_token`) |
| 7 | POST | `/auths/2fa/verify-otp` | Public | Xác minh OTP 2FA và hoàn tất đăng nhập |
| 8 | POST | `/auths/refresh-token` | Cookie | Làm mới access token |
| 9 | POST | `/auths/logout` | 🔒 | Đăng xuất phiên hiện tại |
| 10 | POST | `/auths/logout-all` | 🔒 | Đăng xuất tất cả phiên |
| 11 | POST | `/auths/forgot-password` | Public | Yêu cầu đặt lại mật khẩu |
| 12 | POST | `/auths/reset-password/verify-otp` | Public | Xác minh OTP reset mật khẩu |
| 13 | POST | `/auths/reset-password` | Public | Đặt lại mật khẩu mới |
| 14 | POST | `/auths/change-password` | 🔒 | Đổi mật khẩu (đang đăng nhập) |
| 15 | POST | `/auths/2fa/enable` | 🔒 | Bật xác thực 2 lớp |
| 16 | POST | `/auths/2fa/disable` | 🔒 | Tắt xác thực 2 lớp |
| 17 | GET | `/auths/sessions` | 🔒 | Lấy danh sách phiên đang hoạt động |
| 18 | DELETE | `/auths/sessions` | 🔒 | Thu hồi một phiên cụ thể |
| 19 | POST | `/auths/phone/send-otp` | 🔒 | Gửi OTP xác minh số điện thoại |
| 20 | POST | `/auths/phone/verify-otp` | 🔒 | Xác minh OTP điện thoại |
| 21 | GET | `/auths/oauth/:provider` | Public | Khởi tạo đăng nhập OAuth (redirect) |
| 22 | GET | `/auths/:provider/callback` | Public | Callback OAuth từ provider |

### User (`/users`)
| # | Method | Endpoint | Auth | Mô tả |
|---|--------|----------|------|--------|
| 23 | GET | `/users/me` | 🔒 | Lấy thông tin profile |
| 24 | PATCH | `/users/me` | 🔒 | Cập nhật thông tin profile |
| 25 | PATCH | `/users/me/preferences` | 🔒 | Cập nhật cài đặt cá nhân |

---

## Rate Limiting

| Endpoint | Giới hạn |
|----------|----------|
| `POST /auths/check-email` | 20 req / 60s |
| `POST /auths/register` | 5 req / giờ |
| `POST /auths/login` | 10 req / 5 phút |
| `POST /auths/forgot-password` | 5 req / giờ |

---

## Chi tiết API

---

### 1. `POST /auths/check-email`
Kiểm tra email đã được đăng ký chưa. Dùng trước bước đăng ký.

**Request body**
```ts
{
  email: string   // email hợp lệ
}
```

**Response**
```ts
// Email chưa dùng
{ available: true }

// Email đã dùng (trả thêm hashed_id để client biết dùng flow login)
{ available: false, hashed_id: string }
```

**Ví dụ**
```json
// Request
{ "email": "user@example.com" }

// Response — chưa dùng
{ "available": true }

// Response — đã dùng
{ "available": false, "hashed_id": "a1b2c3d4e5f6..." }
```

---

### 2. `POST /auths/register`
Đăng ký tài khoản mới. Sau khi thành công, hệ thống gửi OTP xác minh đến email.

**Request body**
```ts
{
  email:     string   // email hợp lệ, chưa được đăng ký
  password:  string   // 6–32 ký tự
  full_name: string   // 5–100 ký tự
  phone?:    string   // Tuỳ chọn, số VN (+84...)
}
```

**Response `200`**
```ts
{
  data: {
    user_id: string   // MongoDB ObjectId của user vừa tạo
  },
  message: "Registration successful, OTP sent to your email"
}
```

**Ví dụ**
```json
// Request
{
  "email": "alice@example.com",
  "password": "Secret@123",
  "full_name": "Nguyen Thi Alice",
  "phone": "+84901234567"
}

// Response
{
  "data": { "user_id": "664f1a2b3c4d5e6f7a8b9c0d" },
  "message": "Registration successful, OTP sent to your email"
}
```

---

### 3. `POST /auths/verify-otp`
Xác minh địa chỉ email bằng OTP vừa nhận được.

**Request body**
```ts
{
  email: string   // email đã đăng ký
  otp:   string   // Mã OTP (6 ký tự số)
}
```

**Response `200`**
```ts
{ message: "Email verified successfully" }
```

**Ví dụ**
```json
// Request
{ "email": "alice@example.com", "otp": "482931" }

// Response
{ "message": "Email verified successfully" }
```

---

### 4. `POST /auths/resend-otp`
Gửi lại OTP xác minh email (khi OTP cũ hết hạn).

**Request body**
```ts
{ email: string }
```

**Response `200`**
```ts
{ message: "OTP resent" }
```

**Ví dụ**
```json
// Request
{ "email": "alice@example.com" }
```

---

### 5. `POST /auths/login`
Đăng nhập bằng email hoặc số điện thoại + mật khẩu.

**Request body**
```ts
{
  identifier:  string    // email hoặc số điện thoại VN
  password:    string    // 6–32 ký tự
  remember_me: boolean   // true = cookie tồn tại 30 ngày, false = 7 ngày
}
```

**Response — đăng nhập thành công (không bật 2FA)**
```ts
// Cookie httpOnly: refresh_token được set tự động
{
  access_token: string   // JWT, dùng cho Authorization header
}
```

**Response — tài khoản bật 2FA**
```ts
{
  "success": true,
  "statusCode": 201,
  "message": "Request was successful",
  "data": {
    "state": "2fa_required",
    "temp_token": "e5589e60acadceafd82a655ab00ca8f53d9fe2268ea5d1510f2783fe90d6e56b",
    "method": "email"
  },
  "correlationId": "943daab2-6fc4-4ea0-b73d-2974ba65bce1",
  "timestamp": "2026-03-13T13:16:29.771Z"
}
```

**Ví dụ — đăng nhập email thành công**
```json
// Request
{
  "identifier": "alice@example.com",
  "password": "Secret@123",
  "remember_me": false
}

// Response
{ "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Ví dụ — tài khoản bật 2FA**
```json
// Response
{
  "requires_2fa": true,
  "temp_token": "eyJ0bXAiOiJ0cnVlIn0..."
}
```

---

### 6. `POST /auths/2fa/send-otp`
Gửi OTP 2FA đến email. Dùng sau khi login trả về `temp_token`.

**Request body**
```ts
{ temp_token: string }
```

**Response `200`**
```ts
{ message: "2FA OTP sent to your email" }
```

**Ví dụ**
```json
// Request
{ "temp_token": "eyJ0bXAiOiJ0cnVlIn0..." }
```

---

### 7. `POST /auths/2fa/verify-otp`
Xác minh OTP 2FA và hoàn tất đăng nhập.

**Request body**
```ts
{
  temp_token: string   // temp_token từ bước login
  otp:        string   // Mã OTP 6 chữ số nhận qua email
}
```

**Response `200`**
```ts
// Cookie refresh_token được set tự động
{ access_token: string }
```

**Ví dụ**
```json
// Request
{ "temp_token": "eyJ0bXAiOiJ0cnVlIn0...", "otp": "739104" }

// Response
{ "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

---

### 8. `POST /auths/refresh-token`
Làm mới access token bằng refresh token trong cookie. Không cần body.

**Cookie required**: `refresh_token` (httpOnly, tự động gửi theo browser)

**Response `200`**
```ts
// Cookie refresh_token được rotate tự động
{ access_token: string }
```

**Ví dụ**
```json
// Response
{ "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

---

### 9. `POST /auths/logout` 🔒
Đăng xuất phiên hiện tại. Xoá cookie và vô hiệu hoá refresh token.

**Headers**: `Authorization: Bearer <access_token>`
**Cookie**: `refresh_token`

**Response `200`**
```ts
{ message: "Logged out successfully" }
```

---

### 10. `POST /auths/logout-all` 🔒
Đăng xuất tất cả phiên của người dùng trên mọi thiết bị.

**Headers**: `Authorization: Bearer <access_token>`

**Response `200`**
```ts
{ message: "All sessions revoked" }
```

---

### 11. `POST /auths/forgot-password`
Gửi OTP đặt lại mật khẩu đến email.

**Request body**
```ts
{ email: string }
```

**Response `200`**
```ts
{
  message:       "OTP sent to your email",
  session_token: string   // Dùng cho bước verify-otp tiếp theo, TTL 10 phút
}
```

**Ví dụ**
```json
// Request
{ "email": "alice@example.com" }

// Response
{
  "message": "OTP sent to your email",
  "session_token": "eyJzZXNzaW9uIjoidHJ1ZSJ9..."
}
```

---

### 12. `POST /auths/reset-password/verify-otp`
Xác minh OTP đặt lại mật khẩu.

**Request body**
```ts
{
  session_token: string   // Lấy từ bước forgot-password
  otp:           string   // OTP 6 chữ số
}
```

**Response `200`**
```ts
{
  grant_token: string   // Dùng cho bước reset-password, TTL 5 phút
}
```

**Ví dụ**
```json
// Request
{ "session_token": "eyJzZXNzaW9uIjoidHJ1ZSJ9...", "otp": "192837" }

// Response
{ "grant_token": "eyJncmFudCI6InRydWUifQ..." }
```

---

### 13. `POST /auths/reset-password`
Đặt mật khẩu mới sau khi xác minh OTP thành công.

**Request body**
```ts
{
  grant_token:  string   // Lấy từ bước verify-otp
  new_password: string   // 6–32 ký tự
}
```

**Response `200`**
```ts
{ message: "Password reset successfully" }
```

**Ví dụ**
```json
// Request
{ "grant_token": "eyJncmFudCI6InRydWUifQ...", "new_password": "NewPass@456" }
```

---

### 14. `POST /auths/change-password` 🔒
Đổi mật khẩu khi đang đăng nhập.

**Headers**: `Authorization: Bearer <access_token>`

**Request body**
```ts
{
  current_password: string   // Mật khẩu hiện tại, 6–32 ký tự
  new_password:     string   // Mật khẩu mới, 6–32 ký tự
}
```

**Response `200`**
```ts
{ message: "Password changed successfully" }
```

**Ví dụ**
```json
// Request
{
  "current_password": "Secret@123",
  "new_password": "NewPass@456"
}
```

---

### 15. `POST /auths/2fa/enable` 🔒
Bật xác thực 2 lớp. Yêu cầu xác nhận bằng mật khẩu.

**Headers**: `Authorization: Bearer <access_token>`

**Request body**
```ts
{ password: string }   // 6–32 ký tự
```

**Response `200`**
```ts
{ message: "2FA enabled successfully" }
```

**Ví dụ**
```json
// Request
{ "password": "Secret@123" }
```

---

### 16. `POST /auths/2fa/disable` 🔒
Tắt xác thực 2 lớp.

**Headers**: `Authorization: Bearer <access_token>`

**Request body**
```ts
{ password: string }
```

**Response `200`**
```ts
{ message: "2FA disabled successfully" }
```

---

### 17. `GET /auths/sessions` 🔒
Lấy danh sách tất cả phiên đăng nhập đang hoạt động.

**Headers**: `Authorization: Bearer <access_token>`

**Response `200`**
```ts
{
  sessions: Array<{
    _id:          string           // Session ID (MongoDB ObjectId)
    device_info: {
      browser:    string | null
      os:         string | null
      device:     string | null
      user_agent: string | null
    }
    ip_address:   string | null    // IPv4 hoặc IPv6
    created_at:   string           // ISO 8601
    last_used_at: string           // ISO 8601
    is_current:   boolean          // true = phiên đang dùng hiện tại
  }>
}
```

**Ví dụ**
```json
{
  "sessions": [
    {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "device_info": {
        "browser": "Chrome 124",
        "os": "Windows 11",
        "device": "Desktop",
        "user_agent": "Mozilla/5.0 ..."
      },
      "ip_address": "14.240.102.55",
      "created_at": "2026-03-10T08:30:00.000Z",
      "last_used_at": "2026-03-13T14:22:10.000Z",
      "is_current": true
    },
    {
      "_id": "664f1a2b3c4d5e6f7a8b9c0e",
      "device_info": {
        "browser": "Safari 17",
        "os": "iOS 17",
        "device": "Mobile",
        "user_agent": "Mozilla/5.0 ..."
      },
      "ip_address": "118.70.55.12",
      "created_at": "2026-03-08T09:00:00.000Z",
      "last_used_at": "2026-03-12T11:00:00.000Z",
      "is_current": false
    }
  ]
}
```

---

### 18. `DELETE /auths/sessions` 🔒
Thu hồi (xoá) một phiên đăng nhập cụ thể.

**Headers**: `Authorization: Bearer <access_token>`

**Request body**
```ts
{ session_id: string }   // MongoDB ObjectId của phiên cần xoá
```

**Response `200`**
```ts
{ message: "Session revoked" }
```

**Ví dụ**
```json
// Request
{ "session_id": "664f1a2b3c4d5e6f7a8b9c0e" }
```

> **Lưu ý**: Nếu revoke chính phiên hiện tại, cookie `refresh_token` cũng bị xoá và cần đăng nhập lại.

---

### 19. `POST /auths/phone/send-otp` 🔒
Gửi OTP xác minh số điện thoại.

**Headers**: `Authorization: Bearer <access_token>`

**Request body**
```ts
{ phone: string }   // Số điện thoại VN (+84...)
```

**Response `200`**
```ts
{ message: "OTP sent to phone" }
```

**Ví dụ**
```json
{ "phone": "+84901234567" }
```

---

### 20. `POST /auths/phone/verify-otp` 🔒
Xác minh OTP gửi đến điện thoại.

**Headers**: `Authorization: Bearer <access_token>`

**Request body**
```ts
{
  temp_token: string   // Token tạm từ bước send-otp
  otp:        string   // OTP 6 chữ số
}
```

**Response `200`**
```ts
{ message: "Phone verified successfully" }
```

**Ví dụ**
```json
{ "temp_token": "eyJ0bXAiOiJ0cnVlIn0...", "otp": "374829" }
```

---

### 21. `GET /auths/oauth/:provider`
Khởi tạo luồng đăng nhập OAuth. Browser sẽ được redirect đến trang đăng nhập của provider.

**Path params**
```
provider: "google" | "facebook" | ...
```

**Hành vi**: Server trả `302 Redirect` đến URL đăng nhập của provider (không có response body).

---

### 22. `GET /auths/:provider/callback`
Callback sau khi đăng nhập OAuth thành công. Xử lý tự động, không gọi trực tiếp.

**Hành vi**: Server set cookie `refresh_token`, sau đó redirect về client với `access_token` trong query string:
```
{clientUrl}/oauth/callback?access_token=eyJhbGci...
```

---

## User APIs

---

### 23. `GET /users/me` 🔒
Lấy thông tin đầy đủ của người dùng hiện tại.

**Headers**: `Authorization: Bearer <access_token>`

**Response `200`**
```ts
{
  _id:                string
  email:              string
  phone:              string | null
  full_name:          string
  avatar_url:         string | null
  date_of_birth:      string | null    // ISO 8601 date
  gender:             "male" | "female" | "other" | null
  system_role:        "admin" | "user"
  status:             "active" | "inactive" | "banned" | "pending"
  email_verified_at:  string | null    // ISO 8601
  phone_verified_at:  string | null
  last_login_at:      string | null
  last_login_ip:      string | null
  two_factor_enabled: boolean
  is_email_verified:  boolean          // virtual field
  is_phone_verified:  boolean          // virtual field
  preferences: {
    language:      "vi" | "en"
    theme:         "light" | "dark" | "system"
    notifications: {
      email: boolean
      sms:   boolean
      push:  boolean
    }
  }
  created_at: string   // ISO 8601
  updated_at: string
}
```

**Ví dụ**
```json
{
  "_id": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "alice@example.com",
  "phone": "+84901234567",
  "full_name": "Nguyen Thi Alice",
  "avatar_url": null,
  "date_of_birth": "1995-06-15",
  "gender": "female",
  "system_role": "user",
  "status": "active",
  "email_verified_at": "2026-03-10T08:35:00.000Z",
  "phone_verified_at": "2026-03-10T09:00:00.000Z",
  "last_login_at": "2026-03-13T08:00:00.000Z",
  "last_login_ip": "14.240.102.55",
  "two_factor_enabled": false,
  "is_email_verified": true,
  "is_phone_verified": true,
  "preferences": {
    "language": "vi",
    "theme": "light",
    "notifications": { "email": true, "sms": true, "push": true }
  },
  "created_at": "2026-03-10T08:30:00.000Z",
  "updated_at": "2026-03-13T08:00:00.000Z"
}
```

---

### 24. `PATCH /users/me` 🔒
Cập nhật thông tin profile cá nhân. Chỉ gửi các field cần thay đổi.

**Headers**: `Authorization: Bearer <access_token>`

**Request body** (tất cả optional)
```ts
{
  full_name?:     string    // 6–32 ký tự
  date_of_birth?: string    // ISO 8601 date, ví dụ "1995-06-15"
  gender?:        "male" | "female" | "other"
}
```

**Response `200`** — Trả về object user đã cập nhật (cùng cấu trúc với `GET /users/me`)

**Ví dụ**
```json
// Request
{
  "full_name": "Nguyen Thi Alice Updated",
  "gender": "female",
  "date_of_birth": "1995-06-15"
}

// Response — full user object đã cập nhật
{
  "success": true,
  "statusCode": 200,
  "message": "Request was successful",
  "data": {
    "_id": "69b40a16f4047fb276f471a5",
    "email": "23t1020100@husc.edu.vn",
    "phone": "+84901234567",
    "full_name": "Nguyen Thi Alice",
    "avatar_url": null,
    "date_of_birth": null,
    "gender": null,
    "system_role": "user",
    "status": "active",
    "email_verified_at": "2026-03-13T13:03:21.514Z",
    "phone_verified_at": null,
    "last_login_at": "2026-03-13T13:08:04.729Z",
    "two_factor_enabled": false,
    "preferences": {
      "language": "vi",
      "theme": "light",
      "notifications": {
        "email": true,
        "sms": true,
        "push": true
      }
    },
    "created_at": "2026-03-13T12:59:02.429Z",
    "updated_at": "2026-03-13T13:08:04.732Z"
  },
  "correlationId": "51bb3577-6516-4239-8f2c-9d81e497ef78",
  "timestamp": "2026-03-13T13:13:22.036Z"
}
```

---

### 25. `PATCH /users/me/preferences` 🔒
Cập nhật cài đặt hiển thị và thông báo. Chỉ gửi các field cần thay đổi.

**Headers**: `Authorization: Bearer <access_token>`

**Request body** (tất cả optional)
```ts
{
  language?:      "vi" | "en"
  theme?:         "light" | "dark" | "system"
  notifications?: {
    email?: boolean
    phone?: boolean
    push?:  boolean
  }
}
```

**Response `200`** — Trả về preferences đã cập nhật

**Ví dụ**
```json
// Request — chỉ đổi theme và tắt thông báo push
{
  "theme": "dark",
  "notifications": { "push": false }
}

// Response
{
  "language": "vi",
  "theme": "dark",
  "notifications": { "email": true, "sms": true, "push": false }
}
```

---

## Luồng điển hình

### Đăng ký tài khoản
```
1. POST /auths/check-email       → kiểm tra email trống
2. POST /auths/register          → tạo tài khoản, nhận OTP qua email
3. POST /auths/verify-otp        → xác minh email → tài khoản active
```

### Đăng nhập không có 2FA
```
1. POST /auths/login             → nhận { access_token }, cookie refresh_token
```

### Đăng nhập có 2FA
```
1. POST /auths/login             → nhận { requires_2fa: true, temp_token }
2. POST /auths/2fa/send-otp      → gửi OTP đến email
3. POST /auths/2fa/verify-otp    → nhận { access_token }, cookie refresh_token
```

### Quên mật khẩu
```
1. POST /auths/forgot-password         → nhận session_token, nhận OTP qua email
2. POST /auths/reset-password/verify-otp → nhận grant_token
3. POST /auths/reset-password          → đặt mật khẩu mới
```

### Token expiry
```
1. POST /auths/refresh-token     → access_token hết hạn → lấy token mới từ cookie
```

---

## Error Response

Tất cả lỗi trả về cùng một cấu trúc:

```ts
{
  statusCode: number
  message:    string | string[]   // string[] khi validation fail
  error:      string
}
```

**Ví dụ validation error**
```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than 6 characters"],
  "error": "Bad Request"
}
```

**Ví dụ lỗi business**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

| HTTP Code | Ý nghĩa |
|-----------|---------|
| 400 | Validation thất bại / dữ liệu không hợp lệ |
| 401 | Chưa đăng nhập hoặc token hết hạn |
| 403 | Không có quyền |
| 404 | Không tìm thấy resource |
| 409 | Conflict (email đã tồn tại, v.v.) |
| 429 | Quá giới hạn rate limit |
| 500 | Lỗi server |
