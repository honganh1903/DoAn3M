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
const currentYear = now.getFullYear();
const nowDateTime = toDateTime(now);

const shiftTypeByTemplateCode = { DAY: 'day', NIGHT: 'night' };
const monthDays = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

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
  { contract_code: 'HD-ABC-001', company_key: 'abc', service_name: 'Bao ve nha may A', guard_quantity: 4, monthly_value: 78000000, note: 'Factory line 1' },
  { contract_code: 'HD-ABC-002', company_key: 'abc', service_name: 'Bao ve kho vat tu', guard_quantity: 2, monthly_value: 36000000, note: 'Warehouse zone' },
  { contract_code: 'HD-XYZ-001', company_key: 'xyz', service_name: 'Bao ve kho logistics', guard_quantity: 3, monthly_value: 51000000, note: 'Dock security' },
  { contract_code: 'HD-MNR-001', company_key: 'mnr', service_name: 'Bao ve trung tam phan phoi', guard_quantity: 2, monthly_value: 36000000, note: 'Distribution center' },
  { contract_code: 'HD-TVT-001', company_key: 'tvt', service_name: 'Bao ve nha may nang luong', guard_quantity: 3, monthly_value: 56000000, note: 'Plant area A' },
  { contract_code: 'HD-TVT-002', company_key: 'tvt', service_name: 'Bao ve cong truoc', guard_quantity: 2, monthly_value: 32000000, note: 'Main gate' },
  { contract_code: 'HD-ZMS-001', company_key: 'zms', service_name: 'Bao ve bai hang', guard_quantity: 3, monthly_value: 54000000, note: 'Goods yard' }
].map((item) => ({
  ...item,
  start_date: `${nowMonth}-01`,
  end_date: `${nowMonth}-28`,
  status: 'active'
}));

const shiftTemplates = [
  { code: 'DAY', name: 'Ca Ngay', check_in_time: '08:00', check_out_time: '17:00', work_pattern: 'daily', note: 'Ca ngay mac dinh' },
  { code: 'NIGHT', name: 'Ca Dem', check_in_time: '22:00', check_out_time: '06:00', work_pattern: 'daily', note: 'Ca dem mac dinh' }
];

