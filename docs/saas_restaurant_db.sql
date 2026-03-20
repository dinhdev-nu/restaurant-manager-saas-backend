-- ============================================================
--  SaaS Multi-Restaurant Management Platform
--  Database Schema — MySQL 8.0+  (Production-Grade)
--  Version : 1.2.0
--  Encoding: utf8mb4 / utf8mb4_unicode_ci
--  Changes  :
--    v1.1.0 + system_role, + ip_address on resets,
--             + remember_me on sessions, - oauth token fields
--    v1.2.0 - two_factor_secret (TOTP → OTP Email 2FA, secret không cần lưu DB)
--             two_factor_enabled giữ nguyên — chỉ là on/off flag
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS saas_restaurant
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE saas_restaurant;


-- ============================================================
--  SECTION 1 — AUTH & USER MANAGEMENT
-- ============================================================

CREATE TABLE users (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    email               VARCHAR(255)    NOT NULL,
    phone               VARCHAR(20)     NULL,
    password_hash       VARCHAR(255)    NULL                            COMMENT 'NULL nếu chỉ dùng OAuth',
    full_name           VARCHAR(150)    NOT NULL,
    avatar_url          TEXT            NULL,
    date_of_birth       DATE            NULL,
    gender              ENUM('male','female','other') NULL,

    -- [FIX v1.1] Platform-level role
    -- superadmin : team vận hành, toàn quyền hệ thống
    -- user       : người dùng thông thường (chủ nhà hàng, khách đặt online)
    -- guest      : không lưu DB — xử lý ở middleware
    system_role         ENUM('admin','user') NOT NULL DEFAULT 'user',

    status              ENUM('active','inactive','banned','pending') NOT NULL DEFAULT 'active',
    email_verified_at   DATETIME        NULL,
    phone_verified_at   DATETIME        NULL,
    last_login_at       DATETIME        NULL,
    last_login_ip       VARCHAR(45)     NULL                            COMMENT 'IPv4 or IPv6',

    -- [v1.2.0] two_factor_secret đã bị xoá.
    -- 2FA chuyển từ TOTP (Google Authenticator) sang OTP Email.
    -- OTP được sinh runtime và lưu tạm trong Redis (otp:2fa:{temp_token} TTL 300s).
    -- Không cần lưu secret dài hạn trong DB.
    two_factor_enabled  TINYINT(1)      NOT NULL DEFAULT 0              COMMENT '0 = tắt, 1 = bật — OTP sẽ gửi qua email khi đăng nhập',

    preferences         JSON            NULL                            COMMENT '{"language":"vi","theme":"dark","notifications":{}}',
    metadata            JSON            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        NULL                            COMMENT 'Soft delete',

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email   (email),
    KEY idx_users_phone         (phone),
    KEY idx_users_status        (status),
    KEY idx_users_system_role   (system_role),
    KEY idx_users_deleted       (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Platform user accounts — chủ nhà hàng, nhân viên, khách đặt online';


-- ------------------------------------------------------------

CREATE TABLE user_sessions (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    user_id         CHAR(36)        NOT NULL,
    token_hash      VARCHAR(255)    NOT NULL                COMMENT 'SHA-256 của refresh token — không lưu token gốc',
    device_info     JSON            NULL                    COMMENT '{"browser":"Chrome 120","os":"macOS","device":"Desktop"}',
    ip_address      VARCHAR(45)     NULL,
    expires_at      DATETIME        NOT NULL,
    is_revoked      TINYINT(1)      NOT NULL DEFAULT 0,

    -- [FIX v1.1] Phân biệt TTL: remember_me=0 hết hạn 24h, remember_me=1 hết hạn 30 ngày
    remember_me     TINYINT(1)      NOT NULL DEFAULT 0,

    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_session_token (token_hash),
    KEY idx_session_user        (user_id),
    KEY idx_session_expires     (expires_at),
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Refresh token sessions — cho phép revoke thực sự dù dùng JWT stateless';

-- ------------------------------------------------------------

CREATE TABLE oauth_providers (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    user_id             CHAR(36)        NOT NULL,
    provider            ENUM('google','facebook','apple','zalo') NOT NULL,

    -- ID của user bên phía provider — dùng để nhận ra lần đăng nhập sau
    provider_user_id    VARCHAR(255)    NOT NULL,

    -- [FIX v1.1] Bỏ access_token / refresh_token / token_expires_at
    -- Platform không cần gọi API của Google/Facebook sau khi login
    -- Flow: OAuth callback → lấy profile 1 lần → tạo session qua user_sessions → xong
    -- Nếu sau này cần tích hợp sâu → tách bảng oauth_integrations riêng

    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_oauth_provider_uid    (provider, provider_user_id),
    KEY idx_oauth_user                  (user_id),
    CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='OAuth social login — chỉ lưu định danh, không lưu token của provider';


-- ============================================================
--  SECTION 2 — ORGANIZATION & RESTAURANT MANAGEMENT
-- ============================================================

CREATE TABLE organizations (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    owner_id            CHAR(36)        NOT NULL,
    name                VARCHAR(200)    NOT NULL,
    slug                VARCHAR(100)    NOT NULL,
    logo_url            TEXT            NULL,
    plan                ENUM('free','starter','pro','enterprise') NOT NULL DEFAULT 'free',
    plan_expires_at     DATETIME        NULL,
    max_restaurants     SMALLINT        NOT NULL DEFAULT 1,
    max_staff           SMALLINT        NOT NULL DEFAULT 5,
    billing_email       VARCHAR(255)    NULL,
    tax_code            VARCHAR(50)     NULL                    COMMENT 'Mã số thuế doanh nghiệp',
    settings            JSON            NOT NULL DEFAULT ('{}'),
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_org_slug  (slug),
    KEY idx_org_owner       (owner_id),
    KEY idx_org_deleted     (deleted_at),
    CONSTRAINT fk_org_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tenant root — 1 org sở hữu nhiều nhà hàng';


-- ------------------------------------------------------------

CREATE TABLE restaurants (
    id                      CHAR(36)        NOT NULL DEFAULT (UUID()),
    organization_id         CHAR(36)        NOT NULL,
    name                    VARCHAR(200)    NOT NULL,
    slug                    VARCHAR(100)    NOT NULL,
    description             TEXT            NULL,
    cuisine_type            VARCHAR(100)    NULL,
    price_range             TINYINT         NULL                COMMENT '1–4 tương ứng $ $$ $$$ $$$$',
    logo_url                TEXT            NULL,
    cover_image_url         TEXT            NULL,
    gallery_urls            JSON            NULL,
    address                 TEXT            NOT NULL,
    city                    VARCHAR(100)    NOT NULL,
    district                VARCHAR(100)    NULL,
    ward                    VARCHAR(100)    NULL,
    latitude                DECIMAL(10,8)   NULL,
    longitude               DECIMAL(11,8)   NULL,
    phone                   VARCHAR(20)     NULL,
    email                   VARCHAR(255)    NULL,
    website                 VARCHAR(255)    NULL,
    operating_hours         JSON            NOT NULL DEFAULT ('{}') COMMENT '{"mon":{"open":"08:00","close":"22:00"},...}',
    timezone                VARCHAR(50)     NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    currency                CHAR(3)         NOT NULL DEFAULT 'VND',
    tax_rate                DECIMAL(5,4)    NOT NULL DEFAULT 0.1000,
    service_charge_rate     DECIMAL(5,4)    NOT NULL DEFAULT 0.0000,
    is_published            TINYINT(1)      NOT NULL DEFAULT 0,
    accepts_online_orders   TINYINT(1)      NOT NULL DEFAULT 1,
    accepts_reservations    TINYINT(1)      NOT NULL DEFAULT 1,
    average_rating          DECIMAL(3,2)    NULL,
    total_reviews           INT             NOT NULL DEFAULT 0,
    settings                JSON            NOT NULL DEFAULT ('{}'),
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at              DATETIME        NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_restaurant_slug       (organization_id, slug),
    KEY idx_restaurant_org              (organization_id),
    KEY idx_restaurant_city             (city),
    KEY idx_restaurant_published        (is_published, deleted_at),
    KEY idx_restaurant_location         (latitude, longitude),
    CONSTRAINT fk_restaurant_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE restaurant_members (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NOT NULL,
    user_id         CHAR(36)        NOT NULL,
    role            ENUM('owner','manager','cashier','waiter','kitchen','delivery') NOT NULL,
    invited_by      CHAR(36)        NULL,
    joined_at       DATETIME        NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_member_restaurant_user    (restaurant_id, user_id),
    KEY idx_member_user                     (user_id),
    CONSTRAINT fk_member_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_member_user       FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_member_inviter    FOREIGN KEY (invited_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 3 — MENU MANAGEMENT
-- ============================================================

CREATE TABLE menu_categories (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NOT NULL,
    parent_id       CHAR(36)        NULL                        COMMENT 'Self-ref cho sub-category',
    name            VARCHAR(150)    NOT NULL,
    name_en         VARCHAR(150)    NULL,
    description     TEXT            NULL,
    image_url       TEXT            NULL,
    sort_order      SMALLINT        NOT NULL DEFAULT 0,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    available_from  TIME            NULL,
    available_to    TIME            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_category_restaurant (restaurant_id, sort_order),
    KEY idx_category_parent     (parent_id),
    CONSTRAINT fk_category_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_category_parent     FOREIGN KEY (parent_id)     REFERENCES menu_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE menu_items (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    category_id         CHAR(36)        NOT NULL,
    sku                 VARCHAR(50)     NULL,
    name                VARCHAR(200)    NOT NULL,
    name_en             VARCHAR(200)    NULL,
    description         TEXT            NULL,
    base_price          DECIMAL(15,2)   NOT NULL,
    cost_price          DECIMAL(15,2)   NULL                    COMMENT 'Nội bộ — không expose ra ngoài',
    compare_price       DECIMAL(15,2)   NULL                    COMMENT 'Giá gạch ngang hiển thị',
    images              JSON            NOT NULL DEFAULT ('[]'),
    item_type           ENUM('single','combo','variant') NOT NULL DEFAULT 'single',
    is_available        TINYINT(1)      NOT NULL DEFAULT 1,
    is_featured         TINYINT(1)      NOT NULL DEFAULT 0,
    is_new              TINYINT(1)      NOT NULL DEFAULT 0,
    is_best_seller      TINYINT(1)      NOT NULL DEFAULT 0,
    calories            INT             NULL,
    allergens           JSON            NULL,
    dietary_flags       JSON            NULL                    COMMENT '["vegetarian","vegan","gluten_free"]',
    prep_time_minutes   SMALLINT        NULL,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    tags                JSON            NULL,
    metadata            JSON            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        NULL,

    PRIMARY KEY (id),
    KEY idx_item_restaurant     (restaurant_id, category_id),
    KEY idx_item_available      (restaurant_id, is_available, deleted_at),
    KEY idx_item_featured       (restaurant_id, is_featured),
    KEY idx_item_sku            (restaurant_id, sku),
    FULLTEXT KEY ft_item_search (name, description),
    CONSTRAINT fk_item_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_category   FOREIGN KEY (category_id)   REFERENCES menu_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE item_variants (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    item_id         CHAR(36)        NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    sku             VARCHAR(50)     NULL,
    price           DECIMAL(15,2)   NOT NULL,
    cost_price      DECIMAL(15,2)   NULL,
    sort_order      SMALLINT        NOT NULL DEFAULT 0,
    is_default      TINYINT(1)      NOT NULL DEFAULT 0,
    is_available    TINYINT(1)      NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    KEY idx_variant_item (item_id),
    CONSTRAINT fk_variant_item FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE modifier_groups (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NOT NULL,
    name            VARCHAR(150)    NOT NULL,
    description     TEXT            NULL,
    selection_type  ENUM('single','multiple') NOT NULL DEFAULT 'single',
    min_selections  TINYINT         NOT NULL DEFAULT 0,
    max_selections  TINYINT         NOT NULL DEFAULT 1,
    is_required     TINYINT(1)      NOT NULL DEFAULT 0,
    sort_order      SMALLINT        NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_modgroup_restaurant (restaurant_id),
    CONSTRAINT fk_modgroup_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE modifier_options (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    modifier_group_id   CHAR(36)        NOT NULL,
    name                VARCHAR(100)    NOT NULL,
    price_adjustment    DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    is_default          TINYINT(1)      NOT NULL DEFAULT 0,
    is_available        TINYINT(1)      NOT NULL DEFAULT 1,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_modoption_group (modifier_group_id),
    CONSTRAINT fk_modoption_group FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE item_modifier_groups (
    item_id             CHAR(36)    NOT NULL,
    modifier_group_id   CHAR(36)    NOT NULL,
    sort_order          SMALLINT    NOT NULL DEFAULT 0,

    PRIMARY KEY (item_id, modifier_group_id),
    CONSTRAINT fk_img_item  FOREIGN KEY (item_id)           REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_img_group FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 4 — TABLE MANAGEMENT
-- ============================================================

CREATE TABLE table_sections (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    description     TEXT            NULL,
    floor_plan      JSON            NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    sort_order      SMALLINT        NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_section_restaurant (restaurant_id),
    CONSTRAINT fk_section_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE `tables` (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NOT NULL,
    section_id      CHAR(36)        NOT NULL,
    table_number    VARCHAR(20)     NOT NULL,
    name            VARCHAR(50)     NULL,
    capacity        TINYINT         NOT NULL,
    shape           ENUM('rectangle','circle','square') NULL DEFAULT 'rectangle',
    status          ENUM('available','occupied','reserved','cleaning','inactive') NOT NULL DEFAULT 'available',
    qr_code         VARCHAR(255)    NULL,
    qr_image_url    TEXT            NULL,
    position_x      INT             NULL,
    position_y      INT             NULL,
    notes           TEXT            NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_table_number  (restaurant_id, table_number),
    UNIQUE KEY uq_table_qr      (qr_code),
    KEY idx_table_section       (section_id),
    KEY idx_table_status        (restaurant_id, status),
    CONSTRAINT fk_table_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_section    FOREIGN KEY (section_id)    REFERENCES table_sections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 5 — STAFF MANAGEMENT
-- ============================================================

CREATE TABLE staff (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    user_id             CHAR(36)        NULL,
    employee_code       VARCHAR(30)     NOT NULL,
    full_name           VARCHAR(150)    NOT NULL,
    phone               VARCHAR(20)     NULL,
    email               VARCHAR(255)    NULL,
    position            VARCHAR(50)     NOT NULL,
    department          VARCHAR(50)     NULL,
    hire_date           DATE            NOT NULL,
    termination_date    DATE            NULL,
    hourly_rate         DECIMAL(15,2)   NULL,
    monthly_salary      DECIMAL(15,2)   NULL,
    id_card_number      VARCHAR(20)     NULL                    COMMENT 'CCCD/CMT — encrypted',
    avatar_url          TEXT            NULL,
    emergency_contact   JSON            NULL,
    status              ENUM('active','inactive','on_leave','terminated') NOT NULL DEFAULT 'active',
    pin_code            VARCHAR(64)     NULL                    COMMENT 'Hashed 6-digit PIN đăng nhập POS',
    permissions         JSON            NOT NULL DEFAULT ('{}'),
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_staff_code    (restaurant_id, employee_code),
    KEY idx_staff_restaurant    (restaurant_id, status),
    KEY idx_staff_user          (user_id),
    KEY idx_staff_deleted       (deleted_at),
    CONSTRAINT fk_staff_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_user       FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE staff_shifts (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    staff_id            CHAR(36)        NOT NULL,
    shift_date          DATE            NOT NULL,
    scheduled_start     DATETIME        NOT NULL,
    scheduled_end       DATETIME        NOT NULL,
    actual_start        DATETIME        NULL,
    actual_end          DATETIME        NULL,
    break_minutes       SMALLINT        NOT NULL DEFAULT 0,
    shift_type          ENUM('regular','overtime','on_call') NOT NULL DEFAULT 'regular',
    status              ENUM('scheduled','present','absent','late') NOT NULL DEFAULT 'scheduled',
    notes               TEXT            NULL,
    approved_by         CHAR(36)        NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_shift_staff         (staff_id, shift_date),
    KEY idx_shift_restaurant    (restaurant_id, shift_date),
    CONSTRAINT fk_shift_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_shift_staff      FOREIGN KEY (staff_id)      REFERENCES staff(id) ON DELETE CASCADE,
    CONSTRAINT fk_shift_approver   FOREIGN KEY (approved_by)   REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 6 — CUSTOMER MANAGEMENT
-- ============================================================

CREATE TABLE customers (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    user_id             CHAR(36)        NULL                    COMMENT 'Liên kết account nếu có',
    full_name           VARCHAR(150)    NOT NULL,
    phone               VARCHAR(20)     NULL,
    email               VARCHAR(255)    NULL,
    date_of_birth       DATE            NULL,
    gender              ENUM('male','female','other') NULL,
    avatar_url          TEXT            NULL,
    loyalty_points      INT             NOT NULL DEFAULT 0,
    total_orders        INT             NOT NULL DEFAULT 0,
    total_spent         DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    last_order_at       DATETIME        NULL,
    notes               TEXT            NULL,
    tags                JSON            NULL,
    metadata            JSON            NULL,
    is_blocked          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_customer_restaurant (restaurant_id),
    KEY idx_customer_phone      (restaurant_id, phone),
    KEY idx_customer_email      (restaurant_id, email),
    KEY idx_customer_user       (user_id),
    CONSTRAINT fk_customer_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_user       FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE customer_addresses (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    customer_id     CHAR(36)        NOT NULL,
    label           VARCHAR(50)     NULL                    COMMENT 'Nhà, Cơ quan...',
    full_address    TEXT            NOT NULL,
    district        VARCHAR(100)    NULL,
    city            VARCHAR(100)    NULL,
    latitude        DECIMAL(10,8)   NULL,
    longitude       DECIMAL(11,8)   NULL,
    is_default      TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_addr_customer (customer_id),
    CONSTRAINT fk_addr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE loyalty_point_logs (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    customer_id     CHAR(36)        NOT NULL,
    restaurant_id   CHAR(36)        NOT NULL,
    order_id        CHAR(36)        NULL,
    type            ENUM('earn','redeem','expire','adjust','bonus') NOT NULL,
    points          INT             NOT NULL                COMMENT 'Dương = tích, âm = tiêu',
    balance_after   INT             NOT NULL,
    note            VARCHAR(255)    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_loyalty_customer (customer_id, created_at DESC),
    CONSTRAINT fk_loyalty_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE reservations (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    table_id            CHAR(36)        NULL,
    customer_id         CHAR(36)        NULL,
    customer_name       VARCHAR(150)    NOT NULL,
    customer_phone      VARCHAR(20)     NOT NULL,
    party_size          TINYINT         NOT NULL,
    reserved_at         DATETIME        NOT NULL,
    duration_minutes    SMALLINT        NOT NULL DEFAULT 90,
    status              ENUM('pending','confirmed','seated','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
    deposit_amount      DECIMAL(15,2)   NULL,
    special_requests    TEXT            NULL,
    notes               TEXT            NULL,
    confirmed_by        CHAR(36)        NULL,
    source              ENUM('website','app','phone','walk_in','third_party') NOT NULL DEFAULT 'website',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_reservation_restaurant  (restaurant_id, reserved_at),
    KEY idx_reservation_table       (table_id, reserved_at),
    KEY idx_reservation_customer    (customer_id),
    KEY idx_reservation_status      (restaurant_id, status),
    CONSTRAINT fk_reservation_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    CONSTRAINT fk_reservation_table      FOREIGN KEY (table_id)      REFERENCES `tables`(id) ON DELETE SET NULL,
    CONSTRAINT fk_reservation_customer   FOREIGN KEY (customer_id)   REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_reservation_confirmer  FOREIGN KEY (confirmed_by)  REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 7 — ORDER MANAGEMENT
-- ============================================================

CREATE TABLE orders (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_number        VARCHAR(30)     NOT NULL,
    restaurant_id       CHAR(36)        NOT NULL,
    table_id            CHAR(36)        NULL,
    customer_id         CHAR(36)        NULL,
    staff_id            CHAR(36)        NULL,
    reservation_id      CHAR(36)        NULL,
    order_type          ENUM('dine_in','takeaway','delivery','online') NOT NULL,
    status              ENUM('pending','confirmed','preparing','ready','delivering','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
    payment_status      ENUM('unpaid','partial','paid','refunded') NOT NULL DEFAULT 'unpaid',
    subtotal            DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    discount_amount     DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    tax_amount          DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    service_charge      DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    delivery_fee        DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    tip_amount          DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_amount        DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    currency            CHAR(3)         NOT NULL DEFAULT 'VND',
    notes               TEXT            NULL,
    kitchen_notes       TEXT            NULL,
    delivery_address    JSON            NULL,
    delivery_at         DATETIME        NULL,
    completed_at        DATETIME        NULL,
    cancelled_at        DATETIME        NULL,
    cancel_reason       TEXT            NULL,
    source              ENUM('pos','online','qr','app','phone') NOT NULL DEFAULT 'pos',
    metadata            JSON            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_order_number      (restaurant_id, order_number),
    KEY idx_order_restaurant_date   (restaurant_id, created_at),
    KEY idx_order_status            (restaurant_id, status),
    KEY idx_order_payment_status    (restaurant_id, payment_status),
    KEY idx_order_table             (table_id),
    KEY idx_order_customer          (customer_id),
    KEY idx_order_staff             (staff_id),
    KEY idx_order_type_date         (restaurant_id, order_type, created_at),
    CONSTRAINT fk_order_restaurant  FOREIGN KEY (restaurant_id)  REFERENCES restaurants(id),
    CONSTRAINT fk_order_table       FOREIGN KEY (table_id)       REFERENCES `tables`(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_customer    FOREIGN KEY (customer_id)    REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_staff       FOREIGN KEY (staff_id)       REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE order_items (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_id        CHAR(36)        NOT NULL,
    menu_item_id    CHAR(36)        NOT NULL,
    variant_id      CHAR(36)        NULL,
    item_name       VARCHAR(200)    NOT NULL    COMMENT 'Snapshot tên món lúc đặt',
    variant_name    VARCHAR(100)    NULL        COMMENT 'Snapshot tên variant',
    quantity        SMALLINT        NOT NULL,
    unit_price      DECIMAL(15,2)   NOT NULL    COMMENT 'Snapshot giá lúc đặt',
    discount_amount DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_price     DECIMAL(15,2)   NOT NULL,
    status          ENUM('pending','preparing','ready','served','cancelled') NOT NULL DEFAULT 'pending',
    notes           TEXT            NULL,
    course          TINYINT         NOT NULL DEFAULT 1,
    served_at       DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_oitem_order     (order_id),
    KEY idx_oitem_menu_item (menu_item_id),
    KEY idx_oitem_status    (order_id, status),
    CONSTRAINT fk_oitem_order    FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_oitem_menuitem FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    CONSTRAINT fk_oitem_variant  FOREIGN KEY (variant_id)   REFERENCES item_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE order_item_modifiers (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_item_id       CHAR(36)        NOT NULL,
    modifier_option_id  CHAR(36)        NOT NULL,
    option_name         VARCHAR(100)    NOT NULL    COMMENT 'Snapshot',
    price_adjustment    DECIMAL(15,2)   NOT NULL DEFAULT 0.00 COMMENT 'Snapshot',
    quantity            SMALLINT        NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    KEY idx_oimod_order_item (order_item_id),
    CONSTRAINT fk_oimod_order_item FOREIGN KEY (order_item_id)      REFERENCES order_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_oimod_option     FOREIGN KEY (modifier_option_id) REFERENCES modifier_options(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE order_status_logs (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_id        CHAR(36)        NOT NULL,
    from_status     VARCHAR(30)     NULL,
    to_status       VARCHAR(30)     NOT NULL,
    changed_by      CHAR(36)        NULL,
    changer_type    ENUM('staff','user','system') NOT NULL DEFAULT 'staff',
    reason          TEXT            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_statuslog_order (order_id, created_at),
    CONSTRAINT fk_statuslog_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 8 — PAYMENT MANAGEMENT
-- ============================================================

CREATE TABLE payments (
    id                      CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_id                CHAR(36)        NOT NULL,
    restaurant_id           CHAR(36)        NOT NULL,
    payment_number          VARCHAR(30)     NOT NULL,
    amount                  DECIMAL(15,2)   NOT NULL,
    currency                CHAR(3)         NOT NULL DEFAULT 'VND',
    method                  ENUM('cash','credit_card','debit_card','momo','zalopay','vnpay','shopeepay','banking_transfer','qr_code','loyalty_points') NOT NULL,
    status                  ENUM('pending','completed','failed','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
    reference_number        VARCHAR(100)    NULL,
    transaction_id          VARCHAR(255)    NULL,
    gateway_response        JSON            NULL,
    change_amount           DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    tip_amount              DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    loyalty_points_used     INT             NOT NULL DEFAULT 0,
    processed_by            CHAR(36)        NULL,
    processed_at            DATETIME        NULL,
    failed_reason           TEXT            NULL,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_number    (restaurant_id, payment_number),
    KEY idx_payment_order           (order_id),
    KEY idx_payment_status          (restaurant_id, status),
    KEY idx_payment_method          (restaurant_id, method),
    KEY idx_payment_date            (restaurant_id, created_at),
    CONSTRAINT fk_payment_order      FOREIGN KEY (order_id)      REFERENCES orders(id),
    CONSTRAINT fk_payment_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    CONSTRAINT fk_payment_staff      FOREIGN KEY (processed_by)  REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE payment_refunds (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    payment_id      CHAR(36)        NOT NULL,
    amount          DECIMAL(15,2)   NOT NULL,
    reason          TEXT            NOT NULL,
    status          ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
    transaction_id  VARCHAR(255)    NULL,
    processed_by    CHAR(36)        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_refund_payment (payment_id),
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE invoices (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_id            CHAR(36)        NOT NULL,
    restaurant_id       CHAR(36)        NOT NULL,
    invoice_number      VARCHAR(30)     NOT NULL,
    invoice_date        DATE            NOT NULL,
    customer_name       VARCHAR(150)    NULL,
    customer_tax        VARCHAR(20)     NULL,
    customer_address    TEXT            NULL,
    subtotal            DECIMAL(15,2)   NOT NULL,
    tax_amount          DECIMAL(15,2)   NOT NULL,
    total_amount        DECIMAL(15,2)   NOT NULL,
    pdf_url             TEXT            NULL,
    is_printed          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_invoice_number    (restaurant_id, invoice_number),
    KEY idx_invoice_order           (order_id),
    KEY idx_invoice_date            (restaurant_id, invoice_date),
    CONSTRAINT fk_invoice_order      FOREIGN KEY (order_id)      REFERENCES orders(id),
    CONSTRAINT fk_invoice_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE discounts (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    code                VARCHAR(50)     NULL,
    name                VARCHAR(150)    NOT NULL,
    type                ENUM('percentage','fixed','free_item','bogo','free_delivery') NOT NULL,
    value               DECIMAL(15,2)   NOT NULL,
    min_order_amount    DECIMAL(15,2)   NULL,
    max_discount_amount DECIMAL(15,2)   NULL,
    max_uses            INT             NULL,
    max_uses_per_user   TINYINT         NULL,
    used_count          INT             NOT NULL DEFAULT 0,
    applies_to          ENUM('all','category','item') NOT NULL DEFAULT 'all',
    applicable_ids      JSON            NULL,
    valid_from          DATETIME        NOT NULL,
    valid_until         DATETIME        NULL,
    is_active           TINYINT(1)      NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_discount_code     (restaurant_id, code),
    KEY idx_discount_active         (restaurant_id, is_active, valid_from, valid_until),
    CONSTRAINT fk_discount_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE order_discounts (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    order_id        CHAR(36)        NOT NULL,
    discount_id     CHAR(36)        NULL,
    code_used       VARCHAR(50)     NULL,
    discount_name   VARCHAR(150)    NOT NULL,
    discount_type   VARCHAR(20)     NOT NULL,
    discount_value  DECIMAL(15,2)   NOT NULL,
    amount_saved    DECIMAL(15,2)   NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_orderdiscount_order (order_id),
    CONSTRAINT fk_orderdiscount_order    FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_orderdiscount_discount FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 9 — ANALYTICS & REPORTING
-- ============================================================

CREATE TABLE daily_revenue_snapshots (
    id                      CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id           CHAR(36)        NOT NULL,
    snapshot_date           DATE            NOT NULL,
    total_orders            INT             NOT NULL DEFAULT 0,
    completed_orders        INT             NOT NULL DEFAULT 0,
    cancelled_orders        INT             NOT NULL DEFAULT 0,
    gross_revenue           DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    net_revenue             DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    tax_collected           DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    discount_total          DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    delivery_fee_total      DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    tip_total               DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    avg_order_value         DECIMAL(15,2)   NULL,
    revenue_by_type         JSON            NOT NULL DEFAULT ('{}'),
    revenue_by_payment      JSON            NOT NULL DEFAULT ('{}'),
    top_selling_items       JSON            NULL,
    hourly_breakdown        JSON            NULL,
    new_customers           INT             NOT NULL DEFAULT 0,
    returning_customers     INT             NOT NULL DEFAULT 0,
    avg_table_turnover      DECIMAL(5,2)    NULL,
    staff_count             TINYINT         NOT NULL DEFAULT 0,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_snapshot_restaurant_date  (restaurant_id, snapshot_date),
    KEY idx_snapshot_date                   (restaurant_id, snapshot_date DESC),
    CONSTRAINT fk_snapshot_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE reviews (
    id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id       CHAR(36)        NOT NULL,
    order_id            CHAR(36)        NULL,
    customer_id         CHAR(36)        NULL,
    user_id             CHAR(36)        NULL,
    rating              TINYINT         NOT NULL,
    food_rating         TINYINT         NULL,
    service_rating      TINYINT         NULL,
    ambiance_rating     TINYINT         NULL,
    comment             TEXT            NULL,
    images              JSON            NULL,
    reply               TEXT            NULL,
    replied_at          DATETIME        NULL,
    replied_by          CHAR(36)        NULL,
    is_published        TINYINT(1)      NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_review_restaurant   (restaurant_id, is_published, created_at DESC),
    KEY idx_review_customer     (customer_id),
    KEY idx_review_order        (order_id),
    CONSTRAINT fk_review_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    CONSTRAINT fk_review_order      FOREIGN KEY (order_id)      REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_review_customer   FOREIGN KEY (customer_id)   REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_review_user       FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_review_rating    CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 10 — NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NULL,
    recipient_type  ENUM('user','customer','staff') NOT NULL,
    recipient_id    CHAR(36)        NOT NULL,
    type            VARCHAR(50)     NOT NULL,
    title           VARCHAR(200)    NOT NULL,
    body            TEXT            NOT NULL,
    data            JSON            NULL,
    channel         ENUM('push','email','sms','in_app') NOT NULL,
    is_read         TINYINT(1)      NOT NULL DEFAULT 0,
    read_at         DATETIME        NULL,
    sent_at         DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_notif_recipient     (recipient_type, recipient_id, is_read, created_at DESC),
    KEY idx_notif_restaurant    (restaurant_id),
    CONSTRAINT fk_notif_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SECTION 11 — SYSTEM TABLES
-- ============================================================

CREATE TABLE audit_logs (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NULL,
    actor_type      ENUM('user','staff','system','api') NOT NULL,
    actor_id        CHAR(36)        NULL,
    action          VARCHAR(100)    NOT NULL,
    resource_type   VARCHAR(50)     NOT NULL,
    resource_id     CHAR(36)        NULL,
    old_values      JSON            NULL,
    new_values      JSON            NULL,
    ip_address      VARCHAR(45)     NULL,
    user_agent      TEXT            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_audit_restaurant    (restaurant_id, created_at DESC),
    KEY idx_audit_actor         (actor_type, actor_id),
    KEY idx_audit_resource      (resource_type, resource_id),
    KEY idx_audit_action        (action, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Immutable — không UPDATE hay DELETE';


-- ------------------------------------------------------------

CREATE TABLE file_uploads (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    uploader_id     CHAR(36)        NOT NULL,
    restaurant_id   CHAR(36)        NULL,
    original_name   VARCHAR(255)    NOT NULL,
    storage_path    TEXT            NOT NULL,
    cdn_url         TEXT            NOT NULL,
    mime_type       VARCHAR(100)    NOT NULL,
    size_bytes      BIGINT          NOT NULL,
    entity_type     VARCHAR(50)     NULL,
    entity_id       CHAR(36)        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_upload_uploader     (uploader_id),
    KEY idx_upload_restaurant   (restaurant_id),
    KEY idx_upload_entity       (entity_type, entity_id),
    CONSTRAINT fk_upload_uploader   FOREIGN KEY (uploader_id)   REFERENCES users(id),
    CONSTRAINT fk_upload_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------

CREATE TABLE system_settings (
    id              CHAR(36)        NOT NULL DEFAULT (UUID()),
    restaurant_id   CHAR(36)        NULL,
    `key`           VARCHAR(100)    NOT NULL,
    `value`         JSON            NOT NULL,
    description     VARCHAR(255)    NULL,
    is_public       TINYINT(1)      NOT NULL DEFAULT 0,
    updated_by      CHAR(36)        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_setting_key (restaurant_id, `key`),
    CONSTRAINT fk_setting_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
--  v1.2.0 — 36 tables
--
--  Migration từ v1.1.0 lên v1.2.0 (nếu DB đã tồn tại):
--  ALTER TABLE users DROP COLUMN two_factor_secret;
-- ============================================================