const db = require('../config/db');
const xlsx = require('xlsx');

const NAME_SQL = "COALESCE(NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''), e.full_name, '')";
const MONTH_RE = /^\d{4}-\d{2}$/;
const shouldExportExcel = (req) => String(req.query.export || '').trim().toLowerCase() === 'excel';
const sendExcel = (res, fileName, rows) => {
  const workbook = xlsx.utils.book_new();
  const safeRows = Array.isArray(rows) && rows.length > 0 ? rows : [{ message: 'No data' }];
  const worksheet = xlsx.utils.json_to_sheet(safeRows);
  xlsx.utils.book_append_sheet(workbook, worksheet, 'salary');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}.xlsx\"`);
  return res.send(buffer);
};
const toSalaryExportRow = (row) => {
  const summary = row.attendance_report?.summary || {};
  const deduction = row.deduction_analysis || {};
  return {
    salary_id: row.id,
    employee_id: row.employee_id,
    full_name: row.full_name || null,
    month: row.month,
    paid: row.paid,
    base_salary: row.base_salary,
    bonus: row.bonus,
    deduction: row.deduction,
    total: row.total,
    expected_workdays_mon_to_fri: summary.expected_workdays_mon_to_fri ?? null,
    worked_days: summary.worked_days ?? null,
    missing_workdays: summary.missing_workdays ?? null,
    approved_leave_day_units_used_for_attendance: summary.approved_leave_day_units_used_for_attendance ?? null,
    late_under_30_count: summary.late_under_30_count ?? null,
    late_over_or_equal_30_count: summary.late_over_or_equal_30_count ?? null,
    attendance_adjusted_base_salary: deduction.attendance_adjusted_base_salary ?? null,
    bonus_used: deduction.bonus_used ?? null
  };
};

const calculateTotal = (baseSalary, bonus, deduction) => {
  return Number(baseSalary || 0) + Number(bonus || 0) - Number(deduction || 0);
};
const getCurrentYearMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};
const isValidPayrollMonth = (month) => {
  if (!MONTH_RE.test(String(month || ''))) return false;
  return String(month) <= getCurrentYearMonth();
};
const parseSalaryRangeFilters = (query) => {
  const exactMonth = query.month ? String(query.month) : null;
  if (exactMonth) {
    if (!MONTH_RE.test(exactMonth)) {
      return { error: 'month must be in YYYY-MM format' };
    }
    return { month: exactMonth, monthFrom: null, monthTo: null };
  }

  const rawMonthFrom = query.month_from ? String(query.month_from) : null;
  const rawMonthTo = query.month_to ? String(query.month_to) : null;
  const monthFrom = rawMonthFrom || null;
  const monthTo = rawMonthTo || null;
  if (monthFrom && !MONTH_RE.test(monthFrom)) {
    return { error: 'month_from must be in YYYY-MM format' };
  }
  if (monthTo && !MONTH_RE.test(monthTo)) {
    return { error: 'month_to must be in YYYY-MM format' };
  }
  if (monthFrom && monthTo && monthFrom > monthTo) {
    return { error: 'from date/month must be less than or equal to to date/month' };
  }

  return { month: null, monthFrom, monthTo };
};
const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};
const getSalaryConfigForEmployee = (employeeId, employeeType) => {
  // Ưu tiên 1: Lấy từ hợp đồng lao động hiện tại (active)
  const activeContract = db.prepare(`
    SELECT base_salary, allowance
    FROM employee_contracts
    WHERE employee_id = ? AND status = 'active'
    ORDER BY start_date DESC
    LIMIT 1
  `).get(employeeId);

  if (activeContract) {
    return {
      base_salary: Number(activeContract.base_salary || 0),
      bonus: Number(activeContract.allowance || 0),
      source: 'employee_contract'
    };
  }

  // Ưu tiên 2: Lấy từ bản lương gần nhất
  const latest = db.prepare(`
    SELECT base_salary, bonus
    FROM salaries
    WHERE employee_id = ?
    ORDER BY month DESC, id DESC
    LIMIT 1
  `).get(employeeId);

  if (latest) {
    return { base_salary: Number(latest.base_salary || 0), bonus: Number(latest.bonus || 0), source: 'latest_salary_record' };
  }

  // Ưu tiên 3: Giá trị mặc định theo loại nhân viên
  if (employeeType === 'hr') {
    return { base_salary: 11000000, bonus: 500000, source: 'default_hr' };
  }

  return { base_salary: 8000000, bonus: 300000, source: 'default_guard' };
};

