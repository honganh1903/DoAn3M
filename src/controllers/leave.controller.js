const db = require('../config/db');

const VALID_DURATION_TYPES = ['full_day', 'half_day_morning', 'half_day_afternoon'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toYearMonth = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const getDurationDays = (durationType) => {
  if (durationType === 'full_day') {
    return 1;
  }
  if (durationType === 'half_day_morning' || durationType === 'half_day_afternoon') {
    return 0.5;
  }
  return 0;
};

const getOrCreateLeaveBalance = (employeeId, year) => {
  const existing = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(employeeId, year);
  if (existing) {
    return existing;
  }

  db.prepare(`
    INSERT INTO leave_balances (employee_id, year, total_days, used_days, remaining_days, updated_at)
    VALUES (?, ?, 12, 0, 12, datetime('now'))
  `).run(employeeId, year);

  return db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(employeeId, year);
};

const getMyBalance = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const year = Number(req.query.year) || new Date().getFullYear();
    const balance = getOrCreateLeaveBalance(req.user.employee_id, year);
    return res.json({ success: true, data: balance });
  } catch (err) {
    if (String(err.message || '').includes('Insufficient annual leave balance')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMyRequests = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const data = db.prepare(`
      SELECT lr.*, a.username AS approved_by_username
      FROM leave_requests lr
      LEFT JOIN accounts a ON a.id = lr.approved_by
      WHERE lr.employee_id = ?
      ORDER BY lr.id DESC
    `).all(req.user.employee_id);

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const { leave_date, duration_type = 'full_day', reason } = req.body;

    if (!leave_date) {
      return res.status(400).json({ success: false, message: 'leave_date is required' });
    }

    if (!DATE_RE.test(String(leave_date))) {
      return res.status(400).json({ success: false, message: 'leave_date must be in YYYY-MM-DD format' });
    }

    if (!VALID_DURATION_TYPES.includes(duration_type)) {
      return res.status(400).json({ success: false, message: 'duration_type must be full_day, half_day_morning, or half_day_afternoon' });
    }

    const requestedMonth = String(leave_date).slice(0, 7);
    const currentMonth = toYearMonth(new Date());
    if (requestedMonth !== currentMonth) {
      return res.status(400).json({ success: false, message: `leave request must be in current month (${currentMonth})` });
    }

    const duplicated = db.prepare(`
      SELECT id
      FROM leave_requests
      WHERE employee_id = ?
        AND leave_date = ?
        AND status IN ('pending', 'approved')
      LIMIT 1
    `).get(req.user.employee_id, leave_date);

    if (duplicated) {
      return res.status(400).json({ success: false, message: 'Leave request for this date already exists' });
    }

    const result = db.prepare(`
      INSERT INTO leave_requests (employee_id, leave_date, duration_type, reason, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.user.employee_id, leave_date, duration_type, reason || null);

    const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: row, message: 'Leave request submitted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAllForAdmin = (req, res) => {
  try {
    const { status, employee_id } = req.query;

    let query = `
      SELECT lr.*, e.first_name, e.last_name, e.department, a.username AS approved_by_username
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN accounts a ON a.id = lr.approved_by
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND lr.status = ?';
      params.push(status);
    }

    if (employee_id) {
      query += ' AND lr.employee_id = ?';
      params.push(employee_id);
    }

    query += ' ORDER BY lr.id DESC';

    const data = db.prepare(query).all(...params);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const approve = (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending leave requests can be approved' });
    }

    const currentMonth = toYearMonth(new Date());
    if (String(existing.leave_date).slice(0, 7) !== currentMonth) {
      return res.status(400).json({ success: false, message: `leave request must be in current month (${currentMonth})` });
    }

    const leaveDays = getDurationDays(existing.duration_type);
    if (leaveDays <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid duration_type' });
    }

    const leaveYear = Number(String(existing.leave_date).slice(0, 4));

    const tx = db.transaction(() => {
      const balance = getOrCreateLeaveBalance(existing.employee_id, leaveYear);
      if (Number(balance.remaining_days) < leaveDays) {
        throw new Error(`Insufficient annual leave balance. Remaining: ${balance.remaining_days}`);
      }

      db.prepare(`
        UPDATE leave_balances
        SET used_days = used_days + ?,
            remaining_days = remaining_days - ?,
            updated_at = datetime('now')
        WHERE employee_id = ? AND year = ?
      `).run(leaveDays, leaveDays, existing.employee_id, leaveYear);

      db.prepare(`
        UPDATE leave_requests
        SET status = 'approved', approved_by = ?, approved_at = datetime('now'), reject_reason = NULL
        WHERE id = ?
      `).run(req.user.id, id);
    });

    tx();

    const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
    const balance = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(existing.employee_id, leaveYear);
    return res.json({ success: true, data: { request: row, balance }, message: 'Leave request approved' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const reject = (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reject_reason } = req.body;

    const existing = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending leave requests can be rejected' });
    }

    db.prepare(`
      UPDATE leave_requests
      SET status = 'rejected', approved_by = ?, approved_at = datetime('now'), reject_reason = ?
      WHERE id = ?
    `).run(req.user.id, reject_reason || null, id);

    const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
    return res.json({ success: true, data: row, message: 'Leave request rejected' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getMyBalance,
  getMyRequests,
  create,
  getAllForAdmin,
  approve,
  reject
};
