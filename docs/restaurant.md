# POST-LOGIN — User Profile, Organization & Restaurant Management
*Phiên bản 1.0 — Production Final · Web-only · SaaS Multi-Restaurant Platform*

---

## 📋 Danh sách Use-case

```
UC-PL-01  Xem & Cập nhật thông tin cá nhân (Profile)
UC-PL-02  Cập nhật Avatar
UC-PL-03  Cập nhật Preferences (ngôn ngữ, theme, thông báo)
UC-PL-04  Tạo Organization
UC-PL-05  Xem & Cập nhật Organization
UC-PL-06  Tạo Restaurant
UC-PL-07  Xem & Cập nhật Restaurant
UC-PL-08  Publish / Unpublish Restaurant
UC-PL-09  Mời thành viên vào Restaurant
UC-PL-10  Cập nhật vai trò thành viên
UC-PL-11  Xoá thành viên khỏi Restaurant
UC-PL-12  Xem danh sách Restaurant của Organization
UC-PL-13  Xoá Restaurant (soft delete)
UC-PL-14  Xoá Organization (soft delete)
```

## Tổng quan Endpoint Post-Login

```
# Profile
GET    /users/me                        ← lấy thông tin bản thân
PATCH  /users/me                        ← cập nhật thông tin cá nhân
POST   /users/me/avatar                 ← upload avatar
DELETE /users/me/avatar                 ← xoá avatar
PATCH  /users/me/preferences            ← cập nhật preferences

# Organization
POST   /organizations                   ← tạo org
GET    /organizations/:org_id           ← xem org (thành viên)
PATCH  /organizations/:org_id           ← cập nhật org (owner)
DELETE /organizations/:org_id           ← xoá org (owner)

# Restaurant
POST   /organizations/:org_id/restaurants           ← tạo restaurant
GET    /organizations/:org_id/restaurants           ← danh sách restaurants
GET    /organizations/:org_id/restaurants/:res_id   ← chi tiết restaurant
PATCH  /organizations/:org_id/restaurants/:res_id   ← cập nhật restaurant
PATCH  /organizations/:org_id/restaurants/:res_id/publish     ← publish
PATCH  /organizations/:org_id/restaurants/:res_id/unpublish   ← unpublish
DELETE /organizations/:org_id/restaurants/:res_id   ← xoá restaurant

# Restaurant Members
GET    /organizations/:org_id/restaurants/:res_id/members         ← danh sách
POST   /organizations/:org_id/restaurants/:res_id/members         ← mời thành viên
PATCH  /organizations/:org_id/restaurants/:res_id/members/:uid    ← đổi vai trò
DELETE /organizations/:org_id/restaurants/:res_id/members/:uid    ← xoá thành viên
```

> ⚠️ Tất cả endpoint yêu cầu `Authorization: Bearer <access_token>` hợp lệ.
> JWT Middleware chạy trước mọi handler — xem phần JWT Auth Middleware trong auth-core.md.

---

## ⚠️ Ràng buộc bảo mật & nghiệp vụ toàn cục

```
1. Mọi thao tác write phải verify user_id từ JWT — không nhận user_id từ body/param
2. RBAC 2 lớp:
     system_role (JWT)    : 'admin' | 'user'  — platform level
     restaurant role (DB) : owner/manager/cashier/waiter/kitchen/delivery — per restaurant
3. Organization owner = user tạo org (organizations.owner_id)
4. Restaurant RBAC: query restaurant_members tại handler — KHÔNG lưu vào JWT
5. Rate limit áp dụng per user_id (không per IP) cho write operations
6. File upload: kiểm tra MIME type + magic bytes — không chỉ kiểm tra extension
7. Slug auto-generate từ name + unique check — không nhận slug thô từ client
8. Soft delete: set deleted_at = NOW() — không DELETE vật lý
9. Plan limit: kiểm tra max_restaurants và max_staff trước mọi thao tác tạo mới
```

---

## 🗂️ Redis Key Reference (Post-Login)

```
# Rate limiting (write operations)
ratelimit:profile:update:{user_id}          TTL 300s    [> 10/5 phút → 429]
ratelimit:avatar:upload:{user_id}           TTL 3600s   [> 5/giờ → 429]
ratelimit:org:create:{user_id}              TTL 3600s   [> 3/giờ → 429]
ratelimit:restaurant:create:{user_id}       TTL 3600s   [> 5/giờ → 429]
ratelimit:member:invite:{restaurant_id}     TTL 3600s   [> 20/giờ → 429]

# Cache (read-heavy)
cache:org:{org_id}                          TTL 300s    { org data }
cache:restaurant:{restaurant_id}            TTL 300s    { restaurant data }
cache:restaurant:members:{restaurant_id}    TTL 60s     [ member list ]
```

