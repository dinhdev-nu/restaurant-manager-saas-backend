

## Project Structure
```bash
src/
├── modules/                # Tập hợp các module theo domain (Domain-driven)
│   ├── user/               # Module user (theo domain nghiệp vụ)
│   │   ├── controllers/    # Controllers (route handler)
│   │   ├── services/       # Business logic
│   │   ├── repositories/   # Logic truy cập database
│   │   ├── dtos/           # Data Transfer Objects (validate đầu vào)
│   │   ├── entities/       # Định nghĩa Entity / ORM models
│   │   └── user.module.ts  # Module khai báo provider/controller
│   └── auth/
│       ├── strategies/
│       └── guards/
│       └── auth.module.ts
│
├── common/                 # Mã dùng chung toàn app
│   ├── constants/
│   ├── filters/            # Exception filters
│   ├── interceptors/
│   ├── middleware/
│   └── utils/
│
├── config/                 # Load config từ env
│   ├── config.module.ts
│   └── config.service.ts
│
├── database/               # Thiết lập kết nối DB, migration, seed
│   └── prisma/             # (hoặc typeorm, mongoose tùy ORM)
│
├── main.ts                 # Điểm khởi động ứng dụng
└── app.module.ts           # Gốc của app, import các module con
```


## System Architecture
```bash
Client (Web/App)
     ↓ REST API
Backend Service (NestJS monolith)
     ↳ Auth Service
     ↳ Order Service
     ↳ Menu Service
     ↳ Table Service
     ↳ Staff Management
     ↳ Inventory/Warehouse Service
     ↳ Report Service
     ↓
 Database (MongoDB)
     ↳ Redis (for caching)
     ↳ Kafka (for event streaming)
     ↳ Elasticsearch (for search)
```