const leaveSeeds = [
  { employee_key: 'guard_02', leave_date: `${nowMonth}-14`, duration_type: 'full_day', reason: 'Nghi phep viec gia dinh', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_04', leave_date: `${nowMonth}-16`, duration_type: 'half_day_morning', reason: 'Kham suc khoe dinh ky', status: 'pending', approved_by_username: null, reject_reason: null },
  { employee_key: 'guard_05', leave_date: `${nowMonth}-18`, duration_type: 'half_day_afternoon', reason: 'Viec ca nhan', status: 'rejected', approved_by_username: 'admin', reject_reason: 'Khong du nguoi thay ca' },
  { employee_key: 'guard_07', leave_date: `${nowMonth}-20`, duration_type: 'full_day', reason: 'Nghi phep ca nhan', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_08', leave_date: `${nowMonth}-21`, duration_type: 'half_day_afternoon', reason: 'Di kham benh', status: 'approved', approved_by_username: 'admin', reject_reason: null },
  { employee_key: 'guard_09', leave_date: `${nowMonth}-22`, duration_type: 'half_day_morning', reason: 'Lam thu tuc hanh chinh', status: 'pending', approved_by_username: null, reject_reason: null },
  { employee_key: 'hr_02', leave_date: `${nowMonth}-23`, duration_type: 'full_day', reason: 'Nghi phep nam', status: 'approved', approved_by_username: 'admin', reject_reason: null }
];

const announcementSeeds = [
  { created_by_employee_key: 'hr_01', title: 'Thong bao kiem tra dong phuc', content: 'Tat ca nhan vien bao ve thuc hien dong phuc dung quy dinh.', status: 'approved', approved_by_username: 'admin', reject_reason: null, published_at: nowDateTime },
  { created_by_employee_key: 'hr_01', title: 'Lich hop giao ban thang', content: 'Hop giao ban luc 09:00 sang thu 2 dau thang tai van phong.', status: 'pending', approved_by_username: null, reject_reason: null, published_at: null },
  { created_by_employee_key: 'guard_03', title: 'De xuat bo sung camera cong phu', content: 'De xuat bo sung 2 camera tai khu cong phu de giam sat xe vao.', status: 'rejected', approved_by_username: 'admin', reject_reason: 'Can bo sung chi phi va vi tri lap dat', published_at: null },
  { created_by_employee_key: 'hr_02', title: 'Thong bao quy trinh ban giao ca', content: 'Ca truoc phai ban giao day du so truc va su kien cho ca sau.', status: 'approved', approved_by_username: 'admin', reject_reason: null, published_at: nowDateTime }
];

const employeeByCard = db.prepare('SELECT id FROM employees WHERE id_card = ?');
const accountByUsername = db.prepare('SELECT id FROM accounts WHERE username = ?');
const companyByTaxCode = db.prepare('SELECT id FROM partner_companies WHERE tax_code = ?');
const contractByCode = db.prepare('SELECT id FROM contracts WHERE contract_code = ?');
const shiftTemplateByCode = db.prepare('SELECT id FROM shift_templates WHERE code = ?');
const shiftExists = db.prepare('SELECT id FROM shifts WHERE employee_id = ? AND shift_date = ? AND shift_template_id = ?');
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
  INSERT INTO contracts (company_id, contract_code, service_name, start_date, end_date, guard_quantity, monthly_value, status, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateContract = db.prepare(`
  UPDATE contracts
  SET company_id = ?, service_name = ?, start_date = ?, end_date = ?, guard_quantity = ?, monthly_value = ?, status = ?, note = ?
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
  INSERT INTO shifts (employee_id, shift_date, shift_type, shift_template_id, note, company_id, contract_id, assignment_role)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateShift = db.prepare(`
  UPDATE shifts
  SET shift_type = ?, note = ?, company_id = ?, contract_id = ?, assignment_role = ?, shift_template_id = ?
  WHERE id = ?
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

const getLeaveDays = (durationType) => {
  if (durationType === 'full_day') return 1;
  if (durationType === 'half_day_morning' || durationType === 'half_day_afternoon') return 0.5;
  return 0;
};

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

  contractSeeds.forEach((contract) => {
    const companyId = companyIds[contract.company_key];
    const existing = contractByCode.get(contract.contract_code);

    if (existing) {
      updateContract.run(
        companyId,
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

  const salaryProfiles = {};
  guardProfiles.forEach((guard, index) => {
    salaryProfiles[guard.key] = {
      base: 7800000 + (index * 250000),
      bonus: 250000 + (index % 4) * 90000
    };
  });
  salaryProfiles.hr_01 = { base: 12000000, bonus: 700000 };
  salaryProfiles.hr_02 = { base: 11000000, bonus: 550000 };

  const salaryMonths = [prev2Month, prevMonth, nowMonth];
  Object.keys(salaryProfiles).forEach((employeeKey) => {
    const employeeId = employeeIds[employeeKey];
    const profile = salaryProfiles[employeeKey];
    salaryMonths.forEach((month, monthIndex) => {
      const deduction = monthIndex === 2 ? (employeeKey.startsWith('guard') ? (monthIndex + employeeId) % 3 * 50000 : 0) : 0;
      const paid = month === nowMonth ? 0 : 1;
      const total = profile.base + profile.bonus - deduction;
      upsertSalary.run(employeeId, month, profile.base, profile.bonus, deduction, total, `Luong thang ${month}`, paid);
    });
  });

  const contractRotation = ['HD-ABC-001', 'HD-ABC-002', 'HD-XYZ-001', 'HD-MNR-001', 'HD-TVT-001', 'HD-TVT-002', 'HD-ZMS-001'];
  guardProfiles.forEach((guard, guardIndex) => {
    const employeeId = employeeIds[guard.key];
    monthDays.forEach((day, shiftIndex) => {
      const templateCode = shiftIndex % 2 === 0 ? 'DAY' : 'NIGHT';
      const templateId = shiftTemplateIds[templateCode];
      const shiftType = shiftTypeByTemplateCode[templateCode];
      const contractCode = contractRotation[(guardIndex + shiftIndex) % contractRotation.length];
      const contractId = contractIds[contractCode];
      const companyKey = contractSeeds.find((item) => item.contract_code === contractCode).company_key;
      const companyId = companyIds[companyKey];
      const shiftDate = `${nowMonth}-${String(day).padStart(2, '0')}`;
      const assignmentRole = guardIndex % 4 === 0 ? 'team_leader' : (guardIndex % 5 === 0 ? 'supervisor' : 'guard');
      const note = `${templateCode === 'DAY' ? 'Ca ngay' : 'Ca dem'} - ${contractCode}`;

      const existing = shiftExists.get(employeeId, shiftDate, templateId);
      if (existing) {
        updateShift.run(shiftType, note, companyId, contractId, assignmentRole, templateId, existing.id);
      } else {
        insertShift.run(employeeId, shiftDate, shiftType, templateId, note, companyId, contractId, assignmentRole);
      }
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
