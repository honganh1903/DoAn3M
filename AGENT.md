# AGENT.md — Backend Quản Lý Nhân Sự Công Ty Bảo Vệ

## Mục tiêu dự án

Xây dựng backend đơn giản cho ứng dụng **quản lý nhân sự công ty bảo vệ** bằng **Node.js + SQLite**. Đây là đồ án học tập, ưu tiên code đơn giản, dễ hiểu, dễ chạy, không cần cài đặt phức tạp.

---

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js (v18+) |
| Framework | Express.js |
| Database | SQLite (file `.db`, không cần cài server) |
| ORM / Query | `better-sqlite3` (đồng bộ, đơn giản) |
| Xác thực | JWT (`jsonwebtoken`) |
| Mã hóa mật khẩu | `bcryptjs` |
| Biến môi trường | `dotenv` |

> **Không dùng:** TypeScript, ORM phức tạp (Sequelize/Prisma), Redis, Docker, microservices, message queue.

---

## Cấu trúc thư mục

```
project/
├── src/
│   ├── config/
│   │   └── db.js              # Kết nối SQLite và tạo bảng
│   ├── middleware/
│   │   └── auth.js            # Xác thực JWT, phân quyền role
│   ├── routes/
│   │   ├── auth.routes.js     # Đăng nhập / đăng xuất
│   │   ├── employee.routes.js # Quản lý nhân viên
│   │   ├── salary.routes.js   # Quản lý lương
│   │   ├── shift.routes.js    # Quản lý ca trực
│   │   └── user.routes.js     # Quản lý tài khoản (admin)
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── employee.controller.js
│   │   ├── salary.controller.js
│   │   ├── shift.controller.js
│   │   └── user.controller.js
│   └── app.js                 # Khởi tạo Express, gắn routes
├── database.db                # File SQLite (tự tạo khi chạy lần đầu)
├── seed.js                    # Tạo dữ liệu mẫu ban đầu
├── .env                       # Biến môi trường
├── package.json
└── server.js                  # Entry point
```

---

## Tác nhân (Roles)

| Role | Mô tả |
|---|---|
| `admin` | Toàn quyền: quản lý nhân viên, lương, ca trực, tài khoản |
| `employee` | Xem thông tin cá nhân, xem lương của mình, xem lịch ca |
| `user` | Tài khoản xem thông tin cơ bản, không chỉnh sửa |

---

## Cơ sở dữ liệu (SQLite)

### Bảng `accounts` — Tài khoản đăng nhập

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,          -- bcrypt hash
  role       TEXT NOT NULL DEFAULT 'user', -- 'admin' | 'employee' | 'user'
  employee_id INTEGER,               -- liên kết với bảng employees (nullable)
  created_at TEXT DEFAULT (datetime('now')),
  is_active  INTEGER DEFAULT 1       -- 1: active, 0: disabled
);
```

### Bảng `employees` — Thông tin nhân viên

```sql
CREATE TABLE IF NOT EXISTS employees (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name    TEXT NOT NULL,
  birth_date   TEXT,
  gender       TEXT,                 -- 'male' | 'female'
  id_card      TEXT UNIQUE,          -- CCCD/CMND
  phone        TEXT,
  address      TEXT,
  position     TEXT,                 -- Vị trí: 'Bảo vệ', 'Tổ trưởng', 'Giám sát'
  department   TEXT,                 -- Khu vực / địa điểm làm việc
  hire_date    TEXT,
  status       TEXT DEFAULT 'active', -- 'active' | 'resigned' | 'on_leave'
  created_at   TEXT DEFAULT (datetime('now'))
);
```

### Bảng `salaries` — Bảng lương

```sql
CREATE TABLE IF NOT EXISTS salaries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  month       TEXT NOT NULL,         -- 'YYYY-MM' VD: '2024-06'
  base_salary REAL DEFAULT 0,
  bonus       REAL DEFAULT 0,
  deduction   REAL DEFAULT 0,        -- Khấu trừ (đi muộn, nghỉ không phép,...)
  total       REAL,                  -- Tự tính: base + bonus - deduction
  note        TEXT,
  paid        INTEGER DEFAULT 0,     -- 0: chưa trả, 1: đã trả
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

### Bảng `shifts` — Ca trực

```sql
CREATE TABLE IF NOT EXISTS shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  shift_date  TEXT NOT NULL,         -- 'YYYY-MM-DD'
  shift_type  TEXT NOT NULL,         -- 'morning' | 'afternoon' | 'night'
  location    TEXT,                  -- Địa điểm trực
  note        TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

---

## API Endpoints

### Auth — `/api/auth`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Đăng nhập, trả về JWT |
| GET | `/api/auth/me` | Đã đăng nhập | Xem thông tin tài khoản hiện tại |
| POST | `/api/auth/change-password` | Đã đăng nhập | Đổi mật khẩu |

### Nhân viên — `/api/employees`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/employees` | admin | Danh sách nhân viên (hỗ trợ tìm kiếm, lọc) |
| GET | `/api/employees/:id` | admin, employee (chỉ xem của mình) | Chi tiết nhân viên |
| POST | `/api/employees` | admin | Thêm nhân viên mới |
| PUT | `/api/employees/:id` | admin | Cập nhật thông tin nhân viên |
| DELETE | `/api/employees/:id` | admin | Xóa nhân viên (soft delete: đổi status) |

**Query params cho GET /employees:** `?name=&position=&status=&department=`

