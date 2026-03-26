const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";

const createToken = (account) => {
  return jwt.sign(
    {
      id: account.id,
      username: account.username,
      role: account.role,
          employee_id: account.employee_id,
          can_manage_salary: account.can_manage_salary === 1
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const login = (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please enter username and password' });
    }

    const account = db.prepare('SELECT id, username, password, role, employee_id, is_active, can_manage_salary FROM accounts WHERE username = ?').get(username);

    if (!account || account.is_active !== 1) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const isMatch = bcrypt.compareSync(password, account.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const token = createToken(account);

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: account.id,
          username: account.username,
          role: account.role,
          employee_id: account.employee_id,
          can_manage_salary: account.can_manage_salary === 1
        }
      },
      message: 'Login successful'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const me = (req, res) => {
  try {
    const user = db
      .prepare(`
        SELECT a.id, a.username, a.role, a.employee_id, a.can_manage_salary, a.created_at,
               e.first_name, e.last_name, ${NAME_SQL} AS full_name,
               e.id_card, e.social_insurance_no, e.employee_type, e.department
        FROM accounts a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.id = ?
      `)
      .get(req.user.id);

    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const changePassword = (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Please provide current and new passwords' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.user.id);
    const isMatch = bcrypt.compareSync(current_password, account.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE accounts SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  login,
  me,
  changePassword
};

