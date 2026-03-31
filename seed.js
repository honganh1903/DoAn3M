require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

const toYearMonth = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const toDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const now = new Date();
const nowMonth = toYearMonth(now);
const prevMonth = toYearMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const prev2Month = toYearMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const prev3Month = toYearMonth(new Date(now.getFullYear(), now.getMonth() - 3, 1));
const prev4Month = toYearMonth(new Date(now.getFullYear(), now.getMonth() - 4, 1));
const prev5Month = toYearMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));
const currentYear = now.getFullYear();
const nowDateTime = toDateTime(now);

const shiftTypeByTemplateCode = { DAY: 'day', NIGHT: 'night' };
const toLocalDateText = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const getMonthRangeByOffset = (offset) => {
  const monthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const ym = toYearMonth(monthDate);
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    ym,
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, '0')}`
  };
};
const getNthWeekdayInMonth = (yearMonth, nth) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let found = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const dt = new Date(y, m - 1, day);
    const dow = dt.getDay();
    if (dow >= 1 && dow <= 5) {
      found += 1;
      if (found === nth) {
        return `${yearMonth}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return `${yearMonth}-01`;
};

const iterDateRange = (dateFrom, dateTo, callback) => {
  let current = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  while (current <= end) {
    callback(toLocalDateText(current));
    current.setDate(current.getDate() + 1);
  }
};
const toDateTimeLocalText = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  const ss = String(dateObj.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};
const parseLocalDateTime = (dateText, hh, mm = 0) => {
  const [y, m, d] = dateText.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};
const buildActualCheckTimes = (templateCode, shiftDate, employeeId) => {
  const seedNum = Number(employeeId) + Number(shiftDate.slice(-2));
  const inOffset = (seedNum % 21) - 10; // [-10..10] minutes
  const outOffset = ((seedNum * 3) % 31) - 15; // [-15..15] minutes

  if (templateCode === 'NIGHT') {
    const checkInBase = parseLocalDateTime(shiftDate, 22, 0);
    const checkOutBase = parseLocalDateTime(shiftDate, 6, 0);
    checkOutBase.setDate(checkOutBase.getDate() + 1);
    checkInBase.setMinutes(checkInBase.getMinutes() + inOffset);
    checkOutBase.setMinutes(checkOutBase.getMinutes() + outOffset);
    return {
      check_in_time_actual: toDateTimeLocalText(checkInBase),
      check_out_time_actual: toDateTimeLocalText(checkOutBase)
    };
  }

  const checkInBase = parseLocalDateTime(shiftDate, 8, 0);
  const checkOutBase = parseLocalDateTime(shiftDate, 17, 0);
  checkInBase.setMinutes(checkInBase.getMinutes() + inOffset);
  checkOutBase.setMinutes(checkOutBase.getMinutes() + outOffset);
  return {
    check_in_time_actual: toDateTimeLocalText(checkInBase),
    check_out_time_actual: toDateTimeLocalText(checkOutBase)
  };
};

const m0 = getMonthRangeByOffset(0);
const m1 = getMonthRangeByOffset(1);
const m2 = getMonthRangeByOffset(2);
const m3 = getMonthRangeByOffset(3);
const m4 = getMonthRangeByOffset(4);
const m5 = getMonthRangeByOffset(5);

const guardProfiles = [
  { key: 'guard_01', first_name: 'Nguyen', last_name: 'Van An', id_card: '079095000001', social_insurance_no: 'BHXH000001', phone: '0901000001', department: 'Gate A', hire_date: '2024-01-10' },
  { key: 'guard_02', first_name: 'Tran', last_name: 'Thi Binh', id_card: '079097000002', social_insurance_no: 'BHXH000002', phone: '0901000002', department: 'Warehouse', hire_date: '2024-03-01' },
  { key: 'guard_03', first_name: 'Le', last_name: 'Quoc Cuong', id_card: '079092000003', social_insurance_no: 'BHXH000003', phone: '0901000003', department: 'Factory C', hire_date: '2023-12-15' },
  { key: 'guard_04', first_name: 'Hoang', last_name: 'Minh Duc', id_card: '079094000004', social_insurance_no: 'BHXH000004', phone: '0901000004', department: 'Dock 1', hire_date: '2024-02-20' },
  { key: 'guard_05', first_name: 'Vo', last_name: 'Ngoc Ha', id_card: '079098000005', social_insurance_no: 'BHXH000005', phone: '0901000005', department: 'Distribution', hire_date: '2024-04-10' },
  { key: 'guard_06', first_name: 'Bui', last_name: 'Gia Khanh', id_card: '079091000006', social_insurance_no: 'BHXH000006', phone: '0901000006', department: 'Office', hire_date: '2023-10-25' },
  { key: 'guard_07', first_name: 'Dang', last_name: 'Thanh Long', id_card: '079093000007', social_insurance_no: 'BHXH000007', phone: '0901000007', department: 'Gate B', hire_date: '2024-05-02' },
  { key: 'guard_08', first_name: 'Phan', last_name: 'Kim Ngan', id_card: '079096000008', social_insurance_no: 'BHXH000008', phone: '0901000008', department: 'Transit', hire_date: '2024-05-12' },
  { key: 'guard_09', first_name: 'Do', last_name: 'Tuan Kiet', id_card: '079099000009', social_insurance_no: 'BHXH000009', phone: '0901000009', department: 'Yard', hire_date: '2024-06-01' },
  { key: 'guard_10', first_name: 'Mai', last_name: 'Bao Chau', id_card: '079089000010', social_insurance_no: 'BHXH000010', phone: '0901000010', department: 'Central Hub', hire_date: '2024-06-18' }
];

