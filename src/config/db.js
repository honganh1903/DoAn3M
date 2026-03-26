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

  CREATE TABLE IF NOT EXISTS partner_branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    branch_name TEXT NOT NULL,
    address TEXT,
    area TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES partner_companies(id)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    branch_id INTEGER,
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
    FOREIGN KEY (branch_id) REFERENCES partner_branches(id)
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
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
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

  CREATE INDEX IF NOT EXISTS idx_partner_branches_company
  ON partner_branches(company_id);

  CREATE INDEX IF NOT EXISTS idx_contracts_company_branch
  ON contracts(company_id, branch_id);

  CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests(employee_id, leave_date);

  CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON leave_requests(status);

  CREATE INDEX IF NOT EXISTS idx_announcements_status
  ON announcements(status, created_at DESC);
`);

ensureColumn('employees', 'first_name', 'TEXT');
ensureColumn('employees', 'last_name', 'TEXT');
ensureColumn('employees', 'full_name', 'TEXT');
ensureColumn('employees', 'social_insurance_no', 'TEXT');
ensureColumn('employees', 'employee_type', "TEXT DEFAULT 'guard'");
ensureColumn('accounts', 'can_manage_salary', 'INTEGER DEFAULT 0');
ensureColumn('shifts', 'company_id', 'INTEGER REFERENCES partner_companies(id)');
ensureColumn('shifts', 'branch_id', 'INTEGER REFERENCES partner_branches(id)');
ensureColumn('shifts', 'contract_id', 'INTEGER REFERENCES contracts(id)');
ensureColumn('shifts', 'assignment_role', "TEXT DEFAULT 'guard'");
ensureColumn('leave_requests', 'duration_type', "TEXT DEFAULT 'full_day'");
ensureColumn('leave_requests', 'reject_reason', 'TEXT');
ensureColumn('announcements', 'reject_reason', 'TEXT');
ensureColumn('announcements', 'published_at', 'TEXT');

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
  // Keep app booting on legacy data with duplicates; API layer still blocks new duplicates.
  if (!String(err.message || '').includes('UNIQUE constraint failed')) {
    throw err;
  }
}

// Soft migration for old rows that only had full_name.
db.exec(`
  UPDATE employees
  SET first_name = COALESCE(first_name, full_name, ''),
      last_name = COALESCE(last_name, '')
  WHERE first_name IS NULL OR first_name = '';
`);

// Default employee_type for legacy rows.
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

module.exports = db;