> ⚠️ Mọi write operation phải DEL cache liên quan ngay sau khi commit DB thành công.

---

# UC-PL-01 — Xem & Cập nhật thông tin cá nhân (Profile)

## Xem Profile

```
Client                    Server                      MySQL
  │                          │                           │
  ├─ GET /users/me ─────────►│                           │
  │  Authorization: Bearer   │                           │
  │                          │                           │
  │                          ├─ JWT Middleware           │
  │                          │  → req.user.user_id       │
  │                          │                           │
  │                          ├─ SELECT users ───────────►│
  │                          │  WHERE id = user_id       │
  │                          │  AND deleted_at IS NULL   │
  │                          │◄──────────────────────────┤
  │                          │                           │
  │◄─ 200 {                  │                           │
  │    id, email, phone,     │                           │
  │    full_name, avatar_url,│                           │
  │    date_of_birth, gender,│                           │
  │    system_role, status,  │                           │
  │    email_verified_at,    │                           │
  │    phone_verified_at,    │                           │
  │    two_factor_enabled,   │                           │
  │    preferences,          │                           │
  │    created_at            │                           │
  │  }                       │                           │
```

> 📌 Không trả: `password_hash`, `metadata` (internal), `last_login_ip`.

---

## Cập nhật Profile

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ PATCH /users/me ───────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    full_name?,           │                           │               │
  │    date_of_birth?,       │                           │               │
  │    gender?               │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:profile:update:{user_id}  │
  │                          │  EX 300s  [> 10 → 429]    │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate fields          │               │
  │                          │  full_name: 2–150 ký tự   │               │
  │                          │  date_of_birth: ISO 8601, │               │
  │                          │    không trong tương lai  │               │
  │                          │  gender: male|female|other│               │
  │                          │  [sai → 400]              │               │
  │                          │                           │               │
  │                          ├─ Lọc chỉ các field cho phép               │
  │                          │  (strip email, phone, role, status...)    │
  │                          │                           │               │
  │                          ├─ UPDATE users ───────────►│               │
  │                          │  SET field=? ...          │               │
  │                          │  WHERE id = user_id       │               │
  │                          │◄──────────────────────────┤               │
  │◄─ 200 { updated: true, user: {...} }                 │               │
```

> 📌 Email, phone, system_role, status **không được phép cập nhật** qua endpoint này.
> Email → UC-PL-01-email-change (flow riêng cần OTP verify).
> Phone → UC-15 trong auth-core.md.

---

# UC-PL-02 — Cập nhật Avatar

```
Client                    Server                      MySQL           Redis   Storage
  │                          │                           │               │         │
  ├─ POST /users/me/avatar ─►│                           │               │         │
  │  Authorization: Bearer   │                           │               │         │
  │  Content-Type:           │                           │               │         │
  │    multipart/form-data   │                           │               │         │
  │  { file: <image> }       │                           │               │         │
  │                          │                           │               │         │
  │                          ├─ Rate limit ─────────────────────────────►│         │
  │                          │  INCR ratelimit:avatar:upload:{user_id}   │         │
  │                          │  EX 3600s  [> 5 → 429]    │               │         │
  │                          │◄─────────────────────────────────────────┤         │
  │                          │                           │               │         │
  │                          ├─ Validate file            │               │         │
  │                          │  MIME: image/jpeg|png|webp│               │         │
  │                          │  Magic bytes check        │               │         │
  │                          │  Size: tối đa 5MB         │               │         │
  │                          │  [sai → 422]              │               │         │
  │                          │                           │               │         │
  │                          ├─ Resize → max 400×400px   │               │         │
  │                          │  (sharp / imagemagick)    │               │         │
  │                          │                           │               │         │
  │                          ├─ Upload CDN ─────────────────────────────────────►  │
  │                          │  path: avatars/{user_id}/{uuid}.webp      │         │
  │                          │◄─────────────────────────────────────────────────── │
  │                          │  → cdn_url                │               │         │
  │                          │                           │               │         │
  │                          ├─ SELECT avatar_url cũ ───►│               │         │
  │                          │◄──────────────────────────┤               │         │
  │                          │                           │               │         │
  │                          ├─ UPDATE users ───────────►│               │         │
  │                          │  SET avatar_url = cdn_url │               │         │
  │                          │  WHERE id = user_id       │               │         │
  │                          │◄──────────────────────────┤               │         │
  │                          │                           │               │         │
  │                          ├─ INSERT file_uploads ────►│               │         │
  │                          │  entity_type='user'       │               │         │
  │                          │  entity_id=user_id        │               │         │
  │                          │◄──────────────────────────┤               │         │
  │                          │                           │               │         │
  │                          ├─ [Nếu có ảnh cũ]          │               │         │
  │                          │  Queue: delete old CDN file async         │         │
  │                          │                           │               │         │
  │◄─ 200 { avatar_url }     │                           │               │         │