const employeeProfiles = [
  ...guardProfiles.map((item, index) => ({
    ...item,
    birth_date: `199${index % 9}-0${(index % 8) + 1}-1${index % 9}`,
    gender: index % 2 === 0 ? 'male' : 'female',
    employee_type: 'guard',
    address: `Khu ${index + 1}, TP.HCM`,
    status: 'active'
  })),
  {
    key: 'hr_01',
    first_name: 'Pham',
    last_name: 'Nhan Su',
    birth_date: '1990-01-15',
    gender: 'female',
    id_card: '079090009999',
    social_insurance_no: 'BHXHHR0001',
    employee_type: 'hr',
    phone: '0901999999',
    address: 'Quan 3, TP.HCM',
    department: 'Human Resources',
    hire_date: '2024-01-01',
    status: 'active'
  },
  {
    key: 'hr_02',
    first_name: 'Nguyen',
    last_name: 'Dieu Linh',
    birth_date: '1991-08-21',
    gender: 'female',
    id_card: '079091009998',
    social_insurance_no: 'BHXHHR0002',
    employee_type: 'hr',
    phone: '0901888888',
    address: 'Quan 10, TP.HCM',
    department: 'Human Resources',
    hire_date: '2024-02-10',
    status: 'active'
  }
];

const partnerCompanies = [
  { key: 'abc', company_name: 'Cong ty ABC Manufacturing', tax_code: '0312345678', contact_name: 'Pham Quang Huy', contact_phone: '0912000001', contact_email: 'huy@abcmfg.vn', address: 'KCN Tan Tao, TP.HCM', note: 'Factory security client' },
  { key: 'xyz', company_name: 'Cong ty XYZ Logistics', tax_code: '0312345679', contact_name: 'Vo Minh Chau', contact_phone: '0912000002', contact_email: 'chau@xyzlog.vn', address: 'Song Than, Binh Duong', note: 'Warehouse security client' },
  { key: 'mnr', company_name: 'Cong ty MNR Retail', tax_code: '0312345680', contact_name: 'Do Tuan Kiet', contact_phone: '0912000003', contact_email: 'kiet@mnr.vn', address: 'Bien Hoa, Dong Nai', note: 'Distribution center security client' },
  { key: 'tvt', company_name: 'Cong ty TVT Energy', tax_code: '0312345681', contact_name: 'Nguyen Huu Dat', contact_phone: '0912000004', contact_email: 'dat@tvt.vn', address: 'My Phuoc, Binh Duong', note: 'Energy plant security client' },
  { key: 'zms', company_name: 'Cong ty ZMS Trading', tax_code: '0312345682', contact_name: 'Tran Bao Nam', contact_phone: '0912000005', contact_email: 'nam@zms.vn', address: 'Long Hau, Long An', note: 'Logistics and goods yard client' }
];

