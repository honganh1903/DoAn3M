require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

const nowMonth = new Date().toISOString().slice(0, 7);

const employees = [
  {
    first_name: 'Nguyen',
    last_name: 'Van An',
    birth_date: '1995-02-10',
    gender: 'male',
    id_card: '079095000001',
    social_insurance_no: 'BHXH000001',
    employee_type: 'guard',
    phone: '0901000001',
    address: 'Quan 1, TP.HCM',
    department: 'Toa nha A',
    hire_date: '2024-01-10',
    status: 'active'
  },
  {
    first_name: 'Tran',
    last_name: 'Thi Binh',
    birth_date: '1997-07-14',
    gender: 'female',
    id_card: '079097000002',
    social_insurance_no: 'BHXH000002',
    employee_type: 'guard',
    phone: '0901000002',
    address: 'Quan 7, TP.HCM',
    department: 'Kho trung tam',
    hire_date: '2024-03-01',
    status: 'active'
  },
  {
    first_name: 'Le',
    last_name: 'Quoc Cuong',
    birth_date: '1992-11-20',
    gender: 'male',
    id_card: '079092000003',
    social_insurance_no: 'BHXH000003',
    employee_type: 'guard',
    phone: '0901000003',
    address: 'Thu Duc, TP.HCM',
    department: 'Khu cong nghiep',
    hire_date: '2023-12-15',
    status: 'active'
  }
];

const hrEmployeeProfile = {
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
};

const partnerCompanies = [
  {
    company_name: 'Cong ty ABC Manufacturing',
    tax_code: '0312345678',
    contact_name: 'Pham Quang Huy',
    contact_phone: '0912000001',
    contact_email: 'huy@abcmfg.vn',
    address: 'KCN Tan Tao, TP.HCM',
    note: 'Factory security client'
  },
  {
    company_name: 'Cong ty XYZ Logistics',
    tax_code: '0312345679',
    contact_name: 'Vo Minh Chau',
    contact_phone: '0912000002',
    contact_email: 'chau@xyzlog.vn',
    address: 'Song Than, Binh Duong',
    note: 'Warehouse security client'
  }
];

const accountExists = db.prepare('SELECT id FROM accounts WHERE username = ?');
const employeeByCard = db.prepare('SELECT id FROM employees WHERE id_card = ?');
const companyByTaxCode = db.prepare('SELECT id FROM partner_companies WHERE tax_code = ?');
const branchByName = db.prepare('SELECT id, company_id FROM partner_branches WHERE company_id = ? AND branch_name = ?');
const contractByCode = db.prepare('SELECT id FROM contracts WHERE contract_code = ?');
const shiftExists = db.prepare('SELECT id FROM shifts WHERE employee_id = ? AND shift_date = ? AND shift_type = ?');

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
  INSERT INTO accounts (username, password, role, employee_id, can_manage_salary)
  VALUES (?, ?, ?, ?, ?)