const parseMonthRange = (month) => {
  if (!MONTH_RE.test(String(month || ''))) {
    return null;
  }
  const [y, m] = String(month).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    dateFrom: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`,
    dateTo: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  };
};
const countWeekdaysMonToFri = (dateFrom, dateTo) => {
  let count = 0;
  let current = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  while (current <= end) {
    const dow = current.getDay(); // 0 Sun, 6 Sat
    if (dow >= 1 && dow <= 5) {
      count += 1;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};
const isWeekdayMonToFri = (dateText) => {
  if (!dateText) return false;
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
};

const parseDateTime = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace(' ', 'T');
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const buildScheduledDateTime = (shiftDate, timeText) => {
  if (!shiftDate || !timeText) return null;
  const [hhRaw, mmRaw = '00', ssRaw = '00'] = String(timeText).split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  const ss = Number(ssRaw);
  if ([hh, mm, ss].some(Number.isNaN)) return null;
  const [y, m, d] = String(shiftDate).split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss, 0);
};

const enrichShiftExpectedTimes = (shift) => {
  const expectedIn = buildScheduledDateTime(shift.shift_date, shift.template_check_in_time);
  let expectedOut = buildScheduledDateTime(shift.shift_date, shift.template_check_out_time);

  if (expectedIn && expectedOut && expectedOut <= expectedIn) {
    expectedOut.setDate(expectedOut.getDate() + 1);
  }

  return { expectedIn, expectedOut };
};

const minutesBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / 60000);
const getLeaveUnits = (durationType) => {
  if (durationType === 'full_day') return 1;
  if (durationType === 'half_day_morning' || durationType === 'half_day_afternoon') return 0.5;
  return 0;
};

const buildAttendanceReport = (employeeId, month, includeShiftDetails) => {
  const monthRange = parseMonthRange(month);
  if (!monthRange) {
    return {
      month,
      valid_month: false,
      message: 'month must be in YYYY-MM format'
    };
  }

  const shifts = db.prepare(`
    SELECT s.id, s.shift_date, s.shift_type,
           s.check_in_time_actual, s.check_out_time_actual,
           st.check_in_time AS template_check_in_time,
           st.check_out_time AS template_check_out_time,
           st.code AS shift_code,
           st.name AS shift_name
    FROM shifts s
    LEFT JOIN shift_templates st ON st.id = s.shift_template_id
    WHERE s.employee_id = ?
      AND s.shift_date BETWEEN ? AND ?
    ORDER BY s.shift_date ASC, s.id ASC
  `).all(employeeId, monthRange.dateFrom, monthRange.dateTo);
  const approvedLeaves = db.prepare(`
    SELECT leave_date, duration_type
    FROM leave_requests
    WHERE employee_id = ?
      AND status = 'approved'
      AND leave_date BETWEEN ? AND ?
    ORDER BY leave_date ASC
  `).all(employeeId, monthRange.dateFrom, monthRange.dateTo);

  const leaveUnitsByDate = new Map();
  approvedLeaves.forEach((leave) => {
    if (!isWeekdayMonToFri(leave.leave_date)) return;
    const units = getLeaveUnits(leave.duration_type);
    if (units <= 0) return;
    const prev = Number(leaveUnitsByDate.get(leave.leave_date) || 0);
    leaveUnitsByDate.set(leave.leave_date, Math.min(1, prev + units));
  });

  let assignedShifts = 0;
  let completedShifts = 0;
  let missingCheckShifts = 0;
  let lateCount = 0;
  let lateUnder30Count = 0;
  let lateOverOrEqual30Count = 0;
  const workedDaysSet = new Set();

  const shiftDetails = [];

  shifts.forEach((shift) => {
    const isWeekdayShift = isWeekdayMonToFri(shift.shift_date);
    if (isWeekdayShift) {
      assignedShifts += 1;
    }

    const actualIn = parseDateTime(shift.check_in_time_actual);
    const actualOut = parseDateTime(shift.check_out_time_actual);
    const { expectedIn, expectedOut } = enrichShiftExpectedTimes(shift);

    const hasEnoughCheck = Boolean(actualIn && actualOut);
    if (isWeekdayShift) {
      if (hasEnoughCheck) {
        completedShifts += 1;
        workedDaysSet.add(shift.shift_date);
      } else {
        missingCheckShifts += 1;
      }
    }

    let lateMinutes = 0;

    if (isWeekdayShift && hasEnoughCheck && expectedIn && actualIn > expectedIn) {
      lateMinutes = minutesBetween(expectedIn, actualIn);
      lateCount += 1;
      if (lateMinutes < 30) {
        lateUnder30Count += 1;
      } else {
        lateOverOrEqual30Count += 1;
      }
    }

    if (includeShiftDetails) {
      shiftDetails.push({
        shift_id: shift.id,
        shift_date: shift.shift_date,
        shift_code: shift.shift_code,
        shift_name: shift.shift_name,
        expected_check_in: expectedIn ? expectedIn.toISOString().slice(0, 19).replace('T', ' ') : null,
        expected_check_out: expectedOut ? expectedOut.toISOString().slice(0, 19).replace('T', ' ') : null,
        actual_check_in: shift.check_in_time_actual,
        actual_check_out: shift.check_out_time_actual,
        is_weekday_mon_to_fri: isWeekdayShift,
        is_missing_check: !hasEnoughCheck,
        late_minutes: lateMinutes,
        late_rule_tag: lateMinutes >= 30 ? 'half_shift_absent' : (lateMinutes > 0 ? 'late_under_30' : null)
      });
    }
  });

  const expectedWorkdays = countWeekdaysMonToFri(monthRange.dateFrom, monthRange.dateTo);
  let leaveCoveredUnits = 0;
  leaveUnitsByDate.forEach((units, leaveDate) => {
    if (!workedDaysSet.has(leaveDate)) {
      leaveCoveredUnits += units;
    }
  });

  const workedDaysRaw = workedDaysSet.size + leaveCoveredUnits;
  const workedDays = Math.min(expectedWorkdays, Number(workedDaysRaw.toFixed(2)));
  const missingWorkdays = Math.max(0, expectedWorkdays - workedDays);
  const attendanceRatio = expectedWorkdays > 0
    ? Number((Math.min(1, workedDays / expectedWorkdays)).toFixed(4))
    : 1;

  return {
    month,
    valid_month: true,
    summary: {
      expected_workdays_mon_to_fri: expectedWorkdays,
      worked_days: workedDays,
      missing_workdays: missingWorkdays,
      attendance_ratio: attendanceRatio,
      approved_leave_day_units_used_for_attendance: Number(leaveCoveredUnits.toFixed(2)),
      assigned_shifts: assignedShifts,
      completed_shifts: completedShifts,
      missing_check_shifts: missingCheckShifts,
      late_count: lateCount,
      late_under_30_count: lateUnder30Count,
      late_over_or_equal_30_count: lateOverOrEqual30Count
    },
    details: includeShiftDetails ? shiftDetails : undefined
  };
};

const calculateRuleDeduction = (attendanceReport, baseSalary) => {
  const summary = attendanceReport?.summary || {};
  const expectedWorkdays = Number(summary.expected_workdays_mon_to_fri || 0);
  const lateUnder30Count = Number(summary.late_under_30_count || 0);
  const lateOverOrEqual30Count = Number(summary.late_over_or_equal_30_count || 0);

  const lateUnder30Deduction = lateUnder30Count * 50000;
  const monthlyOver3Penalty = lateUnder30Count > 3 ? 1000000 : 0;
  const halfShiftUnit = expectedWorkdays > 0 ? Number(baseSalary || 0) / expectedWorkdays / 2 : 0;
  const halfShiftAbsentDeduction = lateOverOrEqual30Count * halfShiftUnit;
  const autoDeductionTotal = Math.round(lateUnder30Deduction + monthlyOver3Penalty + halfShiftAbsentDeduction);

  return {
    late_under_30_count: lateUnder30Count,
    late_under_30_deduction: lateUnder30Deduction,
    monthly_over_3_penalty: monthlyOver3Penalty,
    late_over_or_equal_30_count: lateOverOrEqual30Count,
    half_shift_absent_unit: Number(halfShiftUnit.toFixed(2)),
    half_shift_absent_deduction: Math.round(halfShiftAbsentDeduction),
    auto_deduction_total: autoDeductionTotal
  };
};
const calculateAttendanceAdjustedBaseSalary = (baseSalary, attendanceReport) => {
  const summary = attendanceReport?.summary || {};
  const expectedWorkdays = Number(summary.expected_workdays_mon_to_fri || 0);
  const workedDays = Number(summary.worked_days || 0);
  if (expectedWorkdays <= 0) {
    return Number(baseSalary || 0);
  }
  return Math.round((Number(baseSalary || 0) * workedDays) / expectedWorkdays);
};
const withAttendance = (salaryRow, includeShiftDetails) => {
  const attendanceReport = buildAttendanceReport(salaryRow.employee_id, salaryRow.month, includeShiftDetails);
  const ruleDeduction = calculateRuleDeduction(attendanceReport, salaryRow.base_salary);
  const attendanceAdjustedBaseSalary = calculateAttendanceAdjustedBaseSalary(salaryRow.base_salary, attendanceReport);
  return {
    ...salaryRow,
    attendance_report: attendanceReport,
    deduction_analysis: {
      stored_deduction: Number(salaryRow.deduction || 0),
      rule_deduction_preview: ruleDeduction,
      attendance_adjusted_base_salary: attendanceAdjustedBaseSalary,
      bonus_used: Number(salaryRow.bonus || 0),
      total_if_only_rule_applied: calculateTotal(attendanceAdjustedBaseSalary, salaryRow.bonus, ruleDeduction.auto_deduction_total)
    }
  };
};

const getAll = (req, res) => {
  try {
    const { employee_id } = req.query;
    const includeShiftDetails = String(req.query.include_shift_details || '').toLowerCase() === 'true';
    const rangeFilters = parseSalaryRangeFilters(req.query);
    if (rangeFilters.error) {
      return res.status(400).json({ success: false, message: rangeFilters.error });
    }
    const paging = parsePagination(req.query);

    let whereClause = ' WHERE 1=1 ';
    const params = [];

    if (rangeFilters.month) {
      whereClause += ' AND s.month = ?';
      params.push(rangeFilters.month);
    } else {
      if (rangeFilters.monthFrom) {
        whereClause += ' AND s.month >= ?';
        params.push(rangeFilters.monthFrom);
      }
      if (rangeFilters.monthTo) {
        whereClause += ' AND s.month <= ?';
        params.push(rangeFilters.monthTo);
      }
    }

    if (employee_id) {
      whereClause += ' AND s.employee_id = ?';
      params.push(employee_id);
    }

    if (typeof req.query.paid !== 'undefined' && req.query.paid !== '') {
      const paid = Number(req.query.paid) ? 1 : 0;
      whereClause += ' AND s.paid = ?';
      params.push(paid);
    }

    const total = db.prepare(`
      SELECT COUNT(1) AS total
      FROM salaries s
      JOIN employees e ON e.id = s.employee_id
      ${whereClause}
    `).get(...params).total;

    const rows = db.prepare(`
      SELECT s.*, ${NAME_SQL} AS full_name
      FROM salaries s
      JOIN employees e ON e.id = s.employee_id
      ${whereClause}
      ORDER BY s.month DESC, s.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, paging.limit, paging.offset);

    const salaries = rows.map((row) => withAttendance(row, includeShiftDetails));
    if (shouldExportExcel(req)) {
      return sendExcel(res, 'salary_list', salaries.map(toSalaryExportRow));
    }
    return res.json({
      success: true,
      data: salaries,
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

const getMine = (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.status(400).json({ success: false, message: 'This account is not linked to an employee' });
    }

    const includeShiftDetails = String(req.query.include_shift_details || '').toLowerCase() === 'true';
    const rangeFilters = parseSalaryRangeFilters(req.query);
    if (rangeFilters.error) {
      return res.status(400).json({ success: false, message: rangeFilters.error });
    }
    const paging = parsePagination(req.query);

    let whereClause = ' WHERE employee_id = ? ';
    const params = [req.user.employee_id];

    if (rangeFilters.month) {
      whereClause += ' AND month = ?';
      params.push(rangeFilters.month);
    } else {
      if (rangeFilters.monthFrom) {
        whereClause += ' AND month >= ?';
        params.push(rangeFilters.monthFrom);
      }
      if (rangeFilters.monthTo) {
        whereClause += ' AND month <= ?';
        params.push(rangeFilters.monthTo);
      }
    }

    if (typeof req.query.paid !== 'undefined' && req.query.paid !== '') {
      const paid = Number(req.query.paid) ? 1 : 0;
      whereClause += ' AND paid = ?';
      params.push(paid);
    }

    const total = db.prepare(`SELECT COUNT(1) AS total FROM salaries ${whereClause}`).get(...params).total;
    const rows = db.prepare(`
      SELECT *
      FROM salaries
      ${whereClause}
      ORDER BY month DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, paging.limit, paging.offset);
    const salaries = rows.map((row) => withAttendance(row, includeShiftDetails));
    if (shouldExportExcel(req)) {
      return sendExcel(res, 'my_salary_list', salaries.map(toSalaryExportRow));
    }

    return res.json({
      success: true,
      data: salaries,
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

const getById = (req, res) => {
  try {
    const includeShiftDetails = String(req.query.include_shift_details || 'true').toLowerCase() === 'true';
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
    const data = withAttendance(salary, includeShiftDetails);
    if (shouldExportExcel(req)) {
      return sendExcel(res, `salary_${salary.id}`, [toSalaryExportRow(data)]);
    }
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const { employee_id, month, note } = req.body;

    if (!employee_id || !month) {
      return res.status(400).json({ success: false, message: 'Missing required fields: employee_id, month' });
    }

    if (!isValidPayrollMonth(month)) {
      return res.status(400).json({ success: false, message: 'month must be in YYYY-MM format and not in the future' });
    }

    const employee = db.prepare('SELECT id, employee_type FROM employees WHERE id = ?').get(employee_id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee does not exist' });
    }

    const duplicated = db.prepare('SELECT id FROM salaries WHERE employee_id = ? AND month = ?').get(employee_id, month);
    if (duplicated) {
      return res.status(409).json({
        success: false,
        message: 'Salary record already exists for this employee and month'
      });
    }

    const salaryConfig = getSalaryConfigForEmployee(employee_id, employee.employee_type);
    const baseSalary = salaryConfig.base_salary;
    const bonus = salaryConfig.bonus;

    const attendanceReport = buildAttendanceReport(employee_id, month, false);
    const ruleDeduction = calculateRuleDeduction(attendanceReport, baseSalary);
    const manualDeduction = Number(req.body.extra_deduction ?? req.body.deduction ?? 0);
    const finalDeduction = manualDeduction + ruleDeduction.auto_deduction_total;
    const attendanceAdjustedBaseSalary = calculateAttendanceAdjustedBaseSalary(baseSalary, attendanceReport);
    const total = calculateTotal(attendanceAdjustedBaseSalary, bonus, finalDeduction);
    const result = db
      .prepare(`
        INSERT INTO salaries (employee_id, month, base_salary, bonus, deduction, total, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(employee_id, month, baseSalary, bonus, finalDeduction, total, note || null);

    const salary = db.prepare('SELECT * FROM salaries WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      success: true,
      data: {
        ...withAttendance(salary, true),
        salary_config_source: salaryConfig.source,
        deduction_breakdown: {
          manual_deduction: manualDeduction,
          ...ruleDeduction,
          attendance_adjusted_base_salary: attendanceAdjustedBaseSalary,
          bonus_used: Number(bonus || 0),
          final_deduction: finalDeduction
        }
      },
      message: 'Salary record created successfully'
    });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: salaries.employee_id, salaries.month')) {
      return res.status(409).json({
        success: false,
        message: 'Salary record already exists for this employee and month'
      });
    }
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

    if (!isValidPayrollMonth(payload.month)) {
      return res.status(400).json({ success: false, message: 'month must be in YYYY-MM format and not in the future' });
    }

    const duplicated = db.prepare(`
      SELECT id
      FROM salaries
      WHERE employee_id = ? AND month = ? AND id != ?
      LIMIT 1
    `).get(payload.employee_id, payload.month, salaryId);
    if (duplicated) {
      return res.status(409).json({
        success: false,
        message: 'Salary record already exists for this employee and month'
      });
    }

    const attendanceReport = buildAttendanceReport(payload.employee_id, payload.month, false);
    const ruleDeduction = calculateRuleDeduction(attendanceReport, payload.base_salary);
    const manualDeduction = Number(payload.deduction || 0);
    const finalDeduction = manualDeduction + ruleDeduction.auto_deduction_total;
    const attendanceAdjustedBaseSalary = calculateAttendanceAdjustedBaseSalary(payload.base_salary, attendanceReport);
    const total = calculateTotal(attendanceAdjustedBaseSalary, payload.bonus, finalDeduction);

    db.prepare(`
      UPDATE salaries
      SET employee_id = ?, month = ?, base_salary = ?, bonus = ?, deduction = ?, total = ?, note = ?, paid = ?
      WHERE id = ?
    `).run(
      payload.employee_id,
      payload.month,
      payload.base_salary,
      payload.bonus,
      finalDeduction,
      total,
      payload.note,
      payload.paid,
      salaryId
    );

    const salary = db.prepare('SELECT * FROM salaries WHERE id = ?').get(salaryId);
    return res.json({
      success: true,
      data: {
        ...withAttendance(salary, true),
        deduction_breakdown: {
          manual_deduction: manualDeduction,
          ...ruleDeduction,
          attendance_adjusted_base_salary: attendanceAdjustedBaseSalary,
          bonus_used: Number(payload.bonus || 0),
          final_deduction: finalDeduction
        }
      },
      message: 'Salary record updated successfully'
    });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: salaries.employee_id, salaries.month')) {
      return res.status(409).json({
        success: false,
        message: 'Salary record already exists for this employee and month'
      });
    }
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
