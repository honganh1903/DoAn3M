const db = require('../config/db');
const xlsx = require('xlsx');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";
const VALID_SHIFT_CODES = ['DAY', 'NIGHT'];
const VALID_WORK_PATTERNS = ['daily'];
const getShiftTypeFromTemplate = (template) => (template?.code === 'NIGHT' ? 'night' : 'day');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const toLocalDateText = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const toYearMonth = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};
const getCurrentYear = () => new Date().getFullYear();
const getCurrentYearMonth = () => toYearMonth(new Date());
const getMonthRange = (monthText) => {
  const [y, m] = String(monthText).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    date_from: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`,
    date_to: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  };
};
const validateAssignableDate = (shiftDate) => {
  if (!DATE_RE.test(String(shiftDate))) {
    return 'shift_date must be in YYYY-MM-DD format';
  }

  const currentYear = getCurrentYear();
  const currentYearMonth = getCurrentYearMonth();
  const targetYear = Number(String(shiftDate).slice(0, 4));
  const targetYearMonth = String(shiftDate).slice(0, 7);

  if (targetYear !== currentYear) {
    return `New assignments are allowed only in current year (${currentYear})`;
  }

  if (targetYearMonth < currentYearMonth) {
    return `New assignments are allowed only from current month (${currentYearMonth}) onward`;
  }

  return null;
};
const validateAssignableRange = (dateFrom, dateTo) => {
  const errFrom = validateAssignableDate(dateFrom);
  if (errFrom) {
    return errFrom;
  }

  if (!DATE_RE.test(String(dateTo))) {
    return 'date_to phải theo định dạng YYYY-MM-DD';
  }

  const currentYear = getCurrentYear();
  const targetYearTo = Number(String(dateTo).slice(0, 4));
  if (targetYearTo !== currentYear) {
    return `New assignments are allowed only in current year (${currentYear})`;
  }

  if (String(dateFrom) > String(dateTo)) {
    return 'date_from phải nhỏ hơn hoặc bằng date_to';
  }

  return null;
};
const getEmployee = (employeeId) => {
  return db.prepare('SELECT id, employee_type FROM employees WHERE id = ?').get(employeeId);
};
const getDefaultAssignmentRole = (employeeType) => {
  if (employeeType === 'hr') {
    return 'hr';
  }
  return 'guard';
};
const iterateDateRange = (dateFrom, dateTo, callback) => {
  let current = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  while (current <= end) {
    callback(toLocalDateText(current));
    current.setDate(current.getDate() + 1);
  }
};
const toDateTimeText = (dateObj) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mi = String(dateObj.getMinutes()).padStart(2, '0');
  const ss = String(dateObj.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};
const normalizeDateTimeInput = (value) => {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null || String(value).trim() === '') {
    return { ok: true, value: null };
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true, value: toDateTimeText(value) };
  }

  const raw = String(value).trim();
  if (DATETIME_RE.test(raw)) {
    return { ok: true, value: raw.replace('T', ' ').length === 16 ? `${raw.replace('T', ' ')}:00` : raw.replace('T', ' ') };
  }

  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh, mi, ss = '00'] = ddmmyyyy;
    return { ok: true, value: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}` };
  }

  return { ok: false, message: 'Ngày giờ phải theo định dạng YYYY-MM-DD HH:mm[:ss] hoặc DD/MM/YYYY HH:mm[:ss]' };
};
const getFirstNonEmpty = (row, keys) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return undefined;
};
const ASSIGNMENT_SELECT = `
  SELECT s.id, s.employee_id, s.shift_date, s.shift_type, s.shift_template_id,
         s.check_in_time_actual, s.check_out_time_actual, s.note,
         s.company_id, s.contract_id, s.assignment_role, s.created_at,
         ${NAME_SQL} AS full_name, c.company_name, ct.contract_code,
         st.code AS shift_code, st.name AS shift_name
`;

const shouldExportExcel = (req) => String(req.query.export || '').trim().toLowerCase() === 'excel';
const sendExcel = (res, fileName, sheets) => {
  const workbook = xlsx.utils.book_new();

  sheets.forEach((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const safeRows = rows.length > 0 ? rows : [{ message: 'Không có dữ liệu' }];
    const worksheet = xlsx.utils.json_to_sheet(safeRows);
    xlsx.utils.book_append_sheet(workbook, worksheet, sheet.name || 'Sheet1');
  });

  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}.xlsx\"`);
  return res.send(buffer);
};

