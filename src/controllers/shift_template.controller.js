const db = require('../config/db');

const VALID_WORK_PATTERNS = ['daily', 'work_even_rest_odd', 'work_odd_rest_even'];

const getAll = (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM shift_templates ORDER BY id DESC').all();
    return res.json({ success: true, data: templates });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getById = (req, res) => {
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

const create = (req, res) => {
  try {
    const { code, name, check_in_time, check_out_time, work_pattern = 'daily', note } = req.body;

    if (!code || !name || !check_in_time || !check_out_time) {
      return res.status(400).json({ success: false, message: 'Missing required fields: code, name, check_in_time, check_out_time' });
    }

    if (!VALID_WORK_PATTERNS.includes(work_pattern)) {
      return res.status(400).json({ success: false, message: 'work_pattern must be daily, work_even_rest_odd, or work_odd_rest_even' });
    }

    const result = db.prepare(`
      INSERT INTO shift_templates (code, name, check_in_time, check_out_time, work_pattern, note, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(code, name, check_in_time, check_out_time, work_pattern, note || null);

    const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: template, message: 'Shift template created successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Shift template not found' });
    }

    const payload = {
      code: req.body.code ?? existing.code,
      name: req.body.name ?? existing.name,
      check_in_time: req.body.check_in_time ?? existing.check_in_time,
      check_out_time: req.body.check_out_time ?? existing.check_out_time,
      work_pattern: req.body.work_pattern ?? existing.work_pattern,
      note: req.body.note ?? existing.note,
      status: req.body.status ?? existing.status
    };

    if (!VALID_WORK_PATTERNS.includes(payload.work_pattern)) {
      return res.status(400).json({ success: false, message: 'work_pattern must be daily, work_even_rest_odd, or work_odd_rest_even' });
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
    return res.json({ success: true, data: template, message: 'Shift template updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
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

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
