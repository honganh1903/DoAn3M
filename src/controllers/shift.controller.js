const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";
const VALID_SHIFT_CODES = ['DAY', 'NIGHT'];
const VALID_WORK_PATTERNS = ['daily'];
const getShiftTypeFromTemplate = (template) => (template?.code === 'NIGHT' ? 'night' : 'day');

const listTemplates = (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM shift_templates ORDER BY id ASC').all();
    return res.json({ success: true, data: templates });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getTemplateById = (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Shift template not found' });
    }

    return res.json({ success: true, data: template });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createTemplate = (req, res) => {
  try {
    const { code, name, check_in_time, check_out_time, work_pattern = 'daily', note } = req.body;
    const normalizedCode = String(code || '').trim().toUpperCase();

    if (!normalizedCode || !name || !check_in_time || !check_out_time) {
      return res.status(400).json({ success: false, message: 'Missing required fields: code, name, check_in_time, check_out_time' });
    }

    if (!VALID_SHIFT_CODES.includes(normalizedCode)) {
      return res.status(400).json({ success: false, message: 'code must be DAY or NIGHT' });
    }

    if (!VALID_WORK_PATTERNS.includes(work_pattern)) {
      return res.status(400).json({ success: false, message: 'work_pattern must be daily' });
    }

    const existingByCode = db.prepare('SELECT id FROM shift_templates WHERE code = ?').get(normalizedCode);
    if (existingByCode) {
      return res.status(400).json({ success: false, message: `Shift template ${normalizedCode} already exists` });
    }

    const result = db.prepare(`
      INSERT INTO shift_templates (code, name, check_in_time, check_out_time, work_pattern, note, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(normalizedCode, name, check_in_time, check_out_time, work_pattern, note || null);

    const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: template, message: 'Shift template created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateTemplate = (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Shift template not found' });
    }

    const payload = {
      code: String(req.body.code ?? existing.code).trim().toUpperCase(),
      name: req.body.name ?? existing.name,
      check_in_time: req.body.check_in_time ?? existing.check_in_time,
      check_out_time: req.body.check_out_time ?? existing.check_out_time,
      work_pattern: req.body.work_pattern ?? existing.work_pattern,
      note: req.body.note ?? existing.note,
      status: req.body.status ?? existing.status
    };

    if (!VALID_SHIFT_CODES.includes(payload.code)) {
      return res.status(400).json({ success: false, message: 'code must be DAY or NIGHT' });
    }

    if (!VALID_WORK_PATTERNS.includes(payload.work_pattern)) {
      return res.status(400).json({ success: false, message: 'work_pattern must be daily' });
    }

    const duplicateCode = db.prepare('SELECT id FROM shift_templates WHERE code = ? AND id != ?').get(payload.code, id);
    if (duplicateCode) {
      return res.status(400).json({ success: false, message: `Shift template ${payload.code} already exists` });
    }

    db.prepare(`
      UPDATE shift_templates
      SET code = ?, name = ?, check_in_time = ?, check_out_time = ?, work_pattern = ?, note = ?, status = ?
      WHERE id = ?
    `).run(
      payload.code,
      payload.name,
      payload.check_in_time,
      payload.check_out_time,
      payload.work_pattern,
      payload.note,
      payload.status,
      id
    );

    const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(id);

    db.prepare(`
      UPDATE shifts
      SET shift_type = ?
      WHERE shift_template_id = ?
    `).run(getShiftTypeFromTemplate(template), id);

    return res.json({ success: true, data: template, message: 'Shift template updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const removeTemplate = (req, res) => {
  try {
    const id = Number(req.params.id);
    const inUse = db.prepare('SELECT id FROM shifts WHERE shift_template_id = ? LIMIT 1').get(id);

    if (inUse) {
      return res.status(400).json({ success: false, message: 'Cannot delete shift template that is currently assigned' });
    }

    const result = db.prepare('UPDATE shift_templates SET status = ? WHERE id = ?').run('inactive', id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Shift template not found' });
    }

    return res.json({ success: true, message: 'Shift template marked as inactive' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAll = (req, res) => {
  try {
    const { employee_id, company_id, contract_id, shift_template_id, date, month } = req.query;
    let query = `
      SELECT s.*, ${NAME_SQL} AS full_name, c.company_name, ct.contract_code,
             st.code AS shift_code, st.name AS shift_name, st.check_in_time, st.check_out_time, st.work_pattern
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN partner_companies c ON c.id = s.company_id
      LEFT JOIN contracts ct ON ct.id = s.contract_id
      LEFT JOIN shift_templates st ON st.id = s.shift_template_id
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

    if (contract_id) {
      query += ' AND s.contract_id = ?';
      params.push(contract_id);
    }

    if (shift_template_id) {
      query += ' AND s.shift_template_id = ?';
      params.push(shift_template_id);
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
        SELECT s.*, c.company_name, ct.contract_code,
               st.code AS shift_code, st.name AS shift_name, st.check_in_time, st.check_out_time, st.work_pattern
        FROM shifts s
        LEFT JOIN partner_companies c ON c.id = s.company_id
        LEFT JOIN contracts ct ON ct.id = s.contract_id
        LEFT JOIN shift_templates st ON st.id = s.shift_template_id
        WHERE s.employee_id = ?
        ORDER BY s.shift_date DESC, s.id DESC
      `)
      .all(req.user.employee_id);

    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const validateAssignment = (employeeId, companyId, contractId, shiftTemplateId) => {
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) {
    return 'Employee does not exist';
  }

  const template = db.prepare("SELECT id, code FROM shift_templates WHERE id = ? AND status = 'active'").get(shiftTemplateId);
  if (!template) {
    return 'Shift template does not exist or inactive';
  }

  if (companyId) {
    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(companyId);
    if (!company) {
      return 'Partner company does not exist';
    }
  }

  if (contractId) {
    const contract = db.prepare('SELECT id, company_id FROM contracts WHERE id = ?').get(contractId);
    if (!contract) {
      return 'Contract does not exist';
    }

    if (companyId && contract.company_id !== Number(companyId)) {
      return 'Contract does not belong to the selected partner company';
    }
  }

  return null;
};

const getTemplate = (shiftTemplateId) => {
  return db.prepare('SELECT id, code FROM shift_templates WHERE id = ?').get(shiftTemplateId);
};

const getByEmployee = (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'employeeId is required' });
    }

    const shifts = db
      .prepare(`
        SELECT s.*, ${NAME_SQL} AS full_name, c.company_name, ct.contract_code,
               st.code AS shift_code, st.name AS shift_name, st.check_in_time, st.check_out_time, st.work_pattern
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        LEFT JOIN partner_companies c ON c.id = s.company_id
        LEFT JOIN contracts ct ON ct.id = s.contract_id
        LEFT JOIN shift_templates st ON st.id = s.shift_template_id
        WHERE s.employee_id = ?
        ORDER BY s.shift_date DESC, s.id DESC
      `)
      .all(employeeId);

    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { employee_id, shift_date, shift_template_id, note, company_id, contract_id, assignment_role } = req.body;

    if (!employee_id || !shift_date || !shift_template_id) {
      return res.status(400).json({ success: false, message: 'Missing required fields: employee_id, shift_date, shift_template_id' });
    }

    const validationMessage = validateAssignment(employee_id, company_id, contract_id, shift_template_id);
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const template = getTemplate(shift_template_id);

    const result = db
      .prepare(`
        INSERT INTO shifts (
          employee_id, shift_date, shift_type, shift_template_id, note, company_id, contract_id, assignment_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        employee_id,
        shift_date,
        getShiftTypeFromTemplate(template),
        shift_template_id,
        note || null,
        company_id || null,
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
      shift_template_id: req.body.shift_template_id ?? existing.shift_template_id,
      note: req.body.note ?? existing.note,
      company_id: req.body.company_id ?? existing.company_id,
      contract_id: req.body.contract_id ?? existing.contract_id,
      assignment_role: req.body.assignment_role ?? existing.assignment_role
    };

    if (!payload.shift_template_id) {
      return res.status(400).json({ success: false, message: 'shift_template_id is required' });
    }

    const validationMessage = validateAssignment(payload.employee_id, payload.company_id, payload.contract_id, payload.shift_template_id);
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const template = getTemplate(payload.shift_template_id);

    db.prepare(`
      UPDATE shifts
      SET employee_id = ?, shift_date = ?, shift_type = ?, shift_template_id = ?, note = ?,
          company_id = ?, contract_id = ?, assignment_role = ?
      WHERE id = ?
    `).run(
      payload.employee_id,
      payload.shift_date,
      getShiftTypeFromTemplate(template),
      payload.shift_template_id,
      payload.note,
      payload.company_id,
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
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  removeTemplate,
  getAll,
  getByEmployee,
  getMine,
  create,
  update,
  remove
};
