const db = require('../config/db');

const VALID_DURATION_TYPES = ['full_day', 'half_day_morning', 'half_day_afternoon'];

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

    if (!VALID_DURATION_TYPES.includes(duration_type)) {
      return res.status(400).json({ success: false, message: 'duration_type must be full_day, half_day_morning, or half_day_afternoon' });
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

    db.prepare(`
      UPDATE leave_requests
      SET status = 'approved', approved_by = ?, approved_at = datetime('now'), reject_reason = NULL
      WHERE id = ?
    `).run(req.user.id, id);

    const row = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
    return res.json({ success: true, data: row, message: 'Leave request approved' });
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
  getMyRequests,
  create,
  getAllForAdmin,
  approve,
  reject
};