const listTemplates = (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM shift_templates ORDER BY id ASC').all();
    if (shouldExportExcel(req)) {
      return sendExcel(res, 'shift_templates', [{ name: 'templates', rows: templates }]);
    }
    return res.json({ success: true, data: templates });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getTemplateById = (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu ca' });
    }

    if (shouldExportExcel(req)) {
      return sendExcel(res, `shift_template_${template.id}`, [{ name: 'template', rows: [template] }]);
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
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc: code, name, check_in_time, check_out_time' });
    }

    if (!VALID_SHIFT_CODES.includes(normalizedCode)) {
      return res.status(400).json({ success: false, message: 'code phải là DAY hoặc NIGHT' });
    }

    if (!VALID_WORK_PATTERNS.includes(work_pattern)) {
      return res.status(400).json({ success: false, message: 'work_pattern phải là daily' });
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
    return res.status(201).json({ success: true, data: template, message: 'Tạo mẫu ca thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateTemplate = (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu ca' });
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
      return res.status(400).json({ success: false, message: 'code phải là DAY hoặc NIGHT' });
    }

    if (!VALID_WORK_PATTERNS.includes(payload.work_pattern)) {
      return res.status(400).json({ success: false, message: 'work_pattern phải là daily' });
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

    return res.json({ success: true, data: template, message: 'Cập nhật mẫu ca thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const removeTemplate = (req, res) => {
  try {
    const id = Number(req.params.id);
    const inUse = db.prepare('SELECT id FROM shifts WHERE shift_template_id = ? LIMIT 1').get(id);

    if (inUse) {
      return res.status(400).json({ success: false, message: 'Không thể xóa mẫu ca đang được sử dụng' });
    }

    const result = db.prepare('UPDATE shift_templates SET status = ? WHERE id = ?').run('inactive', id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu ca' });
    }

    return res.json({ success: true, message: 'Đã đánh dấu mẫu ca ngừng hoạt động' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAll = (req, res) => {
  try {
    const {
      employee_id,
      company_id,
      contract_id,
      shift_template_id,
      date,
      month,
      date_from,
      date_to
    } = req.query;

    if (date_from && !DATE_RE.test(String(date_from))) {
      return res.status(400).json({ success: false, message: 'date_from phải theo định dạng YYYY-MM-DD' });
    }

    if (date_to && !DATE_RE.test(String(date_to))) {
      return res.status(400).json({ success: false, message: 'date_to phải theo định dạng YYYY-MM-DD' });
    }

    if (date_from && date_to && String(date_from) > String(date_to)) {
      return res.status(400).json({ success: false, message: 'date_from phải nhỏ hơn hoặc bằng date_to' });
    }

    let query = `
      ${ASSIGNMENT_SELECT}
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

    if (date_from) {
      query += ' AND s.shift_date >= ?';
      params.push(date_from);
    }

    if (date_to) {
      query += ' AND s.shift_date <= ?';
      params.push(date_to);
    }

    query += ' ORDER BY s.shift_date DESC, s.id DESC';

    const shifts = db.prepare(query).all(...params);
    if (shouldExportExcel(req)) {
      return sendExcel(res, 'shift_assignments', [{ name: 'assignments', rows: shifts }]);
    }
    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getMine = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'Tài khoản này chưa liên kết với nhân viên' });
    }

    const { date_from, date_to } = req.query;
    if (date_from && !DATE_RE.test(String(date_from))) {
      return res.status(400).json({ success: false, message: 'date_from phải theo định dạng YYYY-MM-DD' });
    }

    if (date_to && !DATE_RE.test(String(date_to))) {
      return res.status(400).json({ success: false, message: 'date_to phải theo định dạng YYYY-MM-DD' });
    }

    if (date_from && date_to && String(date_from) > String(date_to)) {
      return res.status(400).json({ success: false, message: 'date_from phải nhỏ hơn hoặc bằng date_to' });
    }

    let query = `
      ${ASSIGNMENT_SELECT}
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN partner_companies c ON c.id = s.company_id
      LEFT JOIN contracts ct ON ct.id = s.contract_id
      LEFT JOIN shift_templates st ON st.id = s.shift_template_id
      WHERE s.employee_id = ?
    `;
    const params = [req.user.employee_id];

    if (date_from) {
      query += ' AND s.shift_date >= ?';
      params.push(date_from);
    }

    if (date_to) {
      query += ' AND s.shift_date <= ?';
      params.push(date_to);
    }

    query += ' ORDER BY s.shift_date DESC, s.id DESC';

    const shifts = db
      .prepare(query)
      .all(...params);

    if (shouldExportExcel(req)) {
      return sendExcel(res, `my_shift_assignments_${req.user.employee_id}`, [{ name: 'assignments', rows: shifts }]);
    }

    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const validateAssignment = (
  employeeId,
  companyId,
  contractId,
  shiftTemplateId,
  shiftDate,
  currentShiftId = null,
  options = {}
) => {
  const skipCapacityCheck = Boolean(options.skipCapacityCheck);
  const employee = getEmployee(employeeId);
  if (!employee) {
    return 'Nhân viên không tồn tại';
  }

  const template = db.prepare("SELECT id, code FROM shift_templates WHERE id = ? AND status = 'active'").get(shiftTemplateId);
  if (!template) {
    return 'Mẫu ca không tồn tại hoặc đã ngừng hoạt động';
  }

  if (companyId) {
    const company = db.prepare('SELECT id FROM partner_companies WHERE id = ?').get(companyId);
    if (!company) {
      return 'Công ty đối tác không tồn tại';
    }
  }

  if (shiftDate) {
    const duplicateSameDate = db.prepare(`
      SELECT s.id
      FROM shifts s
      WHERE s.employee_id = ?
        AND s.shift_date = ?
        AND (? IS NULL OR s.id != ?)
      LIMIT 1
    `).get(employeeId, shiftDate, currentShiftId, currentShiftId);

    if (duplicateSameDate) {
      return 'Employee already has an assigned shift on this date';
    }
  }

  if (contractId) {
    const contract = db.prepare('SELECT id, company_id, contract_code, start_date, end_date, guard_quantity FROM contracts WHERE id = ?').get(contractId);
    if (!contract) {
      return 'Contract does not exist';
    }

    if (companyId && contract.company_id !== Number(companyId)) {
      return 'Contract does not belong to the selected partner company';
    }

    if (shiftDate) {
      const contractStart = contract.start_date || shiftDate;
      const contractEnd = contract.end_date || shiftDate;
      if (shiftDate < contractStart || shiftDate > contractEnd) {
        return `Shift date must be within contract period (${contractStart} to ${contractEnd})`;
      }
    }

    const newStart = contract.start_date || shiftDate;
    const newEnd = contract.end_date || shiftDate;
    const crossCompanyConflict = db.prepare(`
      SELECT s.id, ct.contract_code, c.company_name
      FROM shifts s
      JOIN contracts ct ON ct.id = s.contract_id
      LEFT JOIN partner_companies c ON c.id = ct.company_id
      WHERE s.employee_id = ?
        AND ct.company_id != ?
        AND (? IS NULL OR s.id != ?)
        AND NOT (
          COALESCE(ct.end_date, s.shift_date) < ?
          OR COALESCE(ct.start_date, s.shift_date) > ?
        )
      ORDER BY s.id DESC
      LIMIT 1
    `).get(employeeId, contract.company_id, currentShiftId, currentShiftId, newStart, newEnd);

    if (crossCompanyConflict) {
      return `Employee is already assigned to another company contract (${crossCompanyConflict.contract_code || 'N/A'} - ${crossCompanyConflict.company_name || 'Unknown'}) in overlapping period`;
    }

    if (!skipCapacityCheck && shiftDate && Number(contract.guard_quantity) > 0) {
      const assignedCount = db.prepare(`
        SELECT COUNT(DISTINCT s.employee_id) AS total
        FROM shifts s
        WHERE s.contract_id = ?
          AND s.shift_date = ?
          AND (? IS NULL OR s.id != ?)
      `).get(contract.id, shiftDate, currentShiftId, currentShiftId).total;

      if (Number(assignedCount) >= Number(contract.guard_quantity)) {
        return `Contract ${contract.contract_code || contract.id} already reached required employee quantity (${contract.guard_quantity}) on ${shiftDate}`;
      }
    }
  }

  return null;
};

const getTemplate = (shiftTemplateId) => {
  return db.prepare('SELECT id, code FROM shift_templates WHERE id = ?').get(shiftTemplateId);
};

const getAssignmentCandidates = (req, res) => {
  try {
    const { date, date_from, date_to, month } = req.query;
    const requestedStatus = String(req.query.assignment_status || 'all').trim().toLowerCase();
    const onlyUnassigned = String(req.query.only_unassigned ?? 'true').toLowerCase() !== 'false';

    if (!['all', 'available', 'busy', 'fully_assigned'].includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: 'assignment_status phải là all, available, busy hoặc fully_assigned'
      });
    }

    let rangeFrom;
    let rangeTo;
    if (month) {
      const monthText = String(month);
      if (!/^\d{4}-\d{2}$/.test(monthText)) {
        return res.status(400).json({ success: false, message: 'month phải theo định dạng YYYY-MM' });
      }
      const monthRange = getMonthRange(monthText);
      rangeFrom = monthRange.date_from;
      rangeTo = monthRange.date_to;
    } else {
      rangeFrom = date_from || date;
      rangeTo = date_to || date;
      if (!rangeFrom || !rangeTo) {
        return res.status(400).json({
          success: false,
          message: 'Cung cấp month=YYYY-MM hoặc date=YYYY-MM-DD hoặc date_from/date_to'
        });
      }
    }

    if (!DATE_RE.test(String(rangeFrom)) || !DATE_RE.test(String(rangeTo))) {
      return res.status(400).json({ success: false, message: 'date_from/date_to phải theo định dạng YYYY-MM-DD' });
    }

    if (String(rangeFrom) > String(rangeTo)) {
      return res.status(400).json({ success: false, message: 'date_from phải nhỏ hơn hoặc bằng date_to' });
    }

    const rows = db.prepare(`
      SELECT e.id AS employee_id,
             ${NAME_SQL} AS full_name,
             e.employee_type,
             e.status AS employee_status
      FROM employees e
      WHERE e.status = 'active'
      ORDER BY full_name ASC, e.id ASC
    `).all();

    const candidates = rows.map((row) => {
      let totalDays = 0;
      let availableDays = 0;
      let blockedDays = 0;
      let firstConflict = null;
      let latestExistingAssignment = null;

      iterateDateRange(rangeFrom, rangeTo, (shiftDate) => {
        totalDays += 1;
        const existing = db.prepare(`
          SELECT s.id, s.company_id, s.contract_id, c.company_name, ct.contract_code
          FROM shifts s
          LEFT JOIN partner_companies c ON c.id = s.company_id
          LEFT JOIN contracts ct ON ct.id = s.contract_id
          WHERE s.employee_id = ? AND s.shift_date = ?
          LIMIT 1
        `).get(row.employee_id, shiftDate);

        if (existing) {
          blockedDays += 1;
          if (!firstConflict) {
            firstConflict = { shift_date: shiftDate, reason: 'Already has assigned shift' };
          }
          if (!latestExistingAssignment && existing) {
            latestExistingAssignment = {
              shift_id: existing.id,
              company_id: existing.company_id,
              company_name: existing.company_name,
              contract_id: existing.contract_id,
              contract_code: existing.contract_code
            };
          }
        } else {
          availableDays += 1;
        }
      });

      const assignment_status = blockedDays === 0 ? 'available' : 'busy';

      return {
        employee_id: row.employee_id,
        full_name: row.full_name,
        employee_type: row.employee_type,
        employee_status: row.employee_status,
        assignment_status,
        metrics: {
          total_days: totalDays,
          available_days: availableDays,
          blocked_days: blockedDays
        },
        first_conflict: firstConflict,
        existing_assignment: latestExistingAssignment
      };
    }).filter((item) => {
      if (onlyUnassigned && item.assignment_status !== 'available') {
        return false;
      }
      if (requestedStatus === 'all') {
        return true;
      }
      if (requestedStatus === 'fully_assigned') {
        return item.metrics.blocked_days === item.metrics.total_days;
      }
      return item.assignment_status === requestedStatus;
    });

    if (shouldExportExcel(req)) {
      const exportRows = candidates.map((item) => ({
        employee_id: item.employee_id,
        full_name: item.full_name,
        employee_type: item.employee_type,
        employee_status: item.employee_status,
        assignment_status: item.assignment_status,
        total_days: item.metrics.total_days,
        available_days: item.metrics.available_days,
        blocked_days: item.metrics.blocked_days,
        first_conflict_date: item.first_conflict?.shift_date || null,
        first_conflict_reason: item.first_conflict?.reason || null,
        existing_shift_id: item.existing_assignment?.shift_id || null,
        existing_company_id: item.existing_assignment?.company_id || null,
        existing_company_name: item.existing_assignment?.company_name || null,
        existing_contract_id: item.existing_assignment?.contract_id || null,
        existing_contract_code: item.existing_assignment?.contract_code || null
      }));
      return sendExcel(res, 'assignment_candidates', [{ name: 'candidates', rows: exportRows }]);
    }

    return res.json({
      success: true,
      data: {
        date_from: rangeFrom,
        date_to: rangeTo,
        month: month || null,
        only_unassigned: onlyUnassigned,
        assignment_status: requestedStatus,
        candidates
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getByEmployee = (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { date, month, date_from, date_to } = req.query;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'employeeId là bắt buộc' });
    }

    if (date && !DATE_RE.test(String(date))) {
      return res.status(400).json({ success: false, message: 'date phải theo định dạng YYYY-MM-DD' });
    }

    if (month && !/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ success: false, message: 'month phải theo định dạng YYYY-MM' });
    }

    if (date_from && !DATE_RE.test(String(date_from))) {
      return res.status(400).json({ success: false, message: 'date_from phải theo định dạng YYYY-MM-DD' });
    }

    if (date_to && !DATE_RE.test(String(date_to))) {
      return res.status(400).json({ success: false, message: 'date_to phải theo định dạng YYYY-MM-DD' });
    }

    if (date_from && date_to && String(date_from) > String(date_to)) {
      return res.status(400).json({ success: false, message: 'date_from phải nhỏ hơn hoặc bằng date_to' });
    }

    let query = `
      ${ASSIGNMENT_SELECT}
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN partner_companies c ON c.id = s.company_id
      LEFT JOIN contracts ct ON ct.id = s.contract_id
      LEFT JOIN shift_templates st ON st.id = s.shift_template_id
      WHERE s.employee_id = ?
    `;
    const params = [employeeId];

    if (date) {
      query += ' AND s.shift_date = ?';
      params.push(date);
    }

    if (month) {
      query += ' AND substr(s.shift_date, 1, 7) = ?';
      params.push(month);
    }

    if (date_from) {
      query += ' AND s.shift_date >= ?';
      params.push(date_from);
    }

    if (date_to) {
      query += ' AND s.shift_date <= ?';
      params.push(date_to);
    }

    query += ' ORDER BY s.shift_date DESC, s.id DESC';

    const shifts = db.prepare(query).all(...params);
    if (shouldExportExcel(req)) {
      return sendExcel(res, `employee_${employeeId}_assignments`, [{ name: 'assignments', rows: shifts }]);
    }

    return res.json({ success: true, data: shifts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { employee_id, shift_date, shift_template_id, note, check_in_time_actual, check_out_time_actual } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body, 'contract_id')) {
      return res.status(400).json({
        success: false,
        message: 'contract_id không được phép ở endpoint này. Dùng /assignments/contracts/:contractId/members'
      });
    }

    if (!employee_id || !shift_date || !shift_template_id) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc: employee_id, shift_date, shift_template_id' });
    }

    const rangePolicyMessage = validateAssignableDate(shift_date);
    if (rangePolicyMessage) {
      return res.status(400).json({ success: false, message: rangePolicyMessage });
    }

    const resolvedShiftTemplateId = Number(shift_template_id);
    const validationMessage = validateAssignment(employee_id, null, null, resolvedShiftTemplateId, shift_date);
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const normalizedCheckIn = normalizeDateTimeInput(check_in_time_actual);
    if (!normalizedCheckIn.ok) {
      return res.status(400).json({ success: false, message: `check_in_time_actual invalid: ${normalizedCheckIn.message}` });
    }
    const normalizedCheckOut = normalizeDateTimeInput(check_out_time_actual);
    if (!normalizedCheckOut.ok) {
      return res.status(400).json({ success: false, message: `check_out_time_actual invalid: ${normalizedCheckOut.message}` });
    }

    const template = getTemplate(resolvedShiftTemplateId);

    const employee = getEmployee(employee_id);
    const finalAssignmentRole = getDefaultAssignmentRole(employee?.employee_type);

    const result = db
      .prepare(`
        INSERT INTO shifts (
          employee_id, shift_date, shift_type, shift_template_id, check_in_time_actual, check_out_time_actual,
          note, company_id, contract_id, assignment_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        employee_id,
        shift_date,
        getShiftTypeFromTemplate(template),
        resolvedShiftTemplateId,
        normalizedCheckIn.value ?? null,
        normalizedCheckOut.value ?? null,
        note || null,
        null,
        null,
        finalAssignmentRole
      );

    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, data: shift, message: 'Tạo ca làm việc thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const shiftId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc' });
    }

    const payload = {
      employee_id: req.body.employee_id ?? existing.employee_id,
      shift_date: req.body.shift_date ?? existing.shift_date,
      shift_template_id: req.body.shift_template_id ?? existing.shift_template_id,
      check_in_time_actual: req.body.check_in_time_actual ?? existing.check_in_time_actual,
      check_out_time_actual: req.body.check_out_time_actual ?? existing.check_out_time_actual,
      note: req.body.note ?? existing.note,
      company_id: req.body.company_id ?? existing.company_id,
      contract_id: req.body.contract_id ?? existing.contract_id,
      assignment_role: req.body.assignment_role ?? existing.assignment_role
    };

    if (!payload.shift_template_id) {
      return res.status(400).json({ success: false, message: 'shift_template_id là bắt buộc' });
    }

    const rangePolicyMessage = validateAssignableDate(payload.shift_date);
    if (rangePolicyMessage) {
      return res.status(400).json({ success: false, message: rangePolicyMessage });
    }

    const validationMessage = validateAssignment(
      payload.employee_id,
      payload.company_id,
      payload.contract_id,
      payload.shift_template_id,
      payload.shift_date,
      shiftId
    );
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const normalizedCheckIn = normalizeDateTimeInput(payload.check_in_time_actual);
    if (!normalizedCheckIn.ok) {
      return res.status(400).json({ success: false, message: `check_in_time_actual invalid: ${normalizedCheckIn.message}` });
    }
    const normalizedCheckOut = normalizeDateTimeInput(payload.check_out_time_actual);
    if (!normalizedCheckOut.ok) {
      return res.status(400).json({ success: false, message: `check_out_time_actual invalid: ${normalizedCheckOut.message}` });
    }

    const template = getTemplate(payload.shift_template_id);
    const resolvedContract = payload.contract_id ? db.prepare('SELECT id, company_id FROM contracts WHERE id = ?').get(payload.contract_id) : null;
    const resolvedCompanyId = resolvedContract ? resolvedContract.company_id : (payload.company_id || null);
    const employee = getEmployee(payload.employee_id);
    const finalAssignmentRole = req.body.assignment_role ?? payload.assignment_role ?? getDefaultAssignmentRole(employee?.employee_type);

    db.prepare(`
      UPDATE shifts
      SET employee_id = ?, shift_date = ?, shift_type = ?, shift_template_id = ?,
          check_in_time_actual = ?, check_out_time_actual = ?, note = ?,
          company_id = ?, contract_id = ?, assignment_role = ?
      WHERE id = ?
    `).run(
      payload.employee_id,
      payload.shift_date,
      getShiftTypeFromTemplate(template),
      payload.shift_template_id,
      normalizedCheckIn.value ?? null,
      normalizedCheckOut.value ?? null,
      payload.note,
      resolvedCompanyId,
      payload.contract_id,
      finalAssignmentRole,
      shiftId
    );

    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
    return res.json({ success: true, data: shift, message: 'Cập nhật ca làm việc thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const result = db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc' });
    }

    return res.json({ success: true, message: 'Xóa ca làm việc thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createRange = (req, res) => {
  try {
    const {
      employee_id,
      date_from,
      date_to,
      note,
      shift_template_id,
      check_in_time_actual,
      check_out_time_actual
    } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body, 'contract_id')) {
      return res.status(400).json({
        success: false,
        message: 'contract_id không được phép ở endpoint này. Dùng /assignments/contracts/:contractId/members'
      });
    }

    if (!employee_id || !date_from || !date_to || !shift_template_id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: employee_id, shift_template_id, date_from, date_to'
      });
    }

    const rangePolicyMessage = validateAssignableRange(String(date_from), String(date_to));
    if (rangePolicyMessage) {
      return res.status(400).json({ success: false, message: rangePolicyMessage });
    }

    const resolvedShiftTemplateId = Number(shift_template_id);

    const template = getTemplate(resolvedShiftTemplateId);
    if (!template) {
      return res.status(400).json({ success: false, message: 'Mẫu ca không tồn tại' });
    }

    const shiftType = getShiftTypeFromTemplate(template);
    const employee = getEmployee(employee_id);
    const finalAssignmentRole = getDefaultAssignmentRole(employee?.employee_type);
    const normalizedCheckIn = normalizeDateTimeInput(check_in_time_actual);
    if (!normalizedCheckIn.ok) {
      return res.status(400).json({ success: false, message: `check_in_time_actual invalid: ${normalizedCheckIn.message}` });
    }
    const normalizedCheckOut = normalizeDateTimeInput(check_out_time_actual);
    if (!normalizedCheckOut.ok) {
      return res.status(400).json({ success: false, message: `check_out_time_actual invalid: ${normalizedCheckOut.message}` });
    }

    const insertStmt = db.prepare(`
      INSERT INTO shifts (
        employee_id, shift_date, shift_type, shift_template_id, check_in_time_actual, check_out_time_actual,
        note, company_id, contract_id, assignment_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      const created = [];
      const conflicts = [];

      let current = new Date(`${date_from}T00:00:00`);
      const end = new Date(`${date_to}T00:00:00`);

      while (current <= end) {
        const shiftDate = toLocalDateText(current);
        const validationMessage = validateAssignment(
          employee_id,
          null,
          null,
          resolvedShiftTemplateId,
          shiftDate
        );

        if (validationMessage) {
          conflicts.push({ shift_date: shiftDate, reason: validationMessage });
          current.setDate(current.getDate() + 1);
          continue;
        }

        const result = insertStmt.run(
          employee_id,
          shiftDate,
          shiftType,
          resolvedShiftTemplateId,
          normalizedCheckIn.value ?? null,
          normalizedCheckOut.value ?? null,
          note || null,
          null,
          null,
          finalAssignmentRole
        );
        created.push({ shift_id: Number(result.lastInsertRowid), shift_date: shiftDate });

        current.setDate(current.getDate() + 1);
      }

      return {
        created,
        conflicts
      };
    });

    const result = tx();

    return res.status(201).json({
      success: true,
      message: 'Phân công theo khoảng thời gian đã được xử lý',
      data: {
        employee_id,
        date_from,
        date_to,
        summary: {
          created: result.created.length,
          conflicts: result.conflicts.length
        },
        created: result.created,
        conflicts: result.conflicts
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getContractCandidates = (req, res) => {
  try {
    const contractId = Number(req.params.contractId);
    const suitableOnly = String(req.query.suitable_only ?? 'true').toLowerCase() !== 'false';

    if (!contractId) {
      return res.status(400).json({ success: false, message: 'contractId là bắt buộc' });
    }

    const contract = db.prepare(`
      SELECT id, company_id, contract_code, start_date, end_date, guard_quantity, shift_template_id
      FROM contracts
      WHERE id = ?
    `).get(contractId);

    if (!contract) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
    }

    const shiftTemplateId = contract.shift_template_id || null;
    if (!shiftTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'Hợp đồng chưa cấu hình mẫu ca. Vui lòng cập nhật mẫu ca cho hợp đồng trước.'
      });
    }

    const template = getTemplate(shiftTemplateId);
    if (!template) {
      return res.status(400).json({ success: false, message: 'Mẫu ca không tồn tại' });
    }

    const dateFrom = req.query.date_from || contract.start_date;
    const dateTo = req.query.date_to || contract.end_date;

    if (!dateFrom || !dateTo || !DATE_RE.test(String(dateFrom)) || !DATE_RE.test(String(dateTo))) {
      return res.status(400).json({ success: false, message: 'date_from/date_to phải hợp lệ theo định dạng YYYY-MM-DD' });
    }

    const rangePolicyMessage = validateAssignableRange(String(dateFrom), String(dateTo));
    if (rangePolicyMessage) {
      return res.status(400).json({ success: false, message: rangePolicyMessage });
    }

    const assignedMembers = db.prepare(`
      SELECT
        s.employee_id,
        ${NAME_SQL} AS full_name,
        e.employee_type,
        MIN(s.shift_date) AS first_shift_date,
        MAX(s.shift_date) AS last_shift_date,
        COUNT(*) AS total_shifts
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.contract_id = ?
        AND s.shift_date BETWEEN ? AND ?
      GROUP BY s.employee_id, e.employee_type, e.first_name, e.last_name, e.full_name
      ORDER BY full_name ASC, s.employee_id ASC
    `).all(contract.id, dateFrom, dateTo);
    const assignedMemberIdSet = new Set(assignedMembers.map((item) => Number(item.employee_id)));

    const employees = db.prepare(`
      SELECT e.id AS employee_id,
             ${NAME_SQL} AS full_name,
             e.employee_type,
             e.status AS employee_status
      FROM employees e
      WHERE e.status = 'active'
      ORDER BY full_name ASC, e.id ASC
    `).all().filter((employee) => !assignedMemberIdSet.has(Number(employee.employee_id)));

    const candidates = employees.map((employee) => {
      let totalDays = 0;
      let availableDays = 0;
      let blockedDays = 0;
      let firstConflict = null;

      iterateDateRange(dateFrom, dateTo, (shiftDate) => {
        totalDays += 1;
        const existing = db.prepare(`
          SELECT id, contract_id
          FROM shifts
          WHERE employee_id = ? AND shift_date = ?
          LIMIT 1
        `).get(employee.employee_id, shiftDate);

        const currentShiftId = existing && existing.contract_id === contract.id ? existing.id : null;
        const validationMessage = validateAssignment(
          employee.employee_id,
          contract.company_id,
          contract.id,
          shiftTemplateId,
          shiftDate,
          currentShiftId,
          { skipCapacityCheck: true }
        );

        if (validationMessage) {
          blockedDays += 1;
          if (!firstConflict) {
            firstConflict = { shift_date: shiftDate, reason: validationMessage };
          }
        } else {
          availableDays += 1;
        }
      });

      return {
        employee_id: employee.employee_id,
        full_name: employee.full_name,
        employee_type: employee.employee_type,
        employee_status: employee.employee_status,
        suitable_for_full_range: blockedDays === 0,
        metrics: {
          total_days: totalDays,
          available_days: availableDays,
          blocked_days: blockedDays
        },
        first_conflict: firstConflict
      };
    }).filter((item) => (suitableOnly ? item.suitable_for_full_range : true));

    if (shouldExportExcel(req)) {
      const candidateRows = candidates.map((item) => ({
        employee_id: item.employee_id,
        full_name: item.full_name,
        employee_type: item.employee_type,
        employee_status: item.employee_status,
        suitable_for_full_range: item.suitable_for_full_range,
        total_days: item.metrics.total_days,
        available_days: item.metrics.available_days,
        blocked_days: item.metrics.blocked_days,
        first_conflict_date: item.first_conflict?.shift_date || null,
        first_conflict_reason: item.first_conflict?.reason || null
      }));
      return sendExcel(res, `contract_${contract.id}_candidates`, [
        { name: 'assigned_members', rows: assignedMembers },
        { name: 'candidates', rows: candidateRows }
      ]);
    }

    return res.json({
      success: true,
      data: {
        contract_id: contract.id,
        contract_code: contract.contract_code,
        company_id: contract.company_id,
        guard_quantity: contract.guard_quantity,
        shift_template_id: shiftTemplateId,
        shift_code: template?.code || null,
        date_from: dateFrom,
        date_to: dateTo,
        suitable_only: suitableOnly,
        assigned_members_count: assignedMembers.length,
        assigned_members: assignedMembers,
        candidates
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const syncContractMembers = (req, res) => {
  try {
    const contractId = Number(req.params.contractId);
    const { employee_ids, note } = req.body;

    if (!contractId || !Array.isArray(employee_ids)) {
      return res.status(400).json({
        success: false,
        message: 'contractId và employee_ids (mảng) là bắt buộc'
      });
    }

    const uniqueEmployeeIds = [...new Set(employee_ids.map((item) => Number(item)).filter(Boolean))];
    if (uniqueEmployeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'employee_ids phải chứa ít nhất một id nhân viên hợp lệ' });
    }

    const contract = db.prepare(`
      SELECT id, company_id, contract_code, guard_quantity, start_date, end_date, shift_template_id
      FROM contracts
      WHERE id = ?
    `).get(contractId);

    if (!contract) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
    }

    const resolvedShiftTemplateId = Number(contract.shift_template_id);
    if (!resolvedShiftTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'Hợp đồng chưa cấu hình mẫu ca. Vui lòng cập nhật mẫu ca cho hợp đồng trước.'
      });
    }

    const template = getTemplate(resolvedShiftTemplateId);
    if (!template) {
      return res.status(400).json({ success: false, message: 'Mẫu ca không tồn tại' });
    }

    const rangeFrom = contract.start_date;
    const rangeTo = contract.end_date;

    if (!rangeFrom || !rangeTo || !DATE_RE.test(String(rangeFrom)) || !DATE_RE.test(String(rangeTo))) {
      return res.status(400).json({
        success: false,
        message: 'Hợp đồng phải có start_date và end_date hợp lệ (YYYY-MM-DD)'
      });
    }

    const rangePolicyMessage = validateAssignableRange(String(rangeFrom), String(rangeTo));
    if (rangePolicyMessage) {
      return res.status(400).json({ success: false, message: rangePolicyMessage });
    }

    if (Number(contract.guard_quantity) > 0 && uniqueEmployeeIds.length > Number(contract.guard_quantity)) {
      return res.status(400).json({
        success: false,
        message: `Số nhân viên được chọn vượt quá số lượng bảo vệ yêu cầu của hợp đồng (${contract.guard_quantity})`
      });
    }

    const existingContractMembers = db.prepare(`
      SELECT DISTINCT employee_id
      FROM shifts
      WHERE contract_id = ?
        AND shift_date BETWEEN ? AND ?
    `).all(contract.id, rangeFrom, rangeTo).map((row) => Number(row.employee_id));
    const existingMemberSet = new Set(existingContractMembers);
    const addedNewMembers = uniqueEmployeeIds.filter((employeeId) => !existingMemberSet.has(Number(employeeId)));
    const today = new Date().toISOString().slice(0, 10);
    if (addedNewMembers.length > 0 && String(contract.start_date) < today) {
      return res.status(400).json({
        success: false,
        message: `Không thể thêm thành viên mới sau ngày bắt đầu hợp đồng (${contract.start_date}). Thành viên mới: ${addedNewMembers.join(', ')}`
      });
    }

    const tx = db.transaction(() => {
      const conflicts = [];

      iterateDateRange(rangeFrom, rangeTo, (shiftDate) => {
        uniqueEmployeeIds.forEach((employeeId) => {
          const sameDate = db.prepare(`
            SELECT id, contract_id
            FROM shifts
            WHERE employee_id = ? AND shift_date = ?
            LIMIT 1
          `).get(employeeId, shiftDate);

          const currentShiftId = sameDate && sameDate.contract_id === contract.id ? sameDate.id : null;
          const validationMessage = validateAssignment(
            employeeId,
            contract.company_id,
            contract.id,
            resolvedShiftTemplateId,
            shiftDate,
            currentShiftId,
            { skipCapacityCheck: true }
          );

          if (validationMessage) {
            conflicts.push({ employee_id: employeeId, shift_date: shiftDate, reason: validationMessage });
          }
        });
      });

      if (conflicts.length > 0) {
        const first = conflicts[0];
        throw new Error(`Conflict at ${first.shift_date} for employee ${first.employee_id}: ${first.reason}`);
      }

      const removed = db.prepare(`
        DELETE FROM shifts
        WHERE contract_id = ?
          AND shift_date BETWEEN ? AND ?
          AND employee_id NOT IN (${uniqueEmployeeIds.map(() => '?').join(',')})
      `).run(contract.id, rangeFrom, rangeTo, ...uniqueEmployeeIds).changes;

      const shiftType = getShiftTypeFromTemplate(template);
      const created = [];
      const updated = [];

      iterateDateRange(rangeFrom, rangeTo, (shiftDate) => {
        uniqueEmployeeIds.forEach((employeeId) => {
          const employee = getEmployee(employeeId);
          const finalRole = getDefaultAssignmentRole(employee?.employee_type);
          const existing = db.prepare(`
            SELECT id, contract_id
            FROM shifts
            WHERE employee_id = ? AND shift_date = ?
            LIMIT 1
          `).get(employeeId, shiftDate);

          if (existing && existing.contract_id === contract.id) {
            db.prepare(`
              UPDATE shifts
              SET shift_type = ?, shift_template_id = ?, note = ?, company_id = ?, contract_id = ?, assignment_role = ?
              WHERE id = ?
            `).run(
              shiftType,
              resolvedShiftTemplateId,
              note || null,
              contract.company_id,
              contract.id,
              finalRole,
              existing.id
            );
            updated.push({ shift_id: existing.id, employee_id: employeeId, shift_date: shiftDate });
          } else {
            const result = db.prepare(`
              INSERT INTO shifts (
                employee_id, shift_date, shift_type, shift_template_id, note, company_id, contract_id, assignment_role
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              employeeId,
              shiftDate,
              shiftType,
              resolvedShiftTemplateId,
              note || null,
              contract.company_id,
              contract.id,
              finalRole
            );
            created.push({ shift_id: Number(result.lastInsertRowid), employee_id: employeeId, shift_date: shiftDate });
          }
        });
      });

      return { removed, created, updated };
    });

    const result = tx();

    return res.json({
      success: true,
      message: 'Đã đồng bộ thành viên hợp đồng và cập nhật ca làm việc tự động',
      data: {
        contract_id: contract.id,
        contract_code: contract.contract_code,
        company_id: contract.company_id,
        date_from: rangeFrom,
        date_to: rangeTo,
        employee_ids: uniqueEmployeeIds,
        summary: {
          created: result.created.length,
          updated: result.updated.length,
          removed: result.removed
        },
        created: result.created,
        updated: result.updated
      }
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const importCheckinCheckoutExcel = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng tải lên file Excel (tên field: file)' });
    }

    let xlsx;
    try {
      xlsx = require('xlsx');
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Thư viện xlsx chưa được cài đặt. Chạy: npm install xlsx'
      });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ success: false, message: 'File Excel không có sheet nào' });
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: null, raw: false });
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'Sheet Excel trống' });
    }

    const updateById = db.prepare(`
      UPDATE shifts
      SET check_in_time_actual = ?, check_out_time_actual = ?
      WHERE id = ?
    `);
    const updateByEmployeeDate = db.prepare(`
      UPDATE shifts
      SET check_in_time_actual = ?, check_out_time_actual = ?
      WHERE employee_id = ? AND shift_date = ?
    `);
    const findById = db.prepare('SELECT id FROM shifts WHERE id = ?');
    const findByEmployeeDate = db.prepare('SELECT id FROM shifts WHERE employee_id = ? AND shift_date = ?');

    const summary = {
      total_rows: rows.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      error_rows: []
    };

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const shiftIdRaw = getFirstNonEmpty(row, ['shift_id', 'shiftId', 'id']);
      const employeeIdRaw = getFirstNonEmpty(row, ['employee_id', 'employeeId']);
      const shiftDateRaw = getFirstNonEmpty(row, ['shift_date', 'shiftDate', 'date']);
      const checkInRaw = getFirstNonEmpty(row, ['check_in_time_actual', 'checkin', 'check_in', 'checkin_time']);
      const checkOutRaw = getFirstNonEmpty(row, ['check_out_time_actual', 'checkout', 'check_out', 'checkout_time']);

      if (checkInRaw === undefined && checkOutRaw === undefined) {
        summary.skipped += 1;
        summary.error_rows.push({ row: rowNumber, reason: 'No checkin/checkout value provided' });
        return;
      }

      const parsedIn = normalizeDateTimeInput(checkInRaw);
      if (!parsedIn.ok) {
        summary.errors += 1;
        summary.error_rows.push({ row: rowNumber, reason: `Invalid checkin: ${parsedIn.message}` });
        return;
      }

      const parsedOut = normalizeDateTimeInput(checkOutRaw);
      if (!parsedOut.ok) {
        summary.errors += 1;
        summary.error_rows.push({ row: rowNumber, reason: `Invalid checkout: ${parsedOut.message}` });
        return;
      }

      if (shiftIdRaw !== undefined && shiftIdRaw !== null && String(shiftIdRaw).trim() !== '') {
        const shiftId = Number(shiftIdRaw);
        if (!shiftId || !findById.get(shiftId)) {
          summary.errors += 1;
          summary.error_rows.push({ row: rowNumber, reason: `Shift not found by shift_id=${shiftIdRaw}` });
          return;
        }

        const changed = updateById.run(parsedIn.value ?? null, parsedOut.value ?? null, shiftId).changes;
        if (changed > 0) {
          summary.updated += 1;
        } else {
          summary.skipped += 1;
        }
        return;
      }

      if (!employeeIdRaw || !shiftDateRaw || !DATE_RE.test(String(shiftDateRaw))) {
        summary.errors += 1;
        summary.error_rows.push({
          row: rowNumber,
          reason: 'Require shift_id OR (employee_id + shift_date in YYYY-MM-DD)'
        });
        return;
      }

      const employeeId = Number(employeeIdRaw);
      if (!employeeId) {
        summary.errors += 1;
        summary.error_rows.push({ row: rowNumber, reason: 'employee_id must be a valid number' });
        return;
      }

      const shiftRow = findByEmployeeDate.get(employeeId, String(shiftDateRaw));
      if (!shiftRow) {
        summary.errors += 1;
        summary.error_rows.push({
          row: rowNumber,
          reason: `Shift not found by employee_id=${employeeId} and shift_date=${shiftDateRaw}`
        });
        return;
      }

      const changed = updateByEmployeeDate.run(
        parsedIn.value ?? null,
        parsedOut.value ?? null,
        employeeId,
        String(shiftDateRaw)
      ).changes;

      if (changed > 0) {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }
    });

    return res.json({
      success: true,
      message: 'Import chấm công đã được xử lý',
      data: summary
    });
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
  getAssignmentCandidates,
  getAll,
  getByEmployee,
  getMine,
  create,
  createRange,
  importCheckinCheckoutExcel,
  getContractCandidates,
  syncContractMembers,
  update,
  remove
};