const contractSeeds = [
  { contract_code: 'HD-ABC-001', company_key: 'abc', shift_template_code: 'DAY', service_name: 'Bao ve nha may A', guard_quantity: 3, monthly_value: 78000000, note: 'Factory line 1', start_date: m0.start, end_date: m1.end, status: 'active' },
  { contract_code: 'HD-ABC-002', company_key: 'abc', shift_template_code: 'NIGHT', service_name: 'Bao ve kho vat tu', guard_quantity: 2, monthly_value: 36000000, note: 'Warehouse zone', start_date: m0.start, end_date: m1.end, status: 'active' },
  { contract_code: 'HD-XYZ-001', company_key: 'xyz', shift_template_code: 'DAY', service_name: 'Bao ve kho logistics', guard_quantity: 2, monthly_value: 51000000, note: 'Dock security', start_date: m0.start, end_date: m1.end, status: 'active' },
  { contract_code: 'HD-MNR-001', company_key: 'mnr', shift_template_code: 'NIGHT', service_name: 'Bao ve trung tam phan phoi', guard_quantity: 1, monthly_value: 36000000, note: 'Distribution center', start_date: m0.start, end_date: m1.end, status: 'active' },
  { contract_code: 'HD-TVT-001', company_key: 'tvt', shift_template_code: 'DAY', service_name: 'Bao ve nha may nang luong', guard_quantity: 2, monthly_value: 56000000, note: 'Plant area A', start_date: m2.start, end_date: m3.end, status: 'active' },
  { contract_code: 'HD-TVT-002', company_key: 'tvt', shift_template_code: 'NIGHT', service_name: 'Bao ve cong truoc', guard_quantity: 2, monthly_value: 32000000, note: 'Main gate', start_date: m2.start, end_date: m3.end, status: 'active' },
  { contract_code: 'HD-ZMS-001', company_key: 'zms', shift_template_code: 'DAY', service_name: 'Bao ve bai hang', guard_quantity: 3, monthly_value: 54000000, note: 'Goods yard', start_date: m4.start, end_date: m5.end, status: 'active' }
];

const contractMemberPlans = {
  'HD-ABC-001': [
    { employee_key: 'guard_01', assignment_role: 'team_leader' },
    { employee_key: 'guard_02', assignment_role: 'guard' }
  ],
  'HD-ABC-002': [
    { employee_key: 'guard_04', assignment_role: 'team_leader' }
  ],
  'HD-XYZ-001': [
    { employee_key: 'guard_06', assignment_role: 'team_leader' }
  ],
  'HD-MNR-001': [
    { employee_key: 'guard_08', assignment_role: 'supervisor' }
  ],
  'HD-TVT-001': [
    { employee_key: 'guard_01', assignment_role: 'team_leader' },
    { employee_key: 'guard_02', assignment_role: 'guard' }
  ],
  'HD-TVT-002': [
    { employee_key: 'guard_03', assignment_role: 'team_leader' },
    { employee_key: 'guard_04', assignment_role: 'guard' }
  ],
  'HD-ZMS-001': [
    { employee_key: 'guard_05', assignment_role: 'team_leader' },
    { employee_key: 'guard_06', assignment_role: 'guard' },
    { employee_key: 'guard_07', assignment_role: 'guard' }
  ]
};

const internalShiftPlans = [
  {
    employee_key: 'guard_09',
    shift_template_code: 'DAY',
    date_from: `${m0.ym}-03`,
    date_to: `${m0.ym}-18`,
    note: 'Ca noi bo - khu van phong'
  },
  {
    employee_key: 'guard_10',
    shift_template_code: 'NIGHT',
    date_from: `${m0.ym}-05`,
    date_to: `${m0.ym}-20`,
    note: 'Ca noi bo - cong sau'
  },
  {
    employee_key: 'hr_02',
    shift_template_code: 'DAY',
    date_from: `${m0.ym}-10`,
    date_to: `${m0.ym}-14`,
    note: 'Ca hanh chinh ho tro van hanh'
  },
  {
    employee_key: 'guard_09',
    shift_template_code: 'DAY',
    date_from: `${m1.ym}-02`,
    date_to: `${m1.ym}-12`,
    note: 'Ca noi bo - thang tiep theo'
  }
];

const shiftTemplates = [
  { code: 'DAY', name: 'Ca Ngay', check_in_time: '08:00', check_out_time: '17:00', work_pattern: 'daily', note: 'Ca ngay mac dinh' },
  { code: 'NIGHT', name: 'Ca Dem', check_in_time: '22:00', check_out_time: '06:00', work_pattern: 'daily', note: 'Ca dem mac dinh' }
];

const leaveDates = {
  now_02: getNthWeekdayInMonth(nowMonth, 2),
  now_04: getNthWeekdayInMonth(nowMonth, 4),
  now_05: getNthWeekdayInMonth(nowMonth, 5),
  now_06: getNthWeekdayInMonth(nowMonth, 6),
  now_07: getNthWeekdayInMonth(nowMonth, 7),
  now_08: getNthWeekdayInMonth(nowMonth, 8),
  now_09: getNthWeekdayInMonth(nowMonth, 9),
  now_10: getNthWeekdayInMonth(nowMonth, 10),
  prev_04: getNthWeekdayInMonth(prevMonth, 4),
  prev_07: getNthWeekdayInMonth(prevMonth, 7),
  prev2_03: getNthWeekdayInMonth(prev2Month, 3)
};

