const db = require('../config/db');

const getAll = (req, res) => {
  try {
    const { status, keyword } = req.query;
    let query = 'SELECT * FROM partner_companies WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (keyword) {
      query += ' AND (company_name LIKE ? OR contact_name LIKE ? OR tax_code LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    query += ' ORDER BY id DESC';

    return res.json({ success: true, data: db.prepare(query).all(...params) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getById = (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM partner_companies WHERE id = ?').get(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, message: 'Partner company not found' });
    }

    const branches = db.prepare('SELECT * FROM partner_branches WHERE company_id = ? ORDER BY id DESC').all(req.params.id);
    const contracts = db.prepare('SELECT * FROM contracts WHERE company_id = ? ORDER BY id DESC').all(req.params.id);

    return res.json({ success: true, data: { ...company, branches, contracts } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { company_name, tax_code, contact_name, contact_phone, contact_email, address, status, note } = req.body;

    if (!company_name) {
      return res.status(400).json({ success: false, message: 'company_name is required' });
    }

    const result = db.prepare(`
      INSERT INTO partner_companies (company_name, tax_code, contact_name, contact_phone, contact_email, address, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      company_name,
      tax_code || null,
      contact_name || null,
      contact_phone || null,
      contact_email || null,
      address || null,
      status || 'active',
      note || null
    );

    const company = db.prepare('SELECT * FROM partner_companies WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: company, message: 'Partner company created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM partner_companies WHERE id = ?').get(companyId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Partner company not found' });
    }

    const payload = {
      company_name: req.body.company_name ?? existing.company_name,
      tax_code: req.body.tax_code ?? existing.tax_code,
      contact_name: req.body.contact_name ?? existing.contact_name,
      contact_phone: req.body.contact_phone ?? existing.contact_phone,
      contact_email: req.body.contact_email ?? existing.contact_email,
      address: req.body.address ?? existing.address,
      status: req.body.status ?? existing.status,
      note: req.body.note ?? existing.note
    };

    db.prepare(`
      UPDATE partner_companies
      SET company_name = ?, tax_code = ?, contact_name = ?, contact_phone = ?, contact_email = ?, address = ?, status = ?, note = ?
      WHERE id = ?
    `).run(
      payload.company_name,
      payload.tax_code,
      payload.contact_name,
      payload.contact_phone,
      payload.contact_email,
      payload.address,
      payload.status,
      payload.note,
      companyId
    );

    return res.json({ success: true, data: db.prepare('SELECT * FROM partner_companies WHERE id = ?').get(companyId), message: 'Partner company updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const result = db.prepare('UPDATE partner_companies SET status = ? WHERE id = ?').run('inactive', req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Partner company not found' });
    }

    return res.json({ success: true, message: 'Partner company marked as inactive' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