```

## Xoá Avatar

```
DELETE /users/me/avatar    Authorization: Bearer

  ├─ SELECT avatar_url WHERE id = user_id
  │  [NULL → 400 "Chưa có avatar"]
  ├─ UPDATE users SET avatar_url = NULL
  ├─ Queue: delete CDN file async
  └─ 200 { removed: true }
```

---

# UC-PL-03 — Cập nhật Preferences

```
Client                    Server                      MySQL
  │                          │                           │
  ├─ PATCH /users/me/        │                           │
  │   preferences ──────────►│                           │
  │  Authorization: Bearer   │                           │
  │  {                       │                           │
  │    language?: "vi"|"en", │                           │
  │    theme?: "light"|"dark"│                           │
  │      |"system",          │                           │
  │    notifications?: {     │                           │
  │      email: bool,        │                           │
  │      push: bool,         │                           │
  │      sms: bool           │                           │
  │    }                     │                           │
  │  }                       │                           │
  │                          │                           │
  │                          ├─ Validate schema          │
  │                          │  [sai → 422]              │
  │                          │                           │
  │                          ├─ Merge với preferences    │
  │                          │  hiện tại (JSON_MERGE)    │
  │                          │                           │
  │                          ├─ UPDATE users ───────────►│
  │                          │  SET preferences =        │
  │                          │    JSON_MERGE_PATCH(       │
  │                          │      preferences, ?)      │
  │                          │  WHERE id = user_id       │
  │                          │◄──────────────────────────┤
  │◄─ 200 { preferences }    │                           │
```

> 📌 Dùng `JSON_MERGE_PATCH` — chỉ cập nhật các key được gửi, giữ nguyên các key còn lại.

---

# UC-PL-04 — Tạo Organization

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /organizations ───►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    name,                 │                           │               │
  │    billing_email?,       │                           │               │
  │    tax_code?             │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:org:create:{user_id}      │
  │                          │  EX 3600s  [> 3 → 429]    │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Validate                 │               │
  │                          │  name: 2–200 ký tự        │               │
  │                          │  billing_email: email fmt │               │
  │                          │  [sai → 422]              │               │
  │                          │                           │               │
  │                          ├─ Auto-generate slug       │               │
  │                          │  slugify(name) + suffix   │               │
  │                          │  nếu trùng               │               │
  │                          │                           │               │
  │                          ├─ SELECT organizations ───►│               │
  │                          │  WHERE slug = ?           │               │
  │                          │  [trùng → thêm suffix -2, -3...]          │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ INSERT organizations ───►│               │
  │                          │  owner_id = user_id       │               │
  │                          │  plan = 'free'            │               │
  │                          │  max_restaurants = 1      │               │
  │                          │  max_staff = 5            │               │
  │                          │◄──────────────────────────┤               │
  │                          │  → org_id                 │               │
  │                          │                           │               │
  │                          ├─ INSERT restaurant_members►│               │
  │                          │  role = 'owner'           │               │
  │                          │  user_id = req.user.id    │               │
  │                          │  (nếu có restaurant đầu tiên)             │
  │                          │◄──────────────────────────┤               │
  │◄─ 201 { org }            │                           │               │
```

> 📌 Mỗi user có thể tạo nhiều organization. Organization plan `free` giới hạn
> `max_restaurants = 1`, `max_staff = 5`.

---

# UC-PL-05 — Xem & Cập nhật Organization

## Xem Organization

```
GET /organizations/:org_id    Authorization: Bearer

  ├─ JWT Middleware → user_id
  │
  ├─ GET cache:org:{org_id} từ Redis
  │  [HIT] → kiểm tra quyền → trả về
  │
  │  [MISS]
  ├─ SELECT organizations WHERE id = org_id AND deleted_at IS NULL
  │  [không thấy → 404]
  │
  ├─ Kiểm tra quyền truy cập:
  │  owner_id = user_id? → OK (owner)
  │  OR EXISTS restaurant_members WHERE user_id = ? AND restaurant thuộc org → OK (member)
  │  [không thuộc → 403]
  │
  ├─ SET cache:org:{org_id}  EX 300
  └─ 200 { org }
```

## Cập nhật Organization

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ PATCH /organizations/  │                           │               │
  │   :org_id ─────────────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    name?,                │                           │               │
  │    logo_url?,            │                           │               │
  │    billing_email?,       │                           │               │
  │    tax_code?,            │                           │               │
  │    settings?             │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT organizations ───►│               │
  │                          │  WHERE id = org_id        │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra owner           │               │
  │                          │  owner_id ≠ user_id       │               │
  │                          │  → 403 "Chỉ owner mới có thể chỉnh sửa"   │
  │                          │                           │               │
  │                          ├─ Validate fields          │               │
  │                          │  [sai → 422]              │               │
  │                          │                           │               │
  │                          ├─ [Nếu đổi name]           │               │
  │                          │  Re-generate & check slug │               │
  │                          │                           │               │
  │                          ├─ UPDATE organizations ───►│               │
  │                          │  WHERE id = org_id        │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:org:{org_id} ─────────────────►│
  │◄─ 200 { org }            │                           │               │
