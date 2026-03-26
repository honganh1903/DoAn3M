const db = require('../config/db');

const getAll = (req, res) => {
  try {
    const { company_id, status } = req.query;
    let query = `
      SELECT b.*, c.company_name
      FROM partner_branches b
      JOIN partner_companies c ON c.id = b.company_id
      WHERE 1=1
    `;
    const params = [];

    if (company_id) {
      query += ' AND b.company_id = ?';
      params.push(company_id);
    }

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    query += ' ORDER BY b.id DESC';

    return res.json({ success: true, data: db.prepare(query).all(...params) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { company_id, branch_name, address, area, contact_name, contact_phone, status } = req.body;

    if (!company_id || !branch_name) {
      return res.status(400).json({ success: false, message: 'company_id and branch_name are required' });
    }

    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(company_id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Partner company does not exist' });
    }

    const result = db.prepare(`
      INSERT INTO partner_branches (company_id, branch_name, address, area, contact_name, contact_phone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(company_id, branch_name, address || null, area || null, contact_name || null, contact_phone || null, status || 'active');

    return res.status(201).json({ success: true, data: db.prepare('SELECT * FROM partner_branches WHERE id = ?').get(result.lastInsertRowid), message: 'Partner branch created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const branchId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM partner_branches WHERE id = ?').get(branchId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Partner branch not found' });
    }

    const payload = {
      company_id: req.body.company_id ?? existing.company_id,
      branch_name: req.body.branch_name ?? existing.branch_name,
      address: req.body.address ?? existing.address,
      area: req.body.area ?? existing.area,
      contact_name: req.body.contact_name ?? existing.contact_name,
      contact_phone: req.body.contact_phone ?? existing.contact_phone,
      status: req.body.status ?? existing.status
    };

    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(payload.company_id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Partner company does not exist' });
    }

    db.prepare(`
      UPDATE partner_branches
      SET company_id = ?, branch_name = ?, address = ?, area = ?, contact_name = ?, contact_phone = ?, status = ?
      WHERE id = ?
    `).run(payload.company_id, payload.branch_name, payload.address, payload.area, payload.contact_name, payload.contact_phone, payload.status, branchId);

    return res.json({ success: true, data: db.prepare('SELECT * FROM partner_branches WHERE id = ?').get(branchId), message: 'Partner branch updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const result = db.prepare('UPDATE partner_branches SET status = ? WHERE id = ?').run('inactive', req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Partner branch not found' });
    }

    return res.json({ success: true, message: 'Partner branch marked as inactive' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
