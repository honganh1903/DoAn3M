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
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const account = db
      .prepare(`
        SELECT a.id, a.username, a.password, a.role, a.employee_id, a.is_active, a.can_manage_salary,
               e.avatar_url
        FROM accounts a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.username = ?
      `)
      .get(username);

    if (!account || account.is_active !== 1) {
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const isMatch = bcrypt.compareSync(password, account.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
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
          avatar_url: account.avatar_url || null,
          can_manage_salary: account.can_manage_salary === 1
        }
      },
      message: 'Đăng nhập thành công'
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
               e.first_name, e.last_name, e.avatar_url, ${NAME_SQL} AS full_name,
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
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.user.id);
    const isMatch = bcrypt.compareSync(current_password, account.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE accounts SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);

    return res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  login,
  me,
  changePassword
};
