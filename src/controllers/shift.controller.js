const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";

const getAll = (req, res) => {
  try {
    const { employee_id, company_id, branch_id, contract_id, date, month } = req.query;
    let query = `
      SELECT s.*, ${NAME_SQL} AS full_name, c.company_name, b.branch_name, ct.contract_code
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN partner_companies c ON c.id = s.company_id
      LEFT JOIN partner_branches b ON b.id = s.branch_id
      LEFT JOIN contracts ct ON ct.id = s.contract_id
      WHERE 1=1
    `;
    const params = [];

    if (employee_id) {
      query += ' AND s.employee_id = ?';
      params.push(employee_id);
    }

    if (company_id) {
      query += ' AND s.company_id = ?';
      params.push(company_id);
    }

    if (branch_id) {
      query += ' AND s.branch_id = ?';
      params.push(branch_id);
    }

    if (contract_id) {
      query += ' AND s.contract_id = ?';
      params.push(contract_id);
    }

    if (date) {
      query += ' AND s.shift_date = ?';
      params.push(date);
    }

    if (month) {
      query += ' AND substr(s.shift_date, 1, 7) = ?';
      params.push(month);
    }

    query += ' ORDER BY s.shift_date DESC, s.id DESC';

    const shifts = db.prepare(query).all(...params);
    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMine = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const shifts = db
      .prepare(`
        SELECT s.*, c.company_name, b.branch_name, ct.contract_code
        FROM shifts s
        LEFT JOIN partner_companies c ON c.id = s.company_id
        LEFT JOIN partner_branches b ON b.id = s.branch_id
        LEFT JOIN contracts ct ON ct.id = s.contract_id
        WHERE s.employee_id = ?
        ORDER BY s.shift_date DESC, s.id DESC
      `)
      .all(req.user.employee_id);

    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const validateAssignment = (employeeId, companyId, branchId, contractId) => {
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) {
    return 'Employee does not exist';
  }

  if (companyId) {
    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(companyId);
    if (!company) {
      return 'Partner company does not exist';
    }
  }

  if (branchId) {
    const branch = db.prepare('SELECT id, company_id FROM partner_branches WHERE id = ?').get(branchId);
    if (!branch) {
      return 'Partner branch does not exist';
    }

    if (companyId && branch.company_id !== Number(companyId)) {
      return 'Branch does not belong to the selected partner company';
    }
  }

  if (contractId) {
    const contract = db.prepare('SELECT id, company_id, branch_id FROM contracts WHERE id = ?').get(contractId);
    if (!contract) {
      return 'Contract does not exist';
    }

    if (companyId && contract.company_id !== Number(companyId)) {
      return 'Contract does not belong to the selected partner company';
    }

    if (branchId && contract.branch_id && contract.branch_id !== Number(branchId)) {
      return 'Contract does not belong to the selected branch';
    }
  }

  return null;
};

const create = (req, res) => {
  try {
    const {
      employee_id,
      shift_date,
      shift_type,
      note,
      company_id,
      branch_id,
      contract_id,
      assignment_role
    } = req.body;

    if (!employee_id || !shift_date || !shift_type) {
      return res.status(400).json({ success: false, message: 'Missing required fields: employee_id, shift_date, shift_type' });
    }

    const validationMessage = validateAssignment(employee_id, company_id, branch_id, contract_id);
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const result = db
      .prepare(`
        INSERT INTO shifts (
          employee_id, shift_date, shift_type, note, company_id, branch_id, contract_id, assignment_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        employee_id,
        shift_date,
        shift_type,
        note || null,
        company_id || null,
        branch_id || null,
        contract_id || null,
        assignment_role || 'guard'
      );

    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: shift, message: 'Shift created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const shiftId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Shift not found' });
    }

    const payload = {
      employee_id: req.body.employee_id ?? existing.employee_id,
      shift_date: req.body.shift_date ?? existing.shift_date,
      shift_type: req.body.shift_type ?? existing.shift_type,
      note: req.body.note ?? existing.note,
      company_id: req.body.company_id ?? existing.company_id,
      branch_id: req.body.branch_id ?? existing.branch_id,
      contract_id: req.body.contract_id ?? existing.contract_id,
      assignment_role: req.body.assignment_role ?? existing.assignment_role
    };

    const validationMessage = validateAssignment(payload.employee_id, payload.company_id, payload.branch_id, payload.contract_id);
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    db.prepare(`
      UPDATE shifts
      SET employee_id = ?, shift_date = ?, shift_type = ?, note = ?,
          company_id = ?, branch_id = ?, contract_id = ?, assignment_role = ?
      WHERE id = ?
    `).run(
      payload.employee_id,
      payload.shift_date,
      payload.shift_type,
      payload.note,
      payload.company_id,
      payload.branch_id,
      payload.contract_id,
      payload.assignment_role,
      shiftId
    );

    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
    return res.json({ success: true, data: shift, message: 'Shift updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const result = db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Shift not found' });
    }

    return res.json({ success: true, message: 'Shift deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  getMine,
  create,
  update,
  remove
};
