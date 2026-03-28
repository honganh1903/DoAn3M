const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), full_name, '')";

const getAll = (req, res) => {
  try {
    const { name, status, department, employee_type, page = 1, limit = 10 } = req.query;
    let query = `
      SELECT id, first_name, last_name, avatar_url, ${NAME_SQL} AS full_name, birth_date, gender,
             id_card, social_insurance_no, employee_type, phone, address, department, hire_date, status, created_at
      FROM employees
      WHERE 1=1
    `;
    let countQuery = 'SELECT COUNT(*) AS total FROM employees WHERE 1=1';
    const params = [];

    if (name) {
      query += ` AND ${NAME_SQL} LIKE ?`;
      countQuery += ` AND ${NAME_SQL} LIKE ?`;
      params.push(`%${name}%`);
    }

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    if (department) {
      query += ' AND department = ?';
      countQuery += ' AND department = ?';
      params.push(department);
    }

    if (employee_type) {
      query += ' AND employee_type = ?';
      countQuery += ' AND employee_type = ?';
      params.push(employee_type);
    }

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';

    const pageNumber = Number(page) > 0 ? Number(page) : 1;
    const pageSize = Number(limit) > 0 ? Number(limit) : 10;
    const total = db.prepare(countQuery).get(...params).total;
    const employees = db.prepare(query).all(...params, pageSize, (pageNumber - 1) * pageSize);

    return res.json({
      success: true,
      data: employees,
      total,
      page: pageNumber,
      limit: pageSize
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getById = (req, res) => {
  try {
    const employeeId = Number(req.params.id);

    if (req.user.role === 'user' && req.user.employee_id !== employeeId) {
      return res.status(403).json({ success: false, message: 'You can only view your own profile' });
    }

    const employee = db.prepare(`
      SELECT id, first_name, last_name, avatar_url, ${NAME_SQL} AS full_name, birth_date, gender,
             id_card, social_insurance_no, employee_type, phone, address, department, hire_date, status, created_at
      FROM employees
      WHERE id = ?
    `).get(employeeId);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    return res.json({ success: true, data: employee });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const {
      first_name,
      last_name,
      avatar_url,
      birth_date,
      gender,
      id_card,
      social_insurance_no,
      employee_type,
      phone,
      address,
      department,
      hire_date,
      status
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ success: false, message: 'Missing required fields: first_name, last_name' });
    }

    const normalizedType = employee_type || 'guard';
    if (!['guard', 'hr'].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: 'employee_type must be guard or hr' });
    }

    const fullName = `${first_name} ${last_name}`.trim();

    const result = db
      .prepare(`
        INSERT INTO employees (
          first_name, last_name, full_name, avatar_url, birth_date, gender, id_card, social_insurance_no,
          employee_type, phone, address, department, hire_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        first_name,
        last_name,
        fullName,
        avatar_url || null,
        birth_date || null,
        gender || null,
        id_card || null,
        social_insurance_no || null,
        normalizedType,
        phone || null,
        address || null,
        department || null,
        hire_date || null,
        status || 'active'
      );

    const employee = db.prepare(`
      SELECT id, first_name, last_name, avatar_url, ${NAME_SQL} AS full_name, birth_date, gender,
             id_card, social_insurance_no, employee_type, phone, address, department, hire_date, status, created_at
      FROM employees
      WHERE id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({ success: true, data: employee, message: 'Employee created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const payload = {
      first_name: req.body.first_name ?? existing.first_name,
      last_name: req.body.last_name ?? existing.last_name,
      avatar_url: req.body.avatar_url ?? existing.avatar_url,
      birth_date: req.body.birth_date ?? existing.birth_date,
      gender: req.body.gender ?? existing.gender,
      id_card: req.body.id_card ?? existing.id_card,
      social_insurance_no: req.body.social_insurance_no ?? existing.social_insurance_no,
      employee_type: req.body.employee_type ?? existing.employee_type ?? 'guard',
      phone: req.body.phone ?? existing.phone,
      address: req.body.address ?? existing.address,
      department: req.body.department ?? existing.department,
      hire_date: req.body.hire_date ?? existing.hire_date,
      status: req.body.status ?? existing.status
    };

    if (!payload.first_name || !payload.last_name) {
      return res.status(400).json({ success: false, message: 'first_name and last_name cannot be empty' });
    }

    if (!['guard', 'hr'].includes(payload.employee_type)) {
      return res.status(400).json({ success: false, message: 'employee_type must be guard or hr' });
    }

    const fullName = `${payload.first_name} ${payload.last_name}`.trim();

    db.prepare(`
      UPDATE employees
      SET first_name = ?, last_name = ?, full_name = ?, avatar_url = ?, birth_date = ?, gender = ?, id_card = ?, social_insurance_no = ?,
          employee_type = ?, phone = ?, address = ?, department = ?, hire_date = ?, status = ?
      WHERE id = ?
    `).run(
      payload.first_name,
      payload.last_name,
      fullName,
      payload.avatar_url,
      payload.birth_date,
      payload.gender,
      payload.id_card,
      payload.social_insurance_no,
      payload.employee_type,
      payload.phone,
      payload.address,
      payload.department,
      payload.hire_date,
      payload.status,
      employeeId
    );

    const employee = db.prepare(`
      SELECT id, first_name, last_name, avatar_url, ${NAME_SQL} AS full_name, birth_date, gender,
             id_card, social_insurance_no, employee_type, phone, address, department, hire_date, status, created_at
      FROM employees
      WHERE id = ?
    `).get(employeeId);

    return res.json({ success: true, data: employee, message: 'Employee updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    db.prepare('UPDATE employees SET status = ? WHERE id = ?').run('resigned', employeeId);

    return res.json({ success: true, message: 'Employee status changed to resigned' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
