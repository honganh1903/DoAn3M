const jwt = require('jsonwebtoken');
const db = require('../config/db');

const authenticate = (req, res, next) => {
  try {
    const authHeader = (req.headers.authorization || '').trim();

    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const [scheme, rawToken] = authHeader.split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !rawToken) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = rawToken.trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const account = db
      .prepare('SELECT id, username, role, employee_id, is_active, can_manage_salary FROM accounts WHERE id = ?')
      .get(decoded.id);

    if (!account || account.is_active !== 1) {
      return res.status(401).json({ success: false, message: 'Account is invalid or disabled' });
    }

    req.user = {
      id: account.id,
      username: account.username,
      role: account.role,
      employee_id: account.employee_id,
      can_manage_salary: account.can_manage_salary === 1
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token is invalid or expired' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    next();
  };
};

const authorizeSalaryManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (req.user.role === 'admin' || (req.user.role === 'employee' && req.user.can_manage_salary)) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access denied' });
};

module.exports = { authenticate, authorize, authorizeSalaryManager };

