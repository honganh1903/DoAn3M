const db = require('../config/db');

const getPublicApproved = (req, res) => {
  try {
    const data = db.prepare(`
      SELECT an.id, an.title, an.content, an.status, an.created_at, an.published_at,
             e.first_name, e.last_name
      FROM announcements an
      JOIN employees e ON e.id = an.created_by_employee_id
      WHERE an.status = 'approved'
      ORDER BY COALESCE(an.published_at, an.created_at) DESC, an.id DESC
    `).all();

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMyPosts = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'Tài khoản này chưa liên kết với nhân viên' });
    }

    const data = db.prepare(`
      SELECT an.*, a.username AS approved_by_username
      FROM announcements an
      LEFT JOIN accounts a ON a.id = an.approved_by
      WHERE an.created_by_employee_id = ?
      ORDER BY an.id DESC
    `).all(req.user.employee_id);

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'Tài khoản này chưa liên kết với nhân viên' });
    }

    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Tiêu đề và nội dung là bắt buộc' });
    }

    const result = db.prepare(`
      INSERT INTO announcements (created_by_employee_id, title, content, status)
      VALUES (?, ?, ?, 'pending')
    `).run(req.user.employee_id, title, content);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: row, message: 'Thông báo đã được gửi chờ phê duyệt' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAllForAdmin = (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    let query = `
      SELECT an.*, e.first_name, e.last_name, a.username AS approved_by_username
      FROM announcements an
      JOIN employees e ON e.id = an.created_by_employee_id
      LEFT JOIN accounts a ON a.id = an.approved_by
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND an.status = ?';
      params.push(status);
    }

    query += ' ORDER BY an.id DESC';

    const data = db.prepare(query).all(...params);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const approve = (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    db.prepare(`
      UPDATE announcements
      SET status = 'approved', approved_by = ?, approved_at = datetime('now'), reject_reason = NULL, published_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, id);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    return res.json({ success: true, data: row, message: 'Thông báo đã được phê duyệt' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const reject = (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reject_reason } = req.body;

    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    db.prepare(`
      UPDATE announcements
      SET status = 'rejected', approved_by = ?, approved_at = datetime('now'), reject_reason = ?
      WHERE id = ?
    `).run(req.user.id, reject_reason || null, id);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    return res.json({ success: true, data: row, message: 'Thông báo đã bị từ chối' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getPublicApproved,
  getMyPosts,
  create,
  getAllForAdmin,
  approve,
  reject
};