### Lương — `/api/salaries`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/salaries` | admin | Xem tất cả bảng lương (lọc theo tháng, nhân viên) |
| GET | `/api/salaries/my` | employee | Xem lương của bản thân |
| GET | `/api/salaries/:id` | admin | Chi tiết một bản ghi lương |
| POST | `/api/salaries` | admin | Tạo bảng lương cho nhân viên |
| PUT | `/api/salaries/:id` | admin | Cập nhật bảng lương |
| PATCH | `/api/salaries/:id/pay` | admin | Đánh dấu đã thanh toán lương |
| DELETE | `/api/salaries/:id` | admin | Xóa bản ghi lương |

**Query params:** `?month=2024-06&employee_id=3`

### Ca trực — `/api/shifts`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/shifts` | admin | Xem tất cả ca trực |
| GET | `/api/shifts/my` | employee | Xem lịch ca của bản thân |
| POST | `/api/shifts` | admin | Tạo ca trực |
| PUT | `/api/shifts/:id` | admin | Cập nhật ca trực |
| DELETE | `/api/shifts/:id` | admin | Xóa ca trực |

**Query params:** `?employee_id=&date=&month=2024-06`

### Tài khoản — `/api/users`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/users` | admin | Danh sách tài khoản |
| POST | `/api/users` | admin | Tạo tài khoản mới |
| PUT | `/api/users/:id` | admin | Cập nhật tài khoản |
| PATCH | `/api/users/:id/reset-password` | admin | Đặt lại mật khẩu |
| DELETE | `/api/users/:id` | admin | Vô hiệu hóa tài khoản |

---

## Định dạng Response chuẩn

Tất cả các API đều trả về JSON theo cấu trúc:

```json
// Thành công
{
  "success": true,
  "data": { ... },
  "message": "Thao tác thành công"
}

// Thất bại
{
  "success": false,
  "message": "Mô tả lỗi"
}

// Danh sách có phân trang
{
  "success": true,
  "data": [ ... ],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

---

## Middleware

### `auth.js` — Xác thực và phân quyền

```js
// Sử dụng trong routes:
router.get('/employees', authenticate, authorize('admin'), ...)

// authenticate: kiểm tra JWT trong header Authorization: Bearer <token>
// authorize(role1, role2, ...): kiểm tra role của user
```

---

## File `.env`

```env
PORT=3000
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=7d
DB_PATH=./database.db
```

---

## File `package.json`

```json
{
  "name": "security-company-hr",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "seed": "node seed.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^9.4.3",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  }
}
```

---

## Dữ liệu mẫu (`seed.js`)

File `seed.js` khi chạy `node seed.js` sẽ tạo:

- 1 tài khoản **admin**: `username: admin`, `password: admin123`
- 3 nhân viên mẫu với tài khoản role `employee`
- Bảng lương tháng hiện tại cho các nhân viên
- Một số ca trực mẫu

---

## Hướng dẫn chạy dự án

```bash
# 1. Cài đặt
npm install

# 2. Tạo file .env (copy từ mẫu trên)

# 3. Tạo dữ liệu mẫu
node seed.js

# 4. Chạy server
npm run dev        # development
npm start          # production

# Server chạy tại: http://localhost:3000
```

---

## Quy tắc viết code

1. **Mỗi file controller chỉ xử lý 1 nhóm chức năng**, không trộn lẫn logic.
2. **Không dùng async/await phức tạp** — `better-sqlite3` là đồng bộ, dùng thẳng không cần Promise.
3. **Validate đơn giản** trong controller — kiểm tra trường bắt buộc trước khi query.
4. **Không cần transaction** trừ khi tạo nhân viên kèm tài khoản cùng lúc (dùng `db.transaction()`).
5. **Lỗi bắt bằng try/catch**, trả về `{ success: false, message: err.message }`.
6. **Không phân trang phức tạp** — chỉ cần `LIMIT` và `OFFSET` cơ bản.
7. **Comment code bằng tiếng Việt** để dễ đọc cho đồ án.

---

## Ví dụ logic controller (tham khảo)

```js
// controllers/employee.controller.js

const db = require('../config/db');

// Lấy danh sách nhân viên
const getAll = (req, res) => {
  try {
    const { name, position, status } = req.query;
    let query = 'SELECT * FROM employees WHERE 1=1';
    const params = [];

    if (name) { query += ' AND full_name LIKE ?'; params.push(`%${name}%`); }
    if (position) { query += ' AND position = ?'; params.push(position); }
    if (status) { query += ' AND status = ?'; params.push(status); }

    const employees = db.prepare(query).all(...params);
    res.json({ success: true, data: employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Thêm nhân viên mới
const create = (req, res) => {
  try {
    const { full_name, phone, position, department, hire_date } = req.body;
    if (!full_name || !position) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }
    const stmt = db.prepare(
      'INSERT INTO employees (full_name, phone, position, department, hire_date) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(full_name, phone, position, department, hire_date);
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid }, message: 'Thêm nhân viên thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, ... };
```

---

## Lưu ý cho agent

- Tạo đầy đủ tất cả file theo cấu trúc thư mục đã định nghĩa.
- File `src/config/db.js` phải chạy `CREATE TABLE IF NOT EXISTS` khi khởi động để tự động tạo bảng.
- JWT payload chỉ cần chứa: `{ id, username, role, employee_id }`.
- `better-sqlite3` không dùng `.then()`, gọi trực tiếp `.all()`, `.get()`, `.run()`.
- Sau khi hoàn thành, chạy `node seed.js` rồi `npm run dev` phải không có lỗi.
- Không cài thêm thư viện ngoài danh sách `dependencies` ở trên.