```

> 📌 `plan`, `max_restaurants`, `max_staff` chỉ được thay đổi bởi `system_role = 'admin'`
> qua admin API riêng — không expose trong endpoint này.

---

# UC-PL-06 — Tạo Restaurant

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /organizations/    │                           │               │
  │   :org_id/restaurants ─►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    name,                 │                           │               │
  │    address,              │                           │               │
  │    city,                 │                           │               │
  │    phone?,               │                           │               │
  │    email?,               │                           │               │
  │    cuisine_type?,        │                           │               │
  │    timezone?             │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:restaurant:create:{user_id}│
  │                          │  EX 3600s  [> 5 → 429]    │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ SELECT organizations ───►│               │
  │                          │  WHERE id = org_id        │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra owner           │               │
  │                          │  [owner_id ≠ user_id → 403]               │
  │                          │                           │               │
  │                          ├─ Kiểm tra plan limit      │               │
  │                          │  SELECT COUNT(*) restaurants              │
  │                          │  WHERE org_id = ?         │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [count >= max_restaurants]               │
  │                          │  → 403 "Đã đạt giới hạn plan"             │
  │                          │  "Nâng cấp để tạo thêm"  │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Validate fields          │               │
  │                          │  name: 2–200 ký tự        │               │
  │                          │  city: bắt buộc           │               │
  │                          │  address: bắt buộc        │               │
  │                          │  timezone: valid TZ string│               │
  │                          │  [sai → 422]              │               │
  │                          │                           │               │
  │                          ├─ Auto-generate slug       │               │
  │                          │  slugify(name) unique per org             │
  │                          │                           │               │
  │                          ├─ INSERT restaurants ─────►│               │
  │                          │  organization_id = org_id │               │
  │                          │  is_published = 0         │               │
  │                          │◄──────────────────────────┤               │
  │                          │  → restaurant_id          │               │
  │                          │                           │               │
  │                          ├─ INSERT restaurant_members►│               │
  │                          │  restaurant_id = new_id   │               │
  │                          │  user_id = req.user.id    │               │
  │                          │  role = 'owner'           │               │
  │                          │  joined_at = NOW()        │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:org:{org_id} ─────────────────►│
  │◄─ 201 { restaurant }     │                           │               │
```

---

# UC-PL-07 — Xem & Cập nhật Restaurant

## Xem chi tiết Restaurant

```
GET /organizations/:org_id/restaurants/:res_id    Authorization: Bearer

  ├─ GET cache:restaurant:{res_id} từ Redis  [HIT → kiểm tra quyền → trả về]
  │
  │  [MISS]
  ├─ SELECT restaurants
  │  WHERE id = res_id AND organization_id = org_id AND deleted_at IS NULL
  │  [không thấy → 404]
  │
  ├─ Kiểm tra quyền:
  │  SELECT restaurant_members WHERE restaurant_id=? AND user_id=? AND is_active=1
  │  [không phải member] AND org.owner_id ≠ user_id → 403
  │
  ├─ SET cache:restaurant:{res_id}  EX 300
  └─ 200 { restaurant }
```

## Cập nhật Restaurant

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ PATCH /organizations/  │                           │               │
  │   :org_id/restaurants/  │                           │               │
  │   :res_id ─────────────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    name?,                │  ← re-gen slug nếu đổi   │               │
  │    description?,         │                           │               │
  │    cuisine_type?,        │                           │               │
  │    address?,             │                           │               │
  │    city?,                │                           │               │
  │    district?,            │                           │               │
  │    phone?,               │                           │               │
  │    email?,               │                           │               │
  │    operating_hours?,     │                           │               │
  │    tax_rate?,            │                           │               │
  │    service_charge_rate?, │                           │               │
  │    accepts_online_orders?,                           │               │
  │    accepts_reservations?,│                           │               │
  │    settings?             │                           │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT restaurants ─────►│               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra quyền           │               │
  │                          │  role IN ('owner','manager') → OK         │
  │                          │  [khác → 403]             │               │
  │                          │                           │               │
  │                          ├─ Validate fields          │               │
  │                          │  operating_hours: JSON schema             │
  │                          │  tax_rate: 0–1 (DECIMAL)  │               │
  │                          │  [sai → 422]              │               │
  │                          │                           │               │
  │                          ├─ UPDATE restaurants ─────►│               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:restaurant:{res_id}────────────►│
  │◄─ 200 { restaurant }     │                           │               │
