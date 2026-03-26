const db = require('../config/db');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";

const calculateTotal = (baseSalary, bonus, deduction) => {
  return Number(baseSalary || 0) + Number(bonus || 0) - Number(deduction || 0);
};

const getAll = (req, res) => {
  try {
    const { month, employee_id } = req.query;
    let query = `
      SELECT s.*, ${NAME_SQL} AS full_name
      FROM salaries s
      JOIN employees e ON e.id = s.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (month) {
      query += ' AND s.month = ?';
      params.push(month);
    }

    if (employee_id) {
      query += ' AND s.employee_id = ?';
      params.push(employee_id);
    }

    query += ' ORDER BY s.month DESC, s.id DESC';

    const salaries = db.prepare(query).all(...params);
    return res.json({ success: true, data: salaries });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMine = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const salaries = db
      .prepare('SELECT * FROM salaries WHERE employee_id = ? ORDER BY month DESC, id DESC')
      .all(req.user.employee_id);

    return res.json({ success: true, data: salaries });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getById = (req, res) => {
  try {
    const salary = db
      .prepare(`
        SELECT s.*, ${NAME_SQL} AS full_name
        FROM salaries s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.id = ?
      `)
      .get(req.params.id);

    if (!salary) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    return res.json({ success: true, data: salary });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { employee_id, month, base_salary = 0, bonus = 0, deduction = 0, note } = req.body;

    if (!employee_id || !month) {
      return res.status(400).json({ success: false, message: 'Missing required fields: employee_id, month' });
    }

    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employee_id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee does not exist' });
    }

    const total = calculateTotal(base_salary, bonus, deduction);
    const result = db
      .prepare(`
        INSERT INTO salaries (employee_id, month, base_salary, bonus, deduction, total, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(employee_id, month, base_salary, bonus, deduction, total, note || null);

    const salary = db.prepare('SELECT * FROM salaries WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: salary, message: 'Salary record created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const salaryId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM salaries WHERE id = ?').get(salaryId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    const payload = {
      employee_id: req.body.employee_id ?? existing.employee_id,
      month: req.body.month ?? existing.month,
      base_salary: req.body.base_salary ?? existing.base_salary,
      bonus: req.body.bonus ?? existing.bonus,
      deduction: req.body.deduction ?? existing.deduction,
      note: req.body.note ?? existing.note,
      paid: req.body.paid ?? existing.paid
    };

    const total = calculateTotal(payload.base_salary, payload.bonus, payload.deduction);

    db.prepare(`
      UPDATE salaries
      SET employee_id = ?, month = ?, base_salary = ?, bonus = ?, deduction = ?, total = ?, note = ?, paid = ?
      WHERE id = ?
    `).run(
      payload.employee_id,
      payload.month,
      payload.base_salary,
      payload.bonus,
      payload.deduction,
      total,
      payload.note,
      payload.paid,
      salaryId
    );

    const salary = db.prepare('SELECT * FROM salaries WHERE id = ?').get(salaryId);
    return res.json({ success: true, data: salary, message: 'Salary record updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const markAsPaid = (req, res) => {
  try {
    const salaryId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM salaries WHERE id = ?').get(salaryId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    db.prepare('UPDATE salaries SET paid = 1 WHERE id = ?').run(salaryId);
    return res.json({ success: true, message: 'Salary marked as paid' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const result = db.prepare('DELETE FROM salaries WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    return res.json({ success: true, message: 'Salary record deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  getMine,
  getById,
  create,
  update,
  markAsPaid,
  remove
};