`);
const updateAccountRole = db.prepare('UPDATE accounts SET role = ?, employee_id = ?, can_manage_salary = ? WHERE username = ?');
const updateAccountPassword = db.prepare('UPDATE accounts SET password = ? WHERE username = ?');
const insertCompany = db.prepare(`
  INSERT INTO partner_companies (company_name, tax_code, contact_name, contact_phone, contact_email, address, status, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertBranch = db.prepare(`
  INSERT INTO partner_branches (company_id, branch_name, address, area, contact_name, contact_phone, status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertContract = db.prepare(`
  INSERT INTO contracts (company_id, branch_id, contract_code, service_name, start_date, end_date, guard_quantity, monthly_value, status, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSalary = db.prepare(`
  INSERT OR IGNORE INTO salaries (employee_id, month, base_salary, bonus, deduction, total, note, paid)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertShift = db.prepare(`
  INSERT INTO shifts (employee_id, shift_date, shift_type, note, company_id, branch_id, contract_id, assignment_role)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateShift = db.prepare(`
  UPDATE shifts
  SET note = ?, company_id = ?, branch_id = ?, contract_id = ?, assignment_role = ?
  WHERE id = ?
`);

const seed = db.transaction(() => {
  if (!accountExists.get('admin')) {
    insertAccount.run('admin', bcrypt.hashSync('admin123', 10), 'admin', null, 1);
  } else {
    updateAccountRole.run('admin', null, 1, 'admin');
    updateAccountPassword.run(bcrypt.hashSync('admin123', 10), 'admin');
  }

  const hrFullName = `${hrEmployeeProfile.first_name} ${hrEmployeeProfile.last_name}`.trim();
  const hrExisting = employeeByCard.get(hrEmployeeProfile.id_card);
  let hrEmployeeId;

  if (hrExisting) {
    hrEmployeeId = hrExisting.id;
    updateEmployee.run(
      hrEmployeeProfile.first_name,
      hrEmployeeProfile.last_name,
      hrFullName,
      hrEmployeeProfile.birth_date,
      hrEmployeeProfile.gender,
      hrEmployeeProfile.social_insurance_no,
      hrEmployeeProfile.employee_type,
      hrEmployeeProfile.phone,
      hrEmployeeProfile.address,
      hrEmployeeProfile.department,
      hrEmployeeProfile.hire_date,
      hrEmployeeProfile.status,
      hrEmployeeId
    );
  } else {
    const hrResult = insertEmployee.run(
      hrEmployeeProfile.first_name,
      hrEmployeeProfile.last_name,
      hrFullName,
      hrEmployeeProfile.birth_date,
      hrEmployeeProfile.gender,
      hrEmployeeProfile.id_card,
      hrEmployeeProfile.social_insurance_no,
      hrEmployeeProfile.employee_type,
      hrEmployeeProfile.phone,
      hrEmployeeProfile.address,
      hrEmployeeProfile.department,
      hrEmployeeProfile.hire_date,
      hrEmployeeProfile.status
    );
    hrEmployeeId = Number(hrResult.lastInsertRowid);
  }

  if (!accountExists.get('hrstaff')) {
    insertAccount.run('hrstaff', bcrypt.hashSync('hr123456', 10), 'employee', hrEmployeeId, 1);
  } else {
    updateAccountRole.run('employee', hrEmployeeId, 1, 'hrstaff');
    updateAccountPassword.run(bcrypt.hashSync('hr123456', 10), 'hrstaff');
  }

  const employeeIds = employees.map((employee, index) => {
    const existing = employeeByCard.get(employee.id_card);
    const fullName = `${employee.first_name} ${employee.last_name}`.trim();

    let employeeId;
    if (existing) {
      employeeId = existing.id;
      updateEmployee.run(
        employee.first_name,
        employee.last_name,
        fullName,
        employee.birth_date,
        employee.gender,
        employee.social_insurance_no,
        employee.employee_type,
        employee.phone,
        employee.address,
        employee.department,
        employee.hire_date,
        employee.status,
        employeeId
      );
    } else {
      const result = insertEmployee.run(
        employee.first_name,
        employee.last_name,
        fullName,
        employee.birth_date,
        employee.gender,
        employee.id_card,
        employee.social_insurance_no,
        employee.employee_type,
        employee.phone,
        employee.address,
        employee.department,
        employee.hire_date,
        employee.status
      );
      employeeId = Number(result.lastInsertRowid);
    }

    const username = `user${index + 1}`;
    if (!accountExists.get(username)) {
      insertAccount.run(username, bcrypt.hashSync('user123', 10), 'user', employeeId, 0);
    } else {
      updateAccountRole.run('user', employeeId, 0, username);
      updateAccountPassword.run(bcrypt.hashSync('user123', 10), username);
    }

    return employeeId;
  });

  ['employee1', 'employee2', 'employee3'].forEach((username) => {
    const existing = accountExists.get(username);
    if (existing) {
      db.prepare('UPDATE accounts SET role = ?, can_manage_salary = ? WHERE username = ?').run('user', 0, username);
    }
  });

  const companyIds = partnerCompanies.map((company) => {
    const existing = companyByTaxCode.get(company.tax_code);
    if (existing) {
      return existing.id;
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

    return Number(result.lastInsertRowid);
  });

  const branchSeeds = [
    {
      company_id: companyIds[0],
      branch_name: 'Nha may Tan Tao',
      address: 'Lo A2, KCN Tan Tao, TP.HCM',
      area: 'Khu san xuat',
      contact_name: 'Pham Quang Huy',
      contact_phone: '0912000001'
    },
    {
      company_id: companyIds[1],
      branch_name: 'Kho Song Than',
      address: 'Duong so 8, Song Than, Binh Duong',
      area: 'Kho logistics',
      contact_name: 'Vo Minh Chau',
      contact_phone: '0912000002'
    }
  ];

  const branchIds = branchSeeds.map((branch) => {
    const existing = branchByName.get(branch.company_id, branch.branch_name);
    if (existing) {
      return existing.id;
    }

    const result = insertBranch.run(
      branch.company_id,
      branch.branch_name,
      branch.address,
      branch.area,
      branch.contact_name,
      branch.contact_phone,
      'active'
    );

    return Number(result.lastInsertRowid);
  });

  const contractSeeds = [
    {
      company_id: companyIds[0],
      branch_id: branchIds[0],
      contract_code: 'HD-ABC-001',
      service_name: 'Factory security service 24/7',
      start_date: `${nowMonth}-01`,
      end_date: `${nowMonth}-28`,
      guard_quantity: 2,
      monthly_value: 45000000,
      note: 'Factory area security contract'
    },
    {
      company_id: companyIds[1],
      branch_id: branchIds[1],
      contract_code: 'HD-XYZ-001',
      service_name: 'Warehouse security service',
      start_date: `${nowMonth}-01`,
      end_date: `${nowMonth}-28`,
      guard_quantity: 1,
      monthly_value: 22000000,
      note: 'Warehouse security contract'
    }
  ];

  const contractIds = contractSeeds.map((contract) => {
    const existing = contractByCode.get(contract.contract_code);
    if (existing) {
      return existing.id;
    }

    const result = insertContract.run(
      contract.company_id,
      contract.branch_id,
      contract.contract_code,
      contract.service_name,
      contract.start_date,
      contract.end_date,
      contract.guard_quantity,
      contract.monthly_value,
      'active',
      contract.note
    );

    return Number(result.lastInsertRowid);
  });

  employeeIds.forEach((employeeId, index) => {
    const baseSalary = 8000000 + index * 1500000;
    const bonus = 500000 + index * 200000;
    const deduction = index * 100000;

    insertSalary.run(
      employeeId,
      nowMonth,
      baseSalary,
      bonus,
      deduction,
      baseSalary + bonus - deduction,
      'Sample salary data',
      0
    );
  });

  const shiftSeeds = [
    {
      employee_id: employeeIds[0],
      shift_date: `${nowMonth}-05`,
      shift_type: 'morning',
      note: 'Morning shift at factory',
      company_id: companyIds[0],
      branch_id: branchIds[0],
      contract_id: contractIds[0],
      assignment_role: 'guard'
    },
    {
      employee_id: employeeIds[1],
      shift_date: `${nowMonth}-05`,
      shift_type: 'night',
      note: 'Night shift team supervision',
      company_id: companyIds[0],
      branch_id: branchIds[0],
      contract_id: contractIds[0],
      assignment_role: 'team_leader'
    },
    {
      employee_id: employeeIds[2],
      shift_date: `${nowMonth}-10`,
      shift_type: 'afternoon',
      note: 'Afternoon warehouse supervision',
      company_id: companyIds[1],
      branch_id: branchIds[1],
      contract_id: contractIds[1],
      assignment_role: 'supervisor'
    }
  ];

  shiftSeeds.forEach((shift) => {
    const existing = shiftExists.get(shift.employee_id, shift.shift_date, shift.shift_type);

    if (existing) {
      updateShift.run(
        shift.note,
        shift.company_id,
        shift.branch_id,
        shift.contract_id,
        shift.assignment_role,
        existing.id
      );
      return;
    }

    insertShift.run(
      shift.employee_id,
      shift.shift_date,
      shift.shift_type,
      shift.note,
      shift.company_id,
      shift.branch_id,
      shift.contract_id,
      shift.assignment_role
    );
  });
});

try {
  seed();
  console.log('Seed data created successfully');
  console.log('Admin account: admin / admin123');
  console.log('HR account: hrstaff / hr123456');
  console.log('User account: user1 / user123');
  console.log('Added partner companies, branches, contracts, and shift assignments');
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exit(1);
}