```

---

# UC-PL-08 — Publish / Unpublish Restaurant

## Publish

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ PATCH /organizations/  │                           │               │
  │   :org_id/restaurants/  │                           │               │
  │   :res_id/publish ─────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT restaurants ─────►│               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra quyền           │               │
  │                          │  role = 'owner' → OK      │               │
  │                          │  [khác → 403]             │               │
  │                          │                           │               │
  │                          ├─ Kiểm tra điều kiện publish               │
  │                          │  [is_published = 1 → 400 "Đã published"]  │
  │                          │  [address IS NULL → 422]  │               │
  │                          │  [city IS NULL → 422]     │               │
  │                          │  [phone IS NULL → 422     │               │
  │                          │   "Cần số điện thoại"]    │               │
  │                          │                           │               │
  │                          ├─ SELECT COUNT(menu_items) ►│               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │  AND is_available=1       │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  [< 1 → 422               │               │
  │                          │   "Cần ít nhất 1 món"]    │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE restaurants ─────►│               │
  │                          │  SET is_published = 1     │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:restaurant:{res_id}────────────►│
  │◄─ 200 { published: true }│                           │               │
```

## Unpublish

```
PATCH /organizations/:org_id/restaurants/:res_id/unpublish

  ├─ Kiểm tra quyền: role = 'owner' → OK  [khác → 403]
  ├─ [is_published = 0 → 400 "Chưa published"]
  ├─ UPDATE restaurants SET is_published = 0
  ├─ DEL cache:restaurant:{res_id}
  └─ 200 { published: false }
```

---

# UC-PL-09 — Mời thành viên vào Restaurant

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ POST /organizations/    │                           │               │
  │   :org_id/restaurants/  │                           │               │
  │   :res_id/members ─────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  {                       │                           │               │
  │    email,                │  ← email của user cần mời │               │
  │    role                  │  ← manager|cashier|waiter │               │
  │                          │      |kitchen|delivery    │               │
  │  }                       │                           │               │
  │                          │                           │               │
  │                          ├─ Rate limit ─────────────────────────────►│
  │                          │  INCR ratelimit:member:invite:{res_id}    │
  │                          │  EX 3600s  [> 20 → 429]   │               │
  │                          │◄─────────────────────────────────────────┤
  │                          │                           │               │
  │                          ├─ Kiểm tra quyền mời       │               │
  │                          │  requester role:          │               │
  │                          │  'owner'   → có thể mời mọi role          │
  │                          │  'manager' → chỉ mời cashier/waiter/      │
  │                          │              kitchen/delivery              │
  │                          │  [khác → 403]             │               │
  │                          │                           │               │
  │                          ├─ Validate role            │               │
  │                          │  [owner không được mời qua API → 422]     │
  │                          │  (owner chỉ set lúc tạo restaurant)       │
  │                          │                           │               │
  │                          ├─ SELECT users ───────────►│               │
  │                          │  WHERE email = ?          │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  AND status = 'active'    │               │
  │                          │  [không thấy → 404        │               │
  │                          │   "Người dùng không tồn tại"]             │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra staff limit     │               │
  │                          │  SELECT COUNT(rm)         │               │
  │                          │  JOIN restaurants ON org_id               │
  │                          │  WHERE org_id = ? AND is_active=1         │
  │                          │  [>= max_staff → 403      │               │
  │                          │   "Đạt giới hạn nhân viên"]               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ SELECT restaurant_members►│               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │  AND user_id=?            │               │
  │                          │  [đã là member và is_active=1 → 409]      │
  │                          │  [đã là member và is_active=0]            │
  │                          │    → UPDATE is_active=1, role=?           │
  │                          │      joined_at=NOW()      │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ INSERT restaurant_members►│               │
  │                          │  invited_by = req.user.id │               │
  │                          │  joined_at = NOW()        │               │
  │                          │  is_active = 1            │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:restaurant:members:{res_id}───►│
  │                          ├─ Push → Email Queue (thông báo mời)       │
  │◄─ 201 { member }         │                           │               │
```

> 📌 Hệ thống không có flow "chờ chấp nhận lời mời" — thêm trực tiếp.
> Nếu cần invitation flow: bổ sung bảng `restaurant_invitations` riêng.

---

# UC-PL-10 — Cập nhật vai trò thành viên

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ PATCH /organizations/   │                           │               │
  │   :org_id/restaurants/  │                           │               │
  │   :res_id/members/:uid ►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  { role }                │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT restaurant_members►│               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │  AND user_id=:uid         │               │
  │                          │  AND is_active=1          │               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra quyền           │               │
  │                          │  requester role = 'owner' → OK            │
  │                          │  [khác → 403]             │               │
  │                          │                           │               │
  │                          ├─ Validate role            │               │
  │                          │  [role = 'owner' → 422    │               │
  │                          │   "Không thể thay đổi thành owner"]       │
  │                          │  [uid = requester → 422   │               │
  │                          │   "Không thể đổi role bản thân"]          │
  │                          │                           │               │
  │                          ├─ UPDATE restaurant_members►│               │
  │                          │  SET role = ?             │               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │  AND user_id=:uid         │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:restaurant:members:{res_id}───►│
  │◄─ 200 { updated: true }  │                           │               │
```

