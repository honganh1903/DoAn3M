require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

const hash = (plain) => bcrypt.hashSync(plain, 10);

const seedTest = db.transaction(() => {
  // Clear data in FK-safe order so test DB stays minimal.
  db.exec(`
    DELETE FROM announcements;
    DELETE FROM leave_requests;
    DELETE FROM leave_balances;
    DELETE FROM shifts;
    DELETE FROM salaries;
    DELETE FROM contracts;
    DELETE FROM partner_companies;
    DELETE FROM shift_templates;
    DELETE FROM accounts;
    DELETE FROM employees;
  `);

  const insertEmployee = db.prepare(`
    INSERT INTO employees (
      first_name, last_name, full_name, birth_date, gender, id_card,
      social_insurance_no, employee_type, phone, address, department, hire_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `);

  const insertAccount = db.prepare(`
    INSERT INTO accounts (username, password, role, employee_id, can_manage_salary, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const adminEmployee = insertEmployee.run(
    'Nguyen',
    'Admin',
    'Nguyen Admin',
    '1990-01-01',
    'male',
    'TEST000001',
    'BHXH_TEST_0001',
    'hr',
    '0909000001',
    'Test Address 1',
    'Human Resources',
    '2025-01-01'
  );

  const staffEmployee = insertEmployee.run(
    'Tran',
    'NhanVien',
    'Tran NhanVien',
    '1998-05-10',
    'female',
    'TEST000002',
    'BHXH_TEST_0002',
    'guard',
    '0909000002',
    'Test Address 2',
    'Security',
    '2025-02-01'
  );

  const adminEmployeeId = Number(adminEmployee.lastInsertRowid);
  const staffEmployeeId = Number(staffEmployee.lastInsertRowid);

  insertAccount.run('admin_test', hash('admin123'), 'admin', adminEmployeeId, 1);
  insertAccount.run('employee_test', hash('employee123'), 'employee', staffEmployeeId, 0);
  insertAccount.run('user_test', hash('user123'), 'user', null, 0);
});

try {
  seedTest();
  console.log('Seed test completed.');
  console.log('Accounts:');
  console.log('- admin_test / admin123 (role=admin, linked employee)');
  console.log('- employee_test / employee123 (role=employee, linked employee)');
  console.log('- user_test / user123 (role=user, no employee link)');
} catch (err) {
  console.error('Seed test failed:', err.message);
  process.exit(1);
}