const leaveSeeds = [
  { employee_key: 'guard_02', leave_date: leaveDates.now_02, duration_type: 'full_day', reason: 'Nghi phep viec gia dinh', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_04', leave_date: leaveDates.now_04, duration_type: 'half_day_morning', reason: 'Kham suc khoe dinh ky', status: 'pending', approved_by_username: null, reject_reason: null },
  { employee_key: 'guard_05', leave_date: leaveDates.now_05, duration_type: 'half_day_afternoon', reason: 'Viec ca nhan', status: 'rejected', approved_by_username: 'admin', reject_reason: 'Khong du nguoi thay ca' },
  { employee_key: 'guard_07', leave_date: leaveDates.now_06, duration_type: 'full_day', reason: 'Nghi phep ca nhan', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_08', leave_date: leaveDates.now_07, duration_type: 'half_day_afternoon', reason: 'Di kham benh', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_09', leave_date: leaveDates.now_08, duration_type: 'half_day_morning', reason: 'Lam thu tuc hanh chinh', status: 'pending', approved_by_username: null, reject_reason: null },
  { employee_key: 'hr_02', leave_date: leaveDates.now_09, duration_type: 'full_day', reason: 'Nghi phep nam', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_01', leave_date: leaveDates.prev_04, duration_type: 'full_day', reason: 'Nghi benh ngan ngay', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_03', leave_date: leaveDates.prev_07, duration_type: 'half_day_morning', reason: 'Di tai kham', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_06', leave_date: leaveDates.prev2_03, duration_type: 'half_day_afternoon', reason: 'Viec gia dinh', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_10', leave_date: leaveDates.now_10, duration_type: 'full_day', reason: 'Nghi phep dot xuat', status: 'rejected', approved_by_username: 'admin', reject_reason: 'Khong co nguoi thay the' }
];

const announcementSeeds = [
  { created_by_employee_key: 'hr_01', title: 'Thong bao kiem tra dong phuc', content: 'Tat ca nhan vien bao ve thuc hien dong phuc dung quy dinh.', status: 'approved', approved_by_username: 'admin', reject_reason: null, published_at: nowDateTime },
  { created_by_employee_key: 'hr_01', title: 'Lich hop giao ban thang', content: 'Hop giao ban luc 09:00 sang thu 2 dau thang tai van phong.', status: 'pending', approved_by_username: null, reject_reason: null, published_at: null },
  { created_by_employee_key: 'guard_03', title: 'De xuat bo sung camera cong phu', content: 'De xuat bo sung 2 camera tai khu cong phu de giam sat xe vao.', status: 'rejected', approved_by_username: 'admin', reject_reason: 'Can bo sung chi phi va vi tri lap dat', published_at: null },
  { created_by_employee_key: 'hr_02', title: 'Thong bao quy trinh ban giao ca', content: 'Ca truoc phai ban giao day du so truc va su kien cho ca sau.', status: 'approved', approved_by_username: 'admin', reject_reason: null, published_at: nowDateTime },
  { created_by_employee_key: 'hr_02', title: 'Cap nhat noi quy checkin checkout', content: 'Nhan vien can checkin checkout dung gio va cap nhat du lieu day du.', status: 'approved', approved_by_username: 'admin', reject_reason: null, published_at: nowDateTime },
  { created_by_employee_key: 'guard_05', title: 'Bao cao su co khu B2', content: 'Co su co bat thuong tai khu B2 luc 02:15, da xu ly an toan.', status: 'approved', approved_by_username: 'admin', reject_reason: null, published_at: nowDateTime }
];

const employeeByCard = db.prepare('SELECT id FROM employees WHERE id_card = ?');
const accountByUsername = db.prepare('SELECT id FROM accounts WHERE username = ?');
const companyByTaxCode = db.prepare('SELECT id FROM partner_companies WHERE tax_code = ?');
const contractByCode = db.prepare('SELECT id FROM contracts WHERE contract_code = ?');
const shiftTemplateByCode = db.prepare('SELECT id FROM shift_templates WHERE code = ?');
const leaveExists = db.prepare('SELECT id FROM leave_requests WHERE employee_id = ? AND leave_date = ? AND duration_type = ?');
const announcementExists = db.prepare('SELECT id FROM announcements WHERE created_by_employee_id = ? AND title = ?');

const insertEmployee = db.prepare(`
  INSERT INTO employees (
    first_name, last_name, full_name, birth_date, gender, id_card, social_insurance_no,
    employee_type, phone, address, department, hire_date, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateEmployee = db.prepare(`
  UPDATE employees
  SET first_name = ?, last_name = ?, full_name = ?, birth_date = ?, gender = ?, social_insurance_no = ?, employee_type = ?,
      phone = ?, address = ?, department = ?, hire_date = ?, status = ?
  WHERE id = ?
`);

const insertAccount = db.prepare(`
  INSERT INTO accounts (username, password, role, employee_id, can_manage_salary, is_active)
  VALUES (?, ?, ?, ?, ?, 1)
`);

const updateAccount = db.prepare(`
  UPDATE accounts
  SET role = ?, employee_id = ?, can_manage_salary = ?, password = ?, is_active = 1
  WHERE username = ?
`);

const insertCompany = db.prepare(`
  INSERT INTO partner_companies (company_name, tax_code, contact_name, contact_phone, contact_email, address, status, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateCompany = db.prepare(`
  UPDATE partner_companies
  SET company_name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, address = ?, status = 'active', note = ?
  WHERE tax_code = ?
`);

const insertContract = db.prepare(`
  INSERT INTO contracts (company_id, shift_template_id, contract_code, service_name, start_date, end_date, guard_quantity, monthly_value, status, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateContract = db.prepare(`
  UPDATE contracts
  SET company_id = ?, shift_template_id = ?, service_name = ?, start_date = ?, end_date = ?, guard_quantity = ?, monthly_value = ?, status = ?, note = ?
  WHERE contract_code = ?
`);

const insertShiftTemplate = db.prepare(`
  INSERT INTO shift_templates (code, name, check_in_time, check_out_time, work_pattern, note, status)
  VALUES (?, ?, ?, ?, ?, ?, 'active')
`);

const updateShiftTemplate = db.prepare(`
  UPDATE shift_templates
  SET name = ?, check_in_time = ?, check_out_time = ?, work_pattern = ?, note = ?, status = 'active'
  WHERE code = ?
`);

const upsertSalary = db.prepare(`
  INSERT INTO salaries (employee_id, month, base_salary, bonus, deduction, total, note, paid)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(employee_id, month) DO UPDATE SET
    base_salary = excluded.base_salary,
    bonus = excluded.bonus,
    deduction = excluded.deduction,
    total = excluded.total,
    note = excluded.note,
    paid = excluded.paid
`);

const insertShift = db.prepare(`
  INSERT INTO shifts (
    employee_id, shift_date, shift_type, shift_template_id,
    check_in_time_actual, check_out_time_actual,
    note, company_id, contract_id, assignment_role
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertLeave = db.prepare(`
  INSERT INTO leave_requests (employee_id, leave_date, duration_type, reason, status, approved_by, approved_at, reject_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateLeave = db.prepare(`
  UPDATE leave_requests
  SET reason = ?, status = ?, approved_by = ?, approved_at = ?, reject_reason = ?
  WHERE id = ?
`);

const insertAnnouncement = db.prepare(`
  INSERT INTO announcements (created_by_employee_id, title, content, status, approved_by, approved_at, reject_reason, published_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateAnnouncement = db.prepare(`
  UPDATE announcements
  SET content = ?, status = ?, approved_by = ?, approved_at = ?, reject_reason = ?, published_at = ?
  WHERE id = ?
`);

const upsertLeaveBalance = db.prepare(`
  INSERT INTO leave_balances (employee_id, year, total_days, used_days, remaining_days, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(employee_id, year) DO UPDATE SET
    total_days = excluded.total_days,
    used_days = excluded.used_days,
    remaining_days = excluded.remaining_days,
    updated_at = datetime('now')
`);

const seed = db.transaction(() => {
  const employeeIds = {};
  const companyIds = {};
  const contractIds = {};
  const shiftTemplateIds = {};

  const upsertEmployeeByProfile = (profile) => {
    const existing = employeeByCard.get(profile.id_card);
    const fullName = `${profile.first_name} ${profile.last_name}`.trim();

    if (existing) {
      updateEmployee.run(
        profile.first_name,
        profile.last_name,
        fullName,
        profile.birth_date,
        profile.gender,
        profile.social_insurance_no,
        profile.employee_type,
        profile.phone,
        profile.address,
        profile.department,
        profile.hire_date,
        profile.status,
        existing.id
      );
      return existing.id;
    }

    const result = insertEmployee.run(
      profile.first_name,
      profile.last_name,
      fullName,
      profile.birth_date,
      profile.gender,
      profile.id_card,
      profile.social_insurance_no,
      profile.employee_type,
      profile.phone,
      profile.address,
      profile.department,
      profile.hire_date,
      profile.status
    );

    return Number(result.lastInsertRowid);
  };

  const upsertAccount = (username, password, role, employeeId, canManageSalary) => {
    const hashed = bcrypt.hashSync(password, 10);
    const existing = accountByUsername.get(username);

    if (existing) {
      updateAccount.run(role, employeeId || null, canManageSalary ? 1 : 0, hashed, username);
      return existing.id;
    }

    const result = insertAccount.run(username, hashed, role, employeeId || null, canManageSalary ? 1 : 0);
    return Number(result.lastInsertRowid);
  };

  const adminId = upsertAccount('admin', 'admin123', 'admin', null, true);

  employeeProfiles.forEach((profile) => {
    const employeeId = upsertEmployeeByProfile(profile);
    employeeIds[profile.key] = employeeId;
  });

  const hrAccountId = upsertAccount('hrstaff', 'hr123456', 'employee', employeeIds.hr_01, true);
  upsertAccount('opslead', 'ops123456', 'employee', employeeIds.hr_02, true);

  guardProfiles.forEach((guard, index) => {
    upsertAccount(`user${index + 1}`, 'user123', 'user', employeeIds[guard.key], false);
  });

  ['employee1', 'employee2', 'employee3'].forEach((username) => {
    const existing = accountByUsername.get(username);
    if (existing) {
      db.prepare('UPDATE accounts SET role = ?, can_manage_salary = ?, is_active = 0 WHERE username = ?').run('user', 0, username);
    }
  });

  partnerCompanies.forEach((company) => {
    const existing = companyByTaxCode.get(company.tax_code);

    if (existing) {
      updateCompany.run(
        company.company_name,
        company.contact_name,
        company.contact_phone,
        company.contact_email,
        company.address,
        company.note,
        company.tax_code
      );
      companyIds[company.key] = existing.id;
      return;
    }

    const result = insertCompany.run(
      company.company_name,
      company.tax_code,
      company.contact_name,
      company.contact_phone,
      company.contact_email,
      company.address,
      'active',
      company.note
    );
    companyIds[company.key] = Number(result.lastInsertRowid);
  });

  shiftTemplates.forEach((template) => {
    const existing = shiftTemplateByCode.get(template.code);

    if (existing) {
      updateShiftTemplate.run(
        template.name,
        template.check_in_time,
        template.check_out_time,
        template.work_pattern,
        template.note,
        template.code
      );
      shiftTemplateIds[template.code] = existing.id;
      return;
    }

    const result = insertShiftTemplate.run(
      template.code,
      template.name,
      template.check_in_time,
      template.check_out_time,
      template.work_pattern,
      template.note
    );
    shiftTemplateIds[template.code] = Number(result.lastInsertRowid);
  });

  contractSeeds.forEach((contract) => {
    const companyId = companyIds[contract.company_key];
    const shiftTemplateId = shiftTemplateIds[contract.shift_template_code] || shiftTemplateByCode.get(contract.shift_template_code)?.id;
    const existing = contractByCode.get(contract.contract_code);

    if (!shiftTemplateId) {
      throw new Error(`Missing shift template for contract ${contract.contract_code}: ${contract.shift_template_code}`);
    }

    if (existing) {
      updateContract.run(
        companyId,
        shiftTemplateId,
        contract.service_name,
        contract.start_date,
        contract.end_date,
        contract.guard_quantity,
        contract.monthly_value,
        contract.status,
        contract.note,
        contract.contract_code
      );
      contractIds[contract.contract_code] = existing.id;
      return;
    }

    const result = insertContract.run(
      companyId,
      shiftTemplateId,
      contract.contract_code,
      contract.service_name,
      contract.start_date,
      contract.end_date,
      contract.guard_quantity,
      contract.monthly_value,
      contract.status,
      contract.note
    );
    contractIds[contract.contract_code] = Number(result.lastInsertRowid);
  });

  const salaryProfiles = {};
  guardProfiles.forEach((guard, index) => {
    salaryProfiles[guard.key] = {
      base: 7800000 + (index * 250000),
      bonus: 250000 + (index % 4) * 90000
    };
  });
  salaryProfiles.hr_01 = { base: 12000000, bonus: 700000 };
  salaryProfiles.hr_02 = { base: 11000000, bonus: 550000 };

  const salaryMonths = [prev5Month, prev4Month, prev3Month, prev2Month, prevMonth, nowMonth];
  Object.keys(salaryProfiles).forEach((employeeKey) => {
    const employeeId = employeeIds[employeeKey];
    const profile = salaryProfiles[employeeKey];
    const currentMonthIndex = salaryMonths.length - 1;
    salaryMonths.forEach((month, monthIndex) => {
      const deduction = monthIndex === currentMonthIndex
        ? (employeeKey.startsWith('guard') ? (monthIndex + employeeId) % 4 * 50000 : 0)
        : ((employeeKey.startsWith('guard') && monthIndex % 2 === 0) ? 50000 : 0);
      const paid = month === nowMonth ? 0 : 1;
      const total = profile.base + profile.bonus - deduction;
      upsertSalary.run(employeeId, month, profile.base, profile.bonus, deduction, total, `Luong thang ${month}`, paid);
    });
  });

  db.prepare('DELETE FROM shifts').run();

  const assignedByEmployeeDate = new Set();
  const reserveAssignment = (employeeId, shiftDate, label) => {
    const key = `${employeeId}|${shiftDate}`;
    if (assignedByEmployeeDate.has(key)) {
      throw new Error(`Duplicate shift assignment for employee ${employeeId} on ${shiftDate} (${label})`);
    }
    assignedByEmployeeDate.add(key);
  };

  contractSeeds.forEach((contract) => {
    const members = contractMemberPlans[contract.contract_code] || [];
    if (members.length > Number(contract.guard_quantity)) {
      throw new Error(`Contract ${contract.contract_code} has members greater than guard_quantity (${contract.guard_quantity})`);
    }

    const templateCode = contract.shift_template_code;
    const templateId = shiftTemplateIds[templateCode];
    const shiftType = shiftTypeByTemplateCode[templateCode];
    const contractId = contractIds[contract.contract_code];
    const companyId = companyIds[contract.company_key];

    if (!templateId || !contractId || !companyId) {
      throw new Error(`Contract seed mapping is missing for ${contract.contract_code}`);
    }

    members.forEach((member) => {
      const employeeId = employeeIds[member.employee_key];
      if (!employeeId) {
        throw new Error(`Employee not found for contract ${contract.contract_code}: ${member.employee_key}`);
      }

      iterDateRange(contract.start_date, contract.end_date, (shiftDate) => {
        reserveAssignment(employeeId, shiftDate, contract.contract_code);
        const actualTimes = buildActualCheckTimes(templateCode, shiftDate, employeeId);
        insertShift.run(
          employeeId,
          shiftDate,
          shiftType,
          templateId,
          actualTimes.check_in_time_actual,
          actualTimes.check_out_time_actual,
          `${templateCode === 'DAY' ? 'Ca ngay' : 'Ca dem'} - ${contract.contract_code}`,
          companyId,
          contractId,
          member.assignment_role || 'guard'
        );
      });
    });
  });

  internalShiftPlans.forEach((plan) => {
    const employeeId = employeeIds[plan.employee_key];
    const templateId = shiftTemplateIds[plan.shift_template_code];
    const shiftType = shiftTypeByTemplateCode[plan.shift_template_code];
    const assignmentRole = plan.employee_key.startsWith('hr_') ? 'hr' : 'guard';

    if (!employeeId || !templateId) {
      throw new Error(`Invalid internal shift plan for ${plan.employee_key}`);
    }

    iterDateRange(plan.date_from, plan.date_to, (shiftDate) => {
      reserveAssignment(employeeId, shiftDate, `internal:${plan.employee_key}`);
      const actualTimes = buildActualCheckTimes(plan.shift_template_code, shiftDate, employeeId);
      insertShift.run(
        employeeId,
        shiftDate,
        shiftType,
        templateId,
        actualTimes.check_in_time_actual,
        actualTimes.check_out_time_actual,
        plan.note || 'Ca noi bo cong ty',
        null,
        null,
        assignmentRole
      );
    });
  });

  leaveSeeds.forEach((leave) => {
    const employeeId = employeeIds[leave.employee_key];
    const approvedBy = leave.approved_by_username ? accountByUsername.get(leave.approved_by_username)?.id : null;
    const approvedAt = leave.status === 'pending' ? null : nowDateTime;
    const existing = leaveExists.get(employeeId, leave.leave_date, leave.duration_type);

    if (existing) {
      updateLeave.run(leave.reason || null, leave.status, approvedBy || null, approvedAt, leave.reject_reason || null, existing.id);
    } else {
      insertLeave.run(
        employeeId,
        leave.leave_date,
        leave.duration_type,
        leave.reason || null,
        leave.status,
        approvedBy || null,
        approvedAt,
        leave.reject_reason || null
      );
    }
  });

  announcementSeeds.forEach((announcement) => {
    const createdByEmployeeId = employeeIds[announcement.created_by_employee_key];
    const approvedBy = announcement.approved_by_username ? accountByUsername.get(announcement.approved_by_username)?.id : null;
    const approvedAt = announcement.status === 'pending' ? null : nowDateTime;
    const existing = announcementExists.get(createdByEmployeeId, announcement.title);
    const publishedAt = announcement.status === 'approved' ? (announcement.published_at || nowDateTime) : null;

    if (existing) {
      updateAnnouncement.run(
        announcement.content,
        announcement.status,
        approvedBy || null,
        approvedAt,
        announcement.reject_reason || null,
        publishedAt,
        existing.id
      );
    } else {
      insertAnnouncement.run(
        createdByEmployeeId,
        announcement.title,
        announcement.content,
        announcement.status,
        approvedBy || null,
        approvedAt,
        announcement.reject_reason || null,
        publishedAt
      );
    }
  });

  db.exec(`
    UPDATE shifts
    SET company_id = (
      SELECT ct.company_id
      FROM contracts ct
      WHERE ct.id = shifts.contract_id
    )
    WHERE contract_id IS NOT NULL
      AND (
        company_id IS NULL OR
        company_id != (
          SELECT ct.company_id
          FROM contracts ct
          WHERE ct.id = shifts.contract_id
        )
      );
  `);

  db.exec(`
    UPDATE shifts
    SET check_in_time_actual = shift_date || ' 08:00:00',
        check_out_time_actual = shift_date || ' 17:00:00'
    WHERE lower(COALESCE(shift_type, '')) = 'day'
      AND (check_in_time_actual IS NULL OR check_out_time_actual IS NULL);

    UPDATE shifts
    SET check_in_time_actual = shift_date || ' 22:00:00',
        check_out_time_actual = date(shift_date, '+1 day') || ' 06:00:00'
    WHERE lower(COALESCE(shift_type, '')) = 'night'
      AND (check_in_time_actual IS NULL OR check_out_time_actual IS NULL);
  `);

  // Force test cases for salary attendance:
  // - approved leave day should still count as attendance (guard_02 full day, guard_08 half day)
  // - missing check without approved leave should be counted as missing workday (guard_10)
  db.prepare(`
    UPDATE shifts
    SET check_in_time_actual = NULL, check_out_time_actual = NULL
    WHERE employee_id = ? AND shift_date = ?
  `).run(employeeIds.guard_02, leaveDates.now_02);

  db.prepare(`
    UPDATE shifts
    SET check_in_time_actual = NULL, check_out_time_actual = NULL
    WHERE employee_id = ? AND shift_date = ?
  `).run(employeeIds.guard_08, leaveDates.now_07);

  db.prepare(`
    UPDATE shifts
    SET check_in_time_actual = NULL, check_out_time_actual = NULL
    WHERE employee_id = ? AND shift_date = ?
  `).run(employeeIds.guard_10, leaveDates.now_09);

  const targetYears = [currentYear - 1, currentYear];
  Object.values(employeeIds).forEach((employeeId) => {
    targetYears.forEach((year) => {
      upsertLeaveBalance.run(employeeId, year, 12, 0, 12);
    });
  });

  const approvedUsageRows = db.prepare(`
    SELECT employee_id,
           CAST(substr(leave_date, 1, 4) AS INTEGER) AS year,
           SUM(
             CASE duration_type
               WHEN 'full_day' THEN 1.0
               WHEN 'half_day_morning' THEN 0.5
               WHEN 'half_day_afternoon' THEN 0.5
               ELSE 0
             END
           ) AS used_days
    FROM leave_requests
    WHERE status = 'approved'
    GROUP BY employee_id, CAST(substr(leave_date, 1, 4) AS INTEGER)
  `).all();

  approvedUsageRows.forEach((row) => {
    const usedDays = Number(row.used_days || 0);
    const remainingDays = Math.max(0, 12 - usedDays);
    upsertLeaveBalance.run(row.employee_id, row.year, 12, usedDays, remainingDays);
  });

  if (!adminId || !hrAccountId) {
    throw new Error('Failed to seed core accounts');
  }
});

try {
  seed();
  console.log('Seed data created successfully');
  console.log('Admin account: admin / admin123');
  console.log('HR account: hrstaff / hr123456');
  console.log('Ops account: opslead / ops123456');
  console.log('User samples: user1..user10 / user123');
  console.log(`Seed month snapshot: current=${nowMonth}, prev=${prevMonth}, prev2=${prev2Month}`);
  console.log('Seeded tables: employees, accounts, partner_companies, contracts, shift_templates, shifts, salaries, leave_requests, leave_balances, announcements');
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exit(1);
}
