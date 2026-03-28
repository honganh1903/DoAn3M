const bcrypt = require('bcryptjs');
const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";
const VALID_ACCOUNT_ROLES = ['user', 'employee', 'admin'];

const getMe = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const profile = db.prepare(`
      SELECT e.id, e.first_name, e.last_name, e.avatar_url,
             COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '') AS full_name,
             e.birth_date, e.gender, e.id_card, e.social_insurance_no, e.employee_type,
             e.phone, e.address, e.department, e.hire_date, e.status
      FROM employees e
      WHERE e.id = ?
    `).get(req.user.employee_id);

    return res.json({ success: true, data: profile });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMySalaries = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const salaries = db
      .prepare('SELECT * FROM salaries WHERE employee_id = ? ORDER BY month DESC, id DESC')
      .all(req.user.employee_id);

    return res.json({ success: true, data: salaries });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMyShifts = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const shifts = db
      .prepare(`
        SELECT s.*, c.company_name, ct.contract_code,
               st.code AS shift_code, st.name AS shift_name, st.check_in_time, st.check_out_time, st.work_pattern
        FROM shifts s
        LEFT JOIN partner_companies c ON c.id = s.company_id
        LEFT JOIN contracts ct ON ct.id = s.contract_id
        LEFT JOIN shift_templates st ON st.id = s.shift_template_id
        WHERE s.employee_id = ?
        ORDER BY s.shift_date DESC, s.id DESC
      `)
      .all(req.user.employee_id);

    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAll = (req, res) => {
  try {
    const query = `
      SELECT a.id, a.username, a.role, a.employee_id,
             a.can_manage_salary, a.created_at, a.is_active,
             e.avatar_url,
             ${NAME_SQL} AS full_name
      FROM accounts a
      LEFT JOIN employees e ON e.id = a.employee_id
      ORDER BY a.id DESC
    `;

    const users = db.prepare(query).all();
    return res.json({ success: true, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { username, password, role = 'user', employee_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalizedRole = role || 'user';
    if (!VALID_ACCOUNT_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'role must be user, employee, or admin' });
    }

    if (req.user.role === 'employee' && normalizedRole !== 'user') {
      return res.status(403).json({ success: false, message: 'HR can only create user accounts' });
    }

    const canManageSalary = req.user.role === 'admin' ? (req.body.can_manage_salary ? 1 : 0) : 0;

    if (employee_id) {
      const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employee_id);
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee does not exist' });
      }

      const occupied = db.prepare('SELECT id, username FROM accounts WHERE employee_id = ?').get(employee_id);
      if (occupied) {
        return res.status(409).json({ success: false, message: 'This employee already has an account' });
      }
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db
      .prepare('INSERT INTO accounts (username, password, role, employee_id, can_manage_salary) VALUES (?, ?, ?, ?, ?)')
      .run(username, hashedPassword, normalizedRole, employee_id || null, canManageSalary);

    const user = db
      .prepare('SELECT id, username, role, employee_id, can_manage_salary, created_at, is_active FROM accounts WHERE id = ?')
      .get(result.lastInsertRowid);

    return res.status(201).json({ success: true, data: user, message: 'Account created successfully' });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: accounts.employee_id')) {
      return res.status(409).json({ success: false, message: 'This employee already has an account' });
    }

    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'username') || Object.prototype.hasOwnProperty.call(req.body, 'employee_id')) {
      return res.status(400).json({
        success: false,
        message: 'Only role, is_active, and can_manage_salary can be updated'
      });
    }

    const canUpdateSalaryPermission =
      req.user.role === 'admin' || (req.user.role === 'employee' && req.user.can_manage_salary);

    const payload = {
      role: req.body.role ?? existing.role,
      is_active: req.body.is_active ?? existing.is_active,
      can_manage_salary: canUpdateSalaryPermission
        ? (req.body.can_manage_salary ?? existing.can_manage_salary ?? 0)
        : (existing.can_manage_salary ?? 0)
    };

    if (!VALID_ACCOUNT_ROLES.includes(payload.role)) {
      return res.status(400).json({ success: false, message: 'role must be user, employee, or admin' });
    }

    if (req.user.role === 'employee' && (existing.role !== 'user' || payload.role !== 'user')) {
      return res.status(403).json({ success: false, message: 'HR can only update user accounts' });
    }

    db.prepare(`
      UPDATE accounts
      SET role = ?, is_active = ?, can_manage_salary = ?
      WHERE id = ?
    `).run(payload.role, payload.is_active, payload.can_manage_salary ? 1 : 0, accountId);

    const user = db
      .prepare('SELECT id, username, role, employee_id, can_manage_salary, created_at, is_active FROM accounts WHERE id = ?')
      .get(accountId);

    return res.json({ success: true, data: user, message: 'Account updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const resetPassword = (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'new_password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(accountId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role === 'employee' && existing.role !== 'user') {
      return res.status(403).json({ success: false, message: 'HR can only reset passwords for user accounts' });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE accounts SET password = ? WHERE id = ?').run(hashedPassword, accountId);

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const existing = db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(accountId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role === 'employee' && existing.role !== 'user') {
      return res.status(403).json({ success: false, message: 'HR can only disable user accounts' });
    }

    db.prepare('UPDATE accounts SET is_active = 0 WHERE id = ?').run(accountId);

    return res.json({ success: true, message: 'Account disabled successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getMe,
  getMySalaries,
  getMyShifts,
  getAll,
  create,
  update,
  resetPassword,
  remove
};


