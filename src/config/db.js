const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || './database.db';
const resolvedPath = path.resolve(process.cwd(), dbPath);

const db = new Database(resolvedPath);

db.pragma('foreign_keys = ON');

const ensureColumn = (tableName, columnName, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    avatar_url TEXT,
    birth_date TEXT,
    gender TEXT,
    id_card TEXT UNIQUE,
    social_insurance_no TEXT,
    employee_type TEXT DEFAULT 'guard',
    phone TEXT,
    address TEXT,
    department TEXT,
    hire_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    employee_id INTEGER,
    avatar_url TEXT,
    can_manage_salary INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS partner_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    tax_code TEXT UNIQUE,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    address TEXT,
    status TEXT DEFAULT 'active',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    shift_template_id INTEGER,
    contract_code TEXT NOT NULL UNIQUE,
    service_name TEXT,
    start_date TEXT,
    end_date TEXT,
    guard_quantity INTEGER DEFAULT 0,
    monthly_value REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES partner_companies(id),
    FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id)
  );

  CREATE TABLE IF NOT EXISTS salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    base_salary REAL DEFAULT 0,
    bonus REAL DEFAULT 0,
    deduction REAL DEFAULT 0,
    total REAL DEFAULT 0,
    note TEXT,
    paid INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    shift_date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    shift_template_id INTEGER,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id)
  );

  CREATE TABLE IF NOT EXISTS shift_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    check_out_time TEXT NOT NULL,
    work_pattern TEXT DEFAULT 'daily',
    note TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    leave_date TEXT NOT NULL,
    duration_type TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approved_by INTEGER,
    approved_at TEXT,
    reject_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS leave_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    total_days REAL DEFAULT 12,
    used_days REAL DEFAULT 0,
    remaining_days REAL DEFAULT 12,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by_employee_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    approved_by INTEGER,
    approved_at TEXT,
    reject_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    published_at TEXT,
    FOREIGN KEY (created_by_employee_id) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES accounts(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_salaries_employee_month
  ON salaries(employee_id, month);

  CREATE INDEX IF NOT EXISTS idx_contracts_company
  ON contracts(company_id);

  CREATE INDEX IF NOT EXISTS idx_shift_templates_status
  ON shift_templates(status);

  CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests(employee_id, leave_date);

  CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON leave_requests(status);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_balances_employee_year
  ON leave_balances(employee_id, year);

  CREATE INDEX IF NOT EXISTS idx_announcements_status
  ON announcements(status, created_at DESC);
`);

ensureColumn('employees', 'first_name', 'TEXT');
ensureColumn('employees', 'last_name', 'TEXT');
ensureColumn('employees', 'full_name', 'TEXT');
ensureColumn('employees', 'avatar_url', 'TEXT');
ensureColumn('employees', 'social_insurance_no', 'TEXT');
ensureColumn('employees', 'employee_type', "TEXT DEFAULT 'guard'");

ensureColumn('accounts', 'avatar_url', 'TEXT');
ensureColumn('accounts', 'can_manage_salary', 'INTEGER DEFAULT 0');

ensureColumn('contracts', 'shift_template_id', 'INTEGER REFERENCES shift_templates(id)');

ensureColumn('shifts', 'company_id', 'INTEGER REFERENCES partner_companies(id)');
ensureColumn('shifts', 'contract_id', 'INTEGER REFERENCES contracts(id)');
ensureColumn('shifts', 'assignment_role', "TEXT DEFAULT 'guard'");
ensureColumn('shifts', 'shift_template_id', 'INTEGER REFERENCES shift_templates(id)');

ensureColumn('shift_templates', 'work_pattern', "TEXT DEFAULT 'daily'");
ensureColumn('shift_templates', 'status', "TEXT DEFAULT 'active'");

ensureColumn('leave_requests', 'duration_type', "TEXT DEFAULT 'full_day'");
ensureColumn('leave_requests', 'reject_reason', 'TEXT');
ensureColumn('leave_balances', 'total_days', 'REAL DEFAULT 12');
ensureColumn('leave_balances', 'used_days', 'REAL DEFAULT 0');
ensureColumn('leave_balances', 'remaining_days', 'REAL DEFAULT 12');
ensureColumn('leave_balances', 'updated_at', "TEXT DEFAULT (datetime('now'))");
ensureColumn('announcements', 'reject_reason', 'TEXT');
ensureColumn('announcements', 'published_at', 'TEXT');

const classifyShiftTemplate = (template) => {
  const text = [template.code, template.name, template.note].filter(Boolean).join(' ').toLowerCase();
  const checkIn = String(template.check_in_time || '').trim();
  const checkOut = String(template.check_out_time || '').trim();

  if (
    text.includes('night') ||
    text.includes('dem') ||
    text.includes('đêm') ||
    text.startsWith('n') ||
    checkIn >= '18:00' ||
    (checkOut !== '' && checkOut <= '06:00')
  ) {
    return 'night';
  }

  return 'day';
};

const normalizeShiftData = () => {
  const tx = db.transaction(() => {
    const templates = db.prepare(`
      SELECT id, code, name, check_in_time, check_out_time, work_pattern, note, status
      FROM shift_templates
      ORDER BY id ASC
    `).all();

    const findTemplate = (code) => templates.find((template) => template.code === code);

    let dayTemplate = findTemplate('DAY') || findTemplate('A01');
    let nightTemplate = findTemplate('NIGHT') || findTemplate('N01') || findTemplate('N02');

    if (!dayTemplate) {
      const result = db.prepare(`
        INSERT INTO shift_templates (code, name, check_in_time, check_out_time, work_pattern, note, status)
        VALUES ('DAY', 'Ca Ngay', '08:00', '17:00', 'daily', 'Ca ngay mac dinh', 'active')
      `).run();
      dayTemplate = { id: Number(result.lastInsertRowid) };
    } else {
      db.prepare(`
        UPDATE shift_templates
        SET code = 'DAY',
            name = 'Ca Ngay',
            check_in_time = '08:00',
            check_out_time = '17:00',
            work_pattern = 'daily',
            note = 'Ca ngay mac dinh',
            status = 'active'
        WHERE id = ?
      `).run(dayTemplate.id);
    }

    if (!nightTemplate) {
      const result = db.prepare(`
        INSERT INTO shift_templates (code, name, check_in_time, check_out_time, work_pattern, note, status)
        VALUES ('NIGHT', 'Ca Dem', '22:00', '06:00', 'daily', 'Ca dem mac dinh', 'active')
      `).run();
      nightTemplate = { id: Number(result.lastInsertRowid) };
    } else {
      db.prepare(`
        UPDATE shift_templates
        SET code = 'NIGHT',
            name = 'Ca Dem',
            check_in_time = '22:00',
            check_out_time = '06:00',
            work_pattern = 'daily',
            note = 'Ca dem mac dinh',
            status = 'active'
        WHERE id = ?
      `).run(nightTemplate.id);
    }

    const otherTemplates = db.prepare(`
      SELECT id, code, name, check_in_time, check_out_time, note
      FROM shift_templates
      WHERE id NOT IN (?, ?)
    `).all(dayTemplate.id, nightTemplate.id);

    otherTemplates.forEach((template) => {
      const targetId = classifyShiftTemplate(template) === 'night' ? nightTemplate.id : dayTemplate.id;
      db.prepare('UPDATE shifts SET shift_template_id = ? WHERE shift_template_id = ?').run(targetId, template.id);
      db.prepare('DELETE FROM shift_templates WHERE id = ?').run(template.id);
    });

    db.prepare(`
      UPDATE shifts
      SET shift_type = CASE
        WHEN shift_template_id = ? THEN 'day'
        WHEN shift_template_id = ? THEN 'night'
        WHEN lower(COALESCE(shift_type, '')) IN ('a01', 'morning', 'afternoon', 'day', 'ca ngay', 'ca ngày') THEN 'day'
        WHEN lower(COALESCE(shift_type, '')) IN ('n01', 'n02', 'night', 'ca dem', 'ca đêm') THEN 'night'
        ELSE shift_type
      END
    `).run(dayTemplate.id, nightTemplate.id);

    db.prepare(`
      UPDATE shifts
      SET shift_template_id = CASE
        WHEN lower(COALESCE(shift_type, '')) = 'day' THEN ?
        WHEN lower(COALESCE(shift_type, '')) = 'night' THEN ?
        ELSE shift_template_id
      END
      WHERE shift_template_id IS NULL
    `).run(dayTemplate.id, nightTemplate.id);

    db.prepare(`
      UPDATE shift_templates
      SET status = CASE
        WHEN id IN (?, ?) THEN 'active'
        ELSE 'inactive'
      END
    `).run(dayTemplate.id, nightTemplate.id);
  });

  tx();
};

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_social_insurance_no
  ON employees(social_insurance_no)
  WHERE social_insurance_no IS NOT NULL;
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_employees_employee_type
  ON employees(employee_type);
`);