---

# UC-PL-11 — Xoá thành viên khỏi Restaurant

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ DELETE /organizations/  │                           │               │
  │   :org_id/restaurants/  │                           │               │
  │   :res_id/members/:uid ►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT restaurant_members►│               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │  AND user_id=:uid         │               │
  │                          │  AND is_active=1          │               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra quyền           │               │
  │                          │  requester role = 'owner' → có thể xoá ai │
  │                          │  uid = requester          │               │
  │                          │    → tự rời (self-leave)  │               │
  │                          │  [manager xoá member khác → 403]          │
  │                          │                           │               │
  │                          ├─ Kiểm tra không xoá owner │               │
  │                          │  target role = 'owner'    │               │
  │                          │  AND uid ≠ requester      │               │
  │                          │  → 403 "Không thể xoá owner"              │
  │                          │                           │               │
  │                          ├─ [Owner tự rời]           │               │
  │                          │  Kiểm tra còn owner khác? │               │
  │                          │  [Không còn ai → 400      │               │
  │                          │   "Phải có ít nhất 1 owner,               │
  │                          │    hãy chuyển quyền trước"]               │
  │                          │                           │               │
  │                          ├─ UPDATE restaurant_members►│               │
  │                          │  SET is_active = 0        │               │
  │                          │  WHERE ...                │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:restaurant:members:{res_id}───►│
  │◄─ 200 { removed: true }  │                           │               │
```

---

# UC-PL-12 — Xem danh sách Restaurant của Organization

```
GET /organizations/:org_id/restaurants    Authorization: Bearer
  Query params: page=1&limit=20&status=published|unpublished|all

  ├─ SELECT organizations WHERE id=org_id AND deleted_at IS NULL
  │  [không thấy → 404]
  │
  ├─ Kiểm tra quyền:
  │  owner_id = user_id → OK
  │  OR EXISTS restaurant_members (user thuộc bất kỳ restaurant trong org) → OK
  │  [không thuộc → 403]
  │
  ├─ SELECT restaurants
  │  WHERE organization_id = org_id
  │  AND deleted_at IS NULL
  │  [+ AND is_published = ? nếu filter status]
  │  ORDER BY created_at DESC
  │  LIMIT ? OFFSET ?
  │
  └─ 200 {
       total, page, limit,
       restaurants: [
         { id, name, slug, city, is_published, average_rating,
           total_reviews, created_at }
       ]
     }
```

---

# UC-PL-13 — Xoá Restaurant (Soft Delete)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ DELETE /organizations/  │                           │               │
  │   :org_id/restaurants/  │                           │               │
  │   :res_id ─────────────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  { confirm_name }        │  ← tên restaurant để xác nhận             │
  │                          │                           │               │
  │                          ├─ SELECT restaurants ─────►│               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra quyền           │               │
  │                          │  org.owner_id = user_id → OK              │
  │                          │  [khác → 403]             │               │
  │                          │                           │               │
  │                          ├─ Xác nhận tên             │               │
  │                          │  confirm_name ≠ restaurant.name           │
  │                          │  → 422 "Tên xác nhận không khớp"          │
  │                          │                           │               │
  │                          ├─ Kiểm tra đơn hàng đang mở               │
  │                          │  SELECT COUNT(orders)     │               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │  AND status NOT IN        │               │
  │                          │    ('completed','cancelled','refunded')    │
  │                          │  [> 0 → 409               │               │
  │                          │   "Còn đơn hàng đang xử lý"]              │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE restaurants ─────►│               │
  │                          │  SET deleted_at = NOW()   │               │
  │                          │  SET is_published = 0     │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE restaurant_members►│               │
  │                          │  SET is_active = 0        │               │
  │                          │  WHERE restaurant_id=?    │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ DEL cache:restaurant:{res_id}────────────►│
  │                          ├─ DEL cache:restaurant:members:{res_id}───►│
  │                          ├─ DEL cache:org:{org_id} ─────────────────►│
  │◄─ 200 { deleted: true }  │                           │               │
```

> ⚠️ Hard delete (vật lý) được xử lý bởi scheduled job riêng sau 30 ngày.
> Dữ liệu audit (`audit_logs`, `orders`, `payments`) giữ nguyên vĩnh viễn.

---

# UC-PL-14 — Xoá Organization (Soft Delete)

```
Client                    Server                      MySQL           Redis
  │                          │                           │               │
  ├─ DELETE /organizations/  │                           │               │
  │   :org_id ─────────────►│                           │               │
  │  Authorization: Bearer   │                           │               │
  │  { confirm_name }        │                           │               │
  │                          │                           │               │
  │                          ├─ SELECT organizations ───►│               │
  │                          │  [không thấy → 404]       │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ owner_id ≠ user_id       │               │
  │                          │  → 403                    │               │
  │                          │                           │               │
  │                          ├─ Xác nhận tên             │               │
  │                          │  [không khớp → 422]       │               │
  │                          │                           │               │
  │                          ├─ Kiểm tra restaurant còn active           │
  │                          │  SELECT COUNT(restaurants)│               │
  │                          │  WHERE org_id=?           │               │
  │                          │  AND deleted_at IS NULL   │               │
  │                          │  AND is_published=1       │               │
  │                          │  [> 0 → 409               │               │
  │                          │   "Unpublish tất cả       │               │
  │                          │    restaurants trước"]    │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Kiểm tra đơn hàng đang mở               │
  │                          │  (JOIN restaurants ON org_id)             │
  │                          │  [> 0 → 409]              │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE organizations ───►│               │
  │                          │  SET deleted_at = NOW()   │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ UPDATE restaurants ─────►│               │
  │                          │  SET deleted_at = NOW()   │               │
  │                          │  SET is_published = 0     │               │
  │                          │  WHERE org_id=?           │               │
  │                          │◄──────────────────────────┤               │
  │                          │                           │               │
  │                          ├─ Flush cache liên quan ──────────────────►│
  │                          │  DEL cache:org:{org_id}   │               │
  │                          │  DEL cache:restaurant:*   │               │
  │◄─ 200 { deleted: true }  │                           │               │
```

---

# 🔐 RBAC — Quyền hạn theo Restaurant Role

```
┌─────────────────────────────┬───────┬─────────┬─────────┬────────┬─────────┬──────────┐
│ Hành động                   │ owner │ manager │cashier  │waiter  │kitchen  │delivery  │
├─────────────────────────────┼───────┼─────────┼─────────┼────────┼─────────┼──────────┤
│ Xem restaurant info         │  ✓    │   ✓     │   ✓     │  ✓     │   ✓     │   ✓      │
│ Cập nhật restaurant         │  ✓    │   ✓     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Publish/Unpublish           │  ✓    │   ✗     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Xoá restaurant              │  ✓    │   ✗     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Mời owner                   │  ✗    │   ✗     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Mời manager/cashier/...     │  ✓    │   ✗     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Mời cashier/waiter/...      │  ✓    │   ✓     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Đổi role thành viên         │  ✓    │   ✗     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Xoá thành viên              │  ✓    │   ✗     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Xem danh sách thành viên    │  ✓    │   ✓     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Quản lý menu                │  ✓    │   ✓     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Tạo/sửa order               │  ✓    │   ✓     │   ✓     │  ✓     │   ✗     │   ✗      │
│ Xử lý thanh toán            │  ✓    │   ✓     │   ✓     │  ✗     │   ✗     │   ✗      │
│ Xem báo cáo doanh thu       │  ✓    │   ✓     │   ✗     │  ✗     │   ✗     │   ✗      │
│ Quản lý bàn                 │  ✓    │   ✓     │   ✓     │  ✓     │   ✗     │   ✗      │
│ Cập nhật trạng thái bếp     │  ✓    │   ✓     │   ✗     │  ✗     │   ✓     │   ✗      │
│ Cập nhật trạng thái delivery│  ✓    │   ✓     │   ✗     │  ✗     │   ✗     │   ✓      │
└─────────────────────────────┴───────┴─────────┴─────────┴────────┴─────────┴──────────┘

Ghi chú:
  - system_role = 'admin' có thể thực hiện mọi hành động trên mọi org/restaurant
  - RBAC check = query restaurant_members tại handler — KHÔNG lưu vào JWT
  - org.owner_id có quyền tương đương restaurant owner trên mọi restaurant trong org
```

---

# 🗂️ Redis Key Reference *(tổng hợp)*

```
# Rate limiting (post-login)
ratelimit:profile:update:{user_id}          TTL 300s    [> 10/5p → 429]
ratelimit:avatar:upload:{user_id}           TTL 3600s   [> 5/giờ → 429]
ratelimit:org:create:{user_id}              TTL 3600s   [> 3/giờ → 429]
ratelimit:restaurant:create:{user_id}       TTL 3600s   [> 5/giờ → 429]
ratelimit:member:invite:{restaurant_id}     TTL 3600s   [> 20/giờ → 429]

# Cache (phải DEL ngay sau mọi write operation)
cache:org:{org_id}                          TTL 300s    { org data }
cache:restaurant:{restaurant_id}            TTL 300s    { restaurant data }
cache:restaurant:members:{restaurant_id}    TTL 60s     [ member list ]
```

---

# 📋 Test Case Coverage

## UC-PL-01 — Profile

| ID | Scenario | Expected |
|----|----------|----------|
| TP01-01 | GET /users/me — token hợp lệ | 200, trả đúng user data |
| TP01-02 | GET /users/me — token hết hạn | 401 |
| TP01-03 | PATCH — full_name hợp lệ | 200, updated |
| TP01-04 | PATCH — full_name quá ngắn (< 2 ký tự) | 422 |
| TP01-05 | PATCH — cố tình set email trong body | field bị strip, email không đổi |
| TP01-06 | PATCH — cố tình set system_role trong body | field bị strip |
| TP01-07 | PATCH — date_of_birth trong tương lai | 422 |
| TP01-08 | PATCH — gender sai enum | 422 |
| TP01-09 | PATCH > 10 lần/5 phút | 429 |

## UC-PL-02 — Avatar

| ID | Scenario | Expected |
|----|----------|----------|
| TP02-01 | Upload JPEG hợp lệ | 200, avatar_url cập nhật |
| TP02-02 | Upload PNG > 5MB | 422 |
| TP02-03 | Upload file .exe giả JPEG | 422 (magic bytes fail) |
| TP02-04 | Upload thành công → ảnh cũ bị xoá async | ✓ |
| TP02-05 | DELETE khi chưa có avatar | 400 |
| TP02-06 | DELETE khi có avatar | 200, avatar_url = NULL |
| TP02-07 | Upload > 5 lần/giờ | 429 |

## UC-PL-04 — Tạo Organization

| ID | Scenario | Expected |
|----|----------|----------|
| TP04-01 | Tạo org hợp lệ | 201, plan=free, owner=user_id |
| TP04-02 | name < 2 ký tự | 422 |
| TP04-03 | Slug trùng → tự thêm suffix | ✓ slug unique |
| TP04-04 | billing_email sai format | 422 |
| TP04-05 | Tạo > 3 org/giờ | 429 |

## UC-PL-06 — Tạo Restaurant

| ID | Scenario | Expected |
|----|----------|----------|
| TP06-01 | Tạo restaurant hợp lệ | 201, is_published=0 |
| TP06-02 | Không phải org owner | 403 |
| TP06-03 | Đã đạt max_restaurants (plan free = 1) | 403 "Đạt giới hạn plan" |
| TP06-04 | Thiếu address hoặc city | 422 |
| TP06-05 | Slug trùng trong cùng org | slug unique per org |
| TP06-06 | Sau tạo: member mặc định role='owner' | ✓ |

## UC-PL-08 — Publish/Unpublish

| ID | Scenario | Expected |
|----|----------|----------|
| TP08-01 | Publish đủ điều kiện | 200, is_published=1 |
| TP08-02 | Publish thiếu phone | 422 |
| TP08-03 | Publish chưa có menu item | 422 |
| TP08-04 | Publish đã published | 400 |
| TP08-05 | Unpublish khi chưa published | 400 |
| TP08-06 | Publish bởi manager | 403 (chỉ owner) |

## UC-PL-09 — Mời thành viên

| ID | Scenario | Expected |
|----|----------|----------|
| TP09-01 | Owner mời manager | 201 |
| TP09-02 | Manager mời manager | 403 |
| TP09-03 | Manager mời waiter | 201 |
| TP09-04 | Mời user không tồn tại | 404 |
| TP09-05 | Mời user đã là member (active) | 409 |
| TP09-06 | Mời user đã là member (inactive) → reactivate | 200 |
| TP09-07 | Mời với role = 'owner' | 422 |
| TP09-08 | Đạt max_staff | 403 |
| TP09-09 | > 20 lời mời/giờ/restaurant | 429 |

## UC-PL-11 — Xoá thành viên

| ID | Scenario | Expected |
|----|----------|----------|
| TP11-01 | Owner xoá member | 200 |
| TP11-02 | Manager xoá member | 403 |
| TP11-03 | Owner cố xoá owner khác | 403 |
| TP11-04 | Owner tự rời (còn owner khác) | 200 |
| TP11-05 | Owner tự rời (chỉ mình là owner) | 400 |
| TP11-06 | Xoá user không phải member | 404 |

## UC-PL-13 — Xoá Restaurant

| ID | Scenario | Expected |
|----|----------|----------|
| TP13-01 | Xoá thành công | 200, deleted_at set, is_published=0 |
| TP13-02 | Không phải org owner | 403 |
| TP13-03 | confirm_name không khớp | 422 |
| TP13-04 | Còn đơn hàng đang mở | 409 |
| TP13-05 | Sau xoá: cache bị DEL | ✓ |
| TP13-06 | Sau xoá: tất cả members is_active=0 | ✓ |