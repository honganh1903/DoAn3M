const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";

const VALID_CONTRACT_TYPES = ['probation', 'definite', 'indefinite'];
const VALID_STATUSES = ['active', 'expired', 'terminated', 'pending'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * GET /api/employee-contracts
 * Query params: employee_id, contract_type, status, page, limit
 */
const getAll = (req, res) => {
  try {
    const { employee_id, contract_type, status } = req.query;
    const paging = parsePagination(req.query);

    let whereClause = ' WHERE 1=1 ';
    const params = [];

    if (employee_id) {
      whereClause += ' AND ec.employee_id = ?';
      params.push(Number(employee_id));
    }

    if (contract_type) {
      whereClause += ' AND ec.contract_type = ?';
      params.push(contract_type);
    }

    if (status) {
      whereClause += ' AND ec.status = ?';
      params.push(status);
    }

    const total = db.prepare(`
      SELECT COUNT(1) AS total
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      ${whereClause}
    `).get(...params).total;

    const rows = db.prepare(`
      SELECT ec.*, ${NAME_SQL} AS employee_full_name
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      ${whereClause}
      ORDER BY ec.start_date DESC, ec.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, paging.limit, paging.offset);

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page: paging.page,
        limit: paging.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / paging.limit))
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/employee-contracts/:id
 */
const getById = (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT ec.*, ${NAME_SQL} AS employee_full_name
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      WHERE ec.id = ?
    `).get(req.params.id);

    if (!contract) {
      return res.status(404).json({ success: false, message: 'Employee contract not found' });
    }

    return res.json({ success: true, data: contract });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/employee-contracts/employee/:employeeId
 * Lấy tất cả hợp đồng của 1 nhân viên
 */
const getByEmployeeId = (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);

    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const contracts = db.prepare(`
      SELECT ec.*, ${NAME_SQL} AS employee_full_name
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      WHERE ec.employee_id = ?
      ORDER BY ec.start_date DESC, ec.id DESC
    `).all(employeeId);

    return res.json({ success: true, data: contracts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/employee-contracts/mine
 * Nhân viên xem hợp đồng của chính mình
 */
const getMine = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const contracts = db.prepare(`
      SELECT *
      FROM employee_contracts
      WHERE employee_id = ?
      ORDER BY start_date DESC, id DESC
    `).all(req.user.employee_id);

    return res.json({ success: true, data: contracts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/employee-contracts
 */
const create = (req, res) => {
  try {
    const {
      employee_id,
      contract_code,
      contract_type,
      position,
      department,
      base_salary,
      allowance,
      start_date,
      end_date,
      signing_date,
      signed_by,
      status,
      note
    } = req.body;

    // Validate required fields
    if (!employee_id || !contract_code || !start_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: employee_id, contract_code, start_date'
      });
    }

    // Validate employee exists
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employee_id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Validate contract_type
    const normalizedType = contract_type || 'definite';
    if (!VALID_CONTRACT_TYPES.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: `contract_type must be one of: ${VALID_CONTRACT_TYPES.join(', ')}`
      });
    }

    // Validate dates
    if (!DATE_RE.test(start_date)) {
      return res.status(400).json({ success: false, message: 'start_date must be in YYYY-MM-DD format' });
    }
    if (end_date && !DATE_RE.test(end_date)) {
      return res.status(400).json({ success: false, message: 'end_date must be in YYYY-MM-DD format' });
    }
    if (end_date && start_date > end_date) {
      return res.status(400).json({ success: false, message: 'start_date must be before or equal to end_date' });
    }
    if (signing_date && !DATE_RE.test(signing_date)) {
      return res.status(400).json({ success: false, message: 'signing_date must be in YYYY-MM-DD format' });
    }

    // Validate status
    const normalizedStatus = status || 'active';
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    // Check duplicate contract_code
    const existing = db.prepare('SELECT id FROM employee_contracts WHERE contract_code = ?').get(contract_code);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Contract code already exists'
      });
    }

    // Check if employee already has an active contract
    const activeContract = db.prepare(`
      SELECT id, contract_code FROM employee_contracts
      WHERE employee_id = ? AND status = 'active'
      LIMIT 1
    `).get(employee_id);

    const result = db.prepare(`
      INSERT INTO employee_contracts (
        employee_id, contract_code, contract_type, position, department,
        base_salary, allowance, start_date, end_date, signing_date, signed_by, status, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employee_id,
      contract_code,
      normalizedType,
      position || null,
      department || null,
      Number(base_salary || 0),
      Number(allowance || 0),
      start_date,
      end_date || null,
      signing_date || null,
      signed_by || null,
      normalizedStatus,
      note || null
    );

    const contract = db.prepare(`
      SELECT ec.*, ${NAME_SQL} AS employee_full_name
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      WHERE ec.id = ?
    `).get(result.lastInsertRowid);

    const response = {
      success: true,
      data: contract,
      message: 'Employee contract created successfully'
    };

    if (activeContract && normalizedStatus === 'active') {
      response.warning = `Employee already has an active contract (${activeContract.contract_code}). Consider updating its status.`;
    }

    return res.status(201).json(response);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: employee_contracts.contract_code')) {
      return res.status(409).json({ success: false, message: 'Contract code already exists' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/employee-contracts/:id
 */
const update = (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM employee_contracts WHERE id = ?').get(contractId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee contract not found' });
    }

    const payload = {
      employee_id: req.body.employee_id ?? existing.employee_id,
      contract_code: req.body.contract_code ?? existing.contract_code,
      contract_type: req.body.contract_type ?? existing.contract_type,
      position: req.body.position ?? existing.position,
      department: req.body.department ?? existing.department,
      base_salary: req.body.base_salary ?? existing.base_salary,
      allowance: req.body.allowance ?? existing.allowance,
      start_date: req.body.start_date ?? existing.start_date,
      end_date: req.body.end_date ?? existing.end_date,
      signing_date: req.body.signing_date ?? existing.signing_date,
      signed_by: req.body.signed_by ?? existing.signed_by,
      status: req.body.status ?? existing.status,
      note: req.body.note ?? existing.note
    };

    // Validate employee exists
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(payload.employee_id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Validate contract_type
    if (!VALID_CONTRACT_TYPES.includes(payload.contract_type)) {
      return res.status(400).json({
        success: false,
        message: `contract_type must be one of: ${VALID_CONTRACT_TYPES.join(', ')}`
      });
    }

    // Validate dates
    if (!DATE_RE.test(payload.start_date)) {
      return res.status(400).json({ success: false, message: 'start_date must be in YYYY-MM-DD format' });
    }
    if (payload.end_date && !DATE_RE.test(payload.end_date)) {
      return res.status(400).json({ success: false, message: 'end_date must be in YYYY-MM-DD format' });
    }
    if (payload.end_date && payload.start_date > payload.end_date) {
      return res.status(400).json({ success: false, message: 'start_date must be before or equal to end_date' });
    }
    if (payload.signing_date && !DATE_RE.test(payload.signing_date)) {
      return res.status(400).json({ success: false, message: 'signing_date must be in YYYY-MM-DD format' });
    }

    // Validate status
    if (!VALID_STATUSES.includes(payload.status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    // Check duplicate contract_code (excluding current)
    const duplicated = db.prepare(`
      SELECT id FROM employee_contracts WHERE contract_code = ? AND id != ?
    `).get(payload.contract_code, contractId);
    if (duplicated) {
      return res.status(409).json({ success: false, message: 'Contract code already exists' });
    }

    db.prepare(`
      UPDATE employee_contracts
      SET employee_id = ?, contract_code = ?, contract_type = ?, position = ?, department = ?,
          base_salary = ?, allowance = ?, start_date = ?, end_date = ?, signing_date = ?,
          signed_by = ?, status = ?, note = ?
      WHERE id = ?
    `).run(
      payload.employee_id,
      payload.contract_code,
      payload.contract_type,
      payload.position,
      payload.department,
      Number(payload.base_salary || 0),
      Number(payload.allowance || 0),
      payload.start_date,
      payload.end_date,
      payload.signing_date,
      payload.signed_by,
      payload.status,
      payload.note,
      contractId
    );

    const contract = db.prepare(`
      SELECT ec.*, ${NAME_SQL} AS employee_full_name
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      WHERE ec.id = ?
    `).get(contractId);

    return res.json({ success: true, data: contract, message: 'Employee contract updated successfully' });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: employee_contracts.contract_code')) {
      return res.status(409).json({ success: false, message: 'Contract code already exists' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/employee-contracts/:id
 * Soft delete - đổi trạng thái sang terminated
 */
const remove = (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM employee_contracts WHERE id = ?').get(contractId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee contract not found' });
    }

    db.prepare('UPDATE employee_contracts SET status = ? WHERE id = ?').run('terminated', contractId);

    return res.json({ success: true, message: 'Employee contract terminated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/employee-contracts/expiring-soon
 * Lấy danh sách hợp đồng sắp hết hạn (trong 30 ngày tới)
 */
const getExpiringSoon = (req, res) => {
  try {
    const daysAhead = Number(req.query.days || 30);
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

    const contracts = db.prepare(`
      SELECT ec.*, ${NAME_SQL} AS employee_full_name
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      WHERE ec.status = 'active'
        AND ec.end_date IS NOT NULL
        AND ec.end_date BETWEEN ? AND ?
      ORDER BY ec.end_date ASC
    `).all(today, futureDate);

    return res.json({
      success: true,
      data: contracts,
      filter: { from: today, to: futureDate, days_ahead: daysAhead }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/employee-contracts/stats
 * Thống kê hợp đồng lao động
 */
const getStats = (req, res) => {
  try {
    const byType = db.prepare(`
      SELECT contract_type, COUNT(1) AS count
      FROM employee_contracts
      WHERE status = 'active'
      GROUP BY contract_type
    `).all();

    const byStatus = db.prepare(`
      SELECT status, COUNT(1) AS count
      FROM employee_contracts
      GROUP BY status
    `).all();

    const totalActive = db.prepare(`
      SELECT COUNT(1) AS total FROM employee_contracts WHERE status = 'active'
    `).get().total;

    const totalEmployees = db.prepare(`
      SELECT COUNT(DISTINCT employee_id) AS total FROM employee_contracts WHERE status = 'active'
    `).get().total;

    const employeesWithoutContract = db.prepare(`
      SELECT COUNT(1) AS total FROM employees e
      WHERE e.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM employee_contracts ec
          WHERE ec.employee_id = e.id AND ec.status = 'active'
        )
    `).get().total;

    return res.json({
      success: true,
      data: {
        total_active_contracts: totalActive,
        total_employees_with_active_contract: totalEmployees,
        employees_without_active_contract: employeesWithoutContract,
        by_type: byType,
        by_status: byStatus
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  getById,
  getByEmployeeId,
  getMine,
  create,
  update,
  remove,
  getExpiringSoon,
  getStats
};
