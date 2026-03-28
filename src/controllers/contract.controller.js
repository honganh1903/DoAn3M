const db = require('../config/db');

const getAll = (req, res) => {
  try {
    const { company_id, status } = req.query;
    let query = `
      SELECT ct.*, c.company_name
      FROM contracts ct
      JOIN partner_companies c ON c.id = ct.company_id
      WHERE 1=1
    `;
    const params = [];

    if (company_id) {
      query += ' AND ct.company_id = ?';
      params.push(company_id);
    }

    if (status) {
      query += ' AND ct.status = ?';
      params.push(status);
    }

    query += ' ORDER BY ct.id DESC';

    return res.json({ success: true, data: db.prepare(query).all(...params) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const {
      company_id,
      contract_code,
      service_name,
      start_date,
      end_date,
      guard_quantity,
      monthly_value,
      status,
      note
    } = req.body;

    if (!company_id || !contract_code) {
      return res.status(400).json({ success: false, message: 'company_id and contract_code are required' });
    }

    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(company_id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Partner company does not exist' });
    }

    const result = db.prepare(`
      INSERT INTO contracts (company_id, branch_id, contract_code, service_name, start_date, end_date, guard_quantity, monthly_value, status, note)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      company_id,
      contract_code,
      service_name || null,
      start_date || null,
      end_date || null,
      guard_quantity || 0,
      monthly_value || 0,
      status || 'active',
      note || null
    );

    return res.status(201).json({ success: true, data: db.prepare('SELECT * FROM contracts WHERE id = ?').get(result.lastInsertRowid), message: 'Contract created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const payload = {
      company_id: req.body.company_id ?? existing.company_id,
      contract_code: req.body.contract_code ?? existing.contract_code,
      service_name: req.body.service_name ?? existing.service_name,
      start_date: req.body.start_date ?? existing.start_date,
      end_date: req.body.end_date ?? existing.end_date,
      guard_quantity: req.body.guard_quantity ?? existing.guard_quantity,
      monthly_value: req.body.monthly_value ?? existing.monthly_value,
      status: req.body.status ?? existing.status,
      note: req.body.note ?? existing.note
    };

    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(payload.company_id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Partner company does not exist' });
    }

    db.prepare(`
      UPDATE contracts
      SET company_id = ?, branch_id = NULL, contract_code = ?, service_name = ?, start_date = ?, end_date = ?,
          guard_quantity = ?, monthly_value = ?, status = ?, note = ?
      WHERE id = ?
    `).run(
      payload.company_id,
      payload.contract_code,
      payload.service_name,
      payload.start_date,
      payload.end_date,
      payload.guard_quantity,
      payload.monthly_value,
      payload.status,
      payload.note,
      contractId
    );

    return res.json({ success: true, data: db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId), message: 'Contract updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const result = db.prepare('UPDATE contracts SET status = ? WHERE id = ?').run('inactive', req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    return res.json({ success: true, message: 'Contract marked as inactive' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