try {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_employee_unique
    ON accounts(employee_id)
    WHERE employee_id IS NOT NULL;
  `);
} catch (err) {
  if (!String(err.message || '').includes('UNIQUE constraint failed')) {
    throw err;
  }
}

db.exec(`
  UPDATE employees
  SET first_name = COALESCE(first_name, full_name, ''),
      last_name = COALESCE(last_name, '')
  WHERE first_name IS NULL OR first_name = '';
`);

db.exec(`
  UPDATE employees
  SET employee_type = CASE
    WHEN employee_type IS NULL OR employee_type = '' THEN
      CASE
        WHEN lower(COALESCE(department, '')) LIKE '%human resources%' OR lower(COALESCE(department, '')) LIKE '%nhan su%' THEN 'hr'
        ELSE 'guard'
      END
    ELSE employee_type
  END
`);

db.exec(`
  UPDATE accounts
  SET can_manage_salary = COALESCE(can_manage_salary, 0)
`);

db.exec(`
  UPDATE leave_requests
  SET duration_type = COALESCE(NULLIF(duration_type, ''), 'full_day')
`);

normalizeShiftData();

db.exec(`
  UPDATE contracts
  SET shift_template_id = (
    SELECT id
    FROM shift_templates
    WHERE code = 'DAY'
    LIMIT 1
  )
  WHERE shift_template_id IS NULL
`);

db.exec(`
  UPDATE shift_templates
  SET work_pattern = COALESCE(NULLIF(work_pattern, ''), 'daily'),
      status = COALESCE(NULLIF(status, ''), 'active')
`);

const normalizeLeaveBalances = () => {
  const tx = db.transaction(() => {
    const currentYear = new Date().getFullYear();

    db.prepare(`
      INSERT INTO leave_balances (employee_id, year, total_days, used_days, remaining_days, updated_at)
      SELECT e.id, ?, 12, 0, 12, datetime('now')
      FROM employees e
      WHERE NOT EXISTS (
        SELECT 1
        FROM leave_balances lb
        WHERE lb.employee_id = e.id AND lb.year = ?
      )
    `).run(currentYear, currentYear);

    const usages = db.prepare(`
      SELECT lb.employee_id,
             lb.year,
             COALESCE(SUM(
               CASE lr.duration_type
                 WHEN 'full_day' THEN 1.0
                 WHEN 'half_day_morning' THEN 0.5
                 WHEN 'half_day_afternoon' THEN 0.5
                 ELSE 0
               END
             ), 0) AS used_days
      FROM leave_balances lb
      LEFT JOIN leave_requests lr
        ON lr.employee_id = lb.employee_id
       AND lr.status = 'approved'
       AND substr(lr.leave_date, 1, 4) = CAST(lb.year AS TEXT)
      GROUP BY lb.employee_id, lb.year
    `).all();

    const update = db.prepare(`
      UPDATE leave_balances
      SET used_days = ?,
          remaining_days = CASE
            WHEN total_days - ? < 0 THEN 0
            ELSE total_days - ?
          END,
          updated_at = datetime('now')
      WHERE employee_id = ? AND year = ?
    `);

    usages.forEach((row) => {
      update.run(row.used_days, row.used_days, row.used_days, row.employee_id, row.year);
    });
  });

  tx();
};

normalizeLeaveBalances();

module.exports = db;
