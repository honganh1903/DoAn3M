/**
 * Script tạo báo cáo thiết kế cơ sở dữ liệu
 * Output: docs/06.2025-KLTN.ProjectDatabase.docx
 */
const path = require('path');
const fs   = require('fs');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  TableOfContents, ShadingType, VerticalAlign, PageOrientation,
  convertInchesToTwip, Header, Footer, PageNumber
} = require('docx');

// ─────────────────────────────────────────────────────────────
// 1. SCHEMA DATA (from actual database)
// ─────────────────────────────────────────────────────────────
const TABLES = [
  {
    id: 'employees',
    group: 'Nhân sự',
    desc: 'Lưu trữ thông tin cơ bản của nhân viên trong công ty bảo vệ.',
    fields: [
      { name:'id',                  type:'INTEGER', nn:true,  pk:true,  fk:false, default:null,           desc:'Khóa chính, tự tăng' },
      { name:'first_name',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Họ' },
      { name:'last_name',           type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Tên' },
      { name:'full_name',           type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Tên đầy đủ (tự sinh)' },
      { name:'avatar_url',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Đường dẫn ảnh đại diện' },
      { name:'birth_date',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Ngày sinh (YYYY-MM-DD)' },
      { name:'gender',              type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Giới tính (male/female)' },
      { name:'id_card',             type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Số căn cước công dân (UNIQUE)' },
      { name:'social_insurance_no', type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Số bảo hiểm xã hội (UNIQUE)' },
      { name:'employee_type',       type:'TEXT',    nn:false, pk:false, fk:false, default:"'guard'",      desc:'Loại nhân viên: guard | hr' },
      { name:'phone',               type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Số điện thoại' },
      { name:'address',             type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Địa chỉ' },
      { name:'department',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Phòng ban / vị trí làm việc' },
      { name:'hire_date',           type:'TEXT',    nn:false, pk:false, fk:false, default:null,           desc:'Ngày vào làm (YYYY-MM-DD)' },
      { name:'status',              type:'TEXT',    nn:false, pk:false, fk:false, default:"'active'",     desc:'Trạng thái: active | resigned' },
      { name:'created_at',          type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo bản ghi' },
    ],
    indexes: [
      { name:'idx_employees_employee_type',    cols:'employee_type',      unique:false },
      { name:'idx_employees_social_insurance_no', cols:'social_insurance_no', unique:true, partial:'WHERE social_insurance_no IS NOT NULL' },
      { name:'sqlite_autoindex_employees_1',   cols:'id_card',            unique:true },
    ],
    relations: []
  },
  {
    id: 'accounts',
    group: 'Nhân sự',
    desc: 'Lưu tài khoản đăng nhập hệ thống. Mỗi tài khoản liên kết tối đa một nhân viên (1:1).',
    fields: [
      { name:'id',               type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'username',         type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Tên đăng nhập (UNIQUE)' },
      { name:'password',         type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Mật khẩu đã mã hóa bcrypt' },
      { name:'role',             type:'TEXT',    nn:true,  pk:false, fk:false, default:"'user'",         desc:'Vai trò: admin | employee | user' },
      { name:'employee_id',      type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → employees.id (nullable, 1:1)' },
      { name:'avatar_url',       type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ảnh đại diện tài khoản' },
      { name:'can_manage_salary',type:'INTEGER', nn:false, pk:false, fk:false, default:'0',              desc:'Quyền quản lý lương (0/1)' },
      { name:'created_at',       type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
      { name:'is_active',        type:'INTEGER', nn:false, pk:false, fk:false, default:'1',              desc:'Trạng thái hoạt động (0/1)' },
    ],
    indexes: [
      { name:'idx_accounts_employee_unique', cols:'employee_id', unique:true, partial:'WHERE employee_id IS NOT NULL' },
      { name:'sqlite_autoindex_accounts_1',  cols:'username',    unique:true },
    ],
    relations: [
      { fk:'employee_id', ref:'employees.id', type:'N:1 (thực tế 1:1)', desc:'Mỗi tài khoản liên kết tối đa 1 nhân viên' }
    ]
  },
  {
    id: 'employee_contracts',
    group: 'Nhân sự',
    desc: 'Lưu hợp đồng lao động của nhân viên. Một nhân viên có thể có nhiều hợp đồng (thử việc → chính thức).',
    fields: [
      { name:'id',            type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'employee_id',   type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → employees.id' },
      { name:'contract_code', type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Mã hợp đồng (UNIQUE)' },
      { name:'contract_type', type:'TEXT',    nn:true,  pk:false, fk:false, default:"'definite'",     desc:'Loại: probation | definite | indefinite' },
      { name:'position',      type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Chức vụ ghi trong hợp đồng' },
      { name:'department',    type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Phòng ban ghi trong hợp đồng' },
      { name:'base_salary',   type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Lương cơ bản theo hợp đồng' },
      { name:'allowance',     type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Phụ cấp theo hợp đồng' },
      { name:'start_date',    type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Ngày bắt đầu hợp đồng (YYYY-MM-DD)' },
      { name:'end_date',      type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ngày kết thúc (null = vô thời hạn)' },
      { name:'signing_date',  type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ngày ký hợp đồng' },
      { name:'signed_by',     type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Người ký (tên giám đốc)' },
      { name:'status',        type:'TEXT',    nn:false, pk:false, fk:false, default:"'active'",       desc:'Trạng thái: active | expired | terminated | pending' },
      { name:'note',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ghi chú' },
      { name:'created_at',    type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
    ],
    indexes: [
      { name:'sqlite_autoindex_employee_contracts_1', cols:'contract_code', unique:true },
      { name:'idx_employee_contracts_employee',       cols:'employee_id',   unique:false },
      { name:'idx_employee_contracts_status',         cols:'status',        unique:false },
    ],
    relations: [
      { fk:'employee_id', ref:'employees.id', type:'N:1', desc:'Nhiều hợp đồng thuộc về 1 nhân viên' }
    ]
  },
  {
    id: 'salaries',
    group: 'Lương & Chấm công',
    desc: 'Lưu bảng lương hàng tháng của nhân viên. Ràng buộc UNIQUE(employee_id, month) đảm bảo mỗi tháng chỉ có một bản lương.',
    fields: [
      { name:'id',          type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'employee_id', type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → employees.id' },
      { name:'month',       type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Tháng lương định dạng YYYY-MM' },
      { name:'base_salary', type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Lương cơ bản' },
      { name:'bonus',       type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Thưởng / phụ cấp' },
      { name:'deduction',   type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Khấu trừ (vi phạm, nghỉ không phép...)' },
      { name:'total',       type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Tổng lương thực nhận' },
      { name:'note',        type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ghi chú' },
      { name:'paid',        type:'INTEGER', nn:false, pk:false, fk:false, default:'0',              desc:'Đã thanh toán: 0=chưa, 1=đã' },
      { name:'created_at',  type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
    ],
    indexes: [
      { name:'idx_salaries_employee_month', cols:'(employee_id, month)', unique:true },
    ],
    relations: [
      { fk:'employee_id', ref:'employees.id', type:'N:1', desc:'Nhiều bản lương thuộc về 1 nhân viên' }
    ]
  },
  {
    id: 'shift_templates',
    group: 'Lương & Chấm công',
    desc: 'Định nghĩa mẫu ca làm việc (ca ngày / ca đêm). Dùng làm chuẩn để đánh giá đúng giờ khi chấm công.',
    fields: [
      { name:'id',             type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'code',           type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Mã ca (UNIQUE): DAY | NIGHT' },
      { name:'name',           type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Tên ca' },
      { name:'check_in_time',  type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Giờ vào ca chuẩn (HH:MM)' },
      { name:'check_out_time', type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Giờ ra ca chuẩn (HH:MM)' },
      { name:'work_pattern',   type:'TEXT',    nn:false, pk:false, fk:false, default:"'daily'",        desc:'Chu kỳ làm việc: daily' },
      { name:'note',           type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ghi chú' },
      { name:'status',         type:'TEXT',    nn:false, pk:false, fk:false, default:"'active'",       desc:'Trạng thái: active | inactive' },
      { name:'created_at',     type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
    ],
    indexes: [
      { name:'sqlite_autoindex_shift_templates_1', cols:'code',   unique:true },
      { name:'idx_shift_templates_status',         cols:'status', unique:false },
    ],
    relations: []
  },
  {
    id: 'shifts',
    group: 'Lương & Chấm công',
    desc: 'Ghi nhận lịch làm việc và kết quả chấm công (check-in/check-out thực tế) của từng nhân viên.',
    fields: [
      { name:'id',                    type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'employee_id',           type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → employees.id' },
      { name:'shift_date',            type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Ngày làm việc (YYYY-MM-DD)' },
      { name:'shift_type',            type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Loại ca: day | night' },
      { name:'shift_template_id',     type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → shift_templates.id' },
      { name:'check_in_time_actual',  type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Giờ vào thực tế' },
      { name:'check_out_time_actual', type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Giờ ra thực tế' },
      { name:'note',                  type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ghi chú' },
      { name:'company_id',            type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → partner_companies.id' },
      { name:'contract_id',           type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → contracts.id (hợp đồng dịch vụ)' },
      { name:'assignment_role',       type:'TEXT',    nn:false, pk:false, fk:false, default:"'guard'",        desc:'Vai trò ca: guard | team_leader | supervisor | hr' },
      { name:'created_at',            type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
    ],
    indexes: [],
    relations: [
      { fk:'employee_id',       ref:'employees.id',         type:'N:1', desc:'Nhiều ca thuộc về 1 nhân viên' },
      { fk:'shift_template_id', ref:'shift_templates.id',   type:'N:1', desc:'Ca áp dụng mẫu ca nào' },
      { fk:'company_id',        ref:'partner_companies.id', type:'N:1', desc:'Ca thực hiện tại công ty đối tác nào' },
      { fk:'contract_id',       ref:'contracts.id',         type:'N:1', desc:'Ca thuộc hợp đồng dịch vụ nào' },
    ]
  },
  {
    id: 'leave_requests',
    group: 'Lương & Chấm công',
    desc: 'Quản lý đơn xin nghỉ phép của nhân viên với quy trình duyệt.',
    fields: [
      { name:'id',           type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'employee_id',  type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → employees.id' },
      { name:'leave_date',   type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Ngày nghỉ (YYYY-MM-DD)' },
      { name:'duration_type',type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Loại: full_day | half_day_morning | half_day_afternoon' },
      { name:'reason',       type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Lý do nghỉ' },
      { name:'status',       type:'TEXT',    nn:false, pk:false, fk:false, default:"'pending'",      desc:'Trạng thái: pending | approved | rejected' },
      { name:'approved_by',  type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → accounts.id (người duyệt)' },
      { name:'approved_at',  type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Thời điểm duyệt' },
      { name:'reject_reason',type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Lý do từ chối' },
      { name:'created_at',   type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo đơn' },
    ],
    indexes: [
      { name:'idx_leave_requests_employee', cols:'(employee_id, leave_date)', unique:false },
      { name:'idx_leave_requests_status',   cols:'status',                    unique:false },
    ],
    relations: [
      { fk:'employee_id', ref:'employees.id', type:'N:1', desc:'Nhiều đơn phép thuộc về 1 nhân viên' },
      { fk:'approved_by', ref:'accounts.id',  type:'N:1', desc:'Người duyệt là tài khoản nào' },
    ]
  },
  {
    id: 'leave_balances',
    group: 'Lương & Chấm công',
    desc: 'Theo dõi số ngày phép năm còn lại của từng nhân viên. UNIQUE(employee_id, year) đảm bảo mỗi năm chỉ có một bản ghi.',
    fields: [
      { name:'id',             type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'employee_id',    type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → employees.id' },
      { name:'year',           type:'INTEGER', nn:true,  pk:false, fk:false, default:null,             desc:'Năm' },
      { name:'total_days',     type:'REAL',    nn:false, pk:false, fk:false, default:'12',             desc:'Tổng số ngày phép năm' },
      { name:'used_days',      type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Số ngày đã nghỉ' },
      { name:'remaining_days', type:'REAL',    nn:false, pk:false, fk:false, default:'12',             desc:'Số ngày còn lại' },
      { name:'updated_at',     type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Cập nhật lần cuối' },
    ],
    indexes: [
      { name:'idx_leave_balances_employee_year', cols:'(employee_id, year)', unique:true },
    ],
    relations: [
      { fk:'employee_id', ref:'employees.id', type:'N:1', desc:'Số dư phép của 1 nhân viên theo năm' }
    ]
  },
  {
    id: 'partner_companies',
    group: 'Đối tác & Hợp đồng dịch vụ',
    desc: 'Danh sách các công ty đối tác thuê dịch vụ bảo vệ.',
    fields: [
      { name:'id',            type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'company_name',  type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Tên công ty' },
      { name:'tax_code',      type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Mã số thuế (UNIQUE)' },
      { name:'contact_name',  type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Người liên hệ' },
      { name:'contact_phone', type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Điện thoại liên hệ' },
      { name:'contact_email', type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Email liên hệ' },
      { name:'address',       type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Địa chỉ' },
      { name:'status',        type:'TEXT',    nn:false, pk:false, fk:false, default:"'active'",       desc:'Trạng thái: active | inactive' },
      { name:'note',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ghi chú' },
      { name:'created_at',    type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
    ],
    indexes: [
      { name:'sqlite_autoindex_partner_companies_1', cols:'tax_code', unique:true },
    ],
    relations: []
  },
  {
    id: 'contracts',
    group: 'Đối tác & Hợp đồng dịch vụ',
    desc: 'Hợp đồng dịch vụ bảo vệ giữa công ty và đối tác. Mỗi hợp đồng chỉ định mẫu ca và số lượng bảo vệ cần bố trí.',
    fields: [
      { name:'id',               type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'company_id',       type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → partner_companies.id' },
      { name:'shift_template_id',type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → shift_templates.id' },
      { name:'contract_code',    type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Mã hợp đồng dịch vụ (UNIQUE)' },
      { name:'service_name',     type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Tên dịch vụ' },
      { name:'start_date',       type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ngày bắt đầu' },
      { name:'end_date',         type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ngày kết thúc' },
      { name:'guard_quantity',   type:'INTEGER', nn:false, pk:false, fk:false, default:'0',              desc:'Số lượng bảo vệ cần bố trí' },
      { name:'monthly_value',    type:'REAL',    nn:false, pk:false, fk:false, default:'0',              desc:'Giá trị hợp đồng hàng tháng (VNĐ)' },
      { name:'status',           type:'TEXT',    nn:false, pk:false, fk:false, default:"'active'",       desc:'Trạng thái: active | inactive' },
      { name:'note',             type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Ghi chú' },
      { name:'created_at',       type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
    ],
    indexes: [
      { name:'sqlite_autoindex_contracts_1', cols:'contract_code', unique:true },
      { name:'idx_contracts_company',        cols:'company_id',    unique:false },
    ],
    relations: [
      { fk:'company_id',        ref:'partner_companies.id', type:'N:1', desc:'Nhiều hợp đồng DV thuộc về 1 đối tác' },
      { fk:'shift_template_id', ref:'shift_templates.id',   type:'N:1', desc:'Hợp đồng áp dụng mẫu ca nào' },
    ]
  },
  {
    id: 'announcements',
    group: 'Thông báo',
    desc: 'Quản lý thông báo nội bộ với quy trình phê duyệt trước khi đăng.',
    fields: [
      { name:'created_by_employee_id', type:'INTEGER', nn:true,  pk:false, fk:true,  default:null,             desc:'FK → employees.id (người tạo)' },
      { name:'id',                     type:'INTEGER', nn:false, pk:true,  fk:false, default:null,             desc:'Khóa chính, tự tăng' },
      { name:'title',                  type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Tiêu đề thông báo' },
      { name:'content',                type:'TEXT',    nn:true,  pk:false, fk:false, default:null,             desc:'Nội dung thông báo' },
      { name:'status',                 type:'TEXT',    nn:false, pk:false, fk:false, default:"'pending'",      desc:'Trạng thái: pending | approved | rejected' },
      { name:'approved_by',            type:'INTEGER', nn:false, pk:false, fk:true,  default:null,             desc:'FK → accounts.id (người duyệt)' },
      { name:'approved_at',            type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Thời điểm duyệt' },
      { name:'reject_reason',          type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Lý do từ chối' },
      { name:'created_at',             type:'TEXT',    nn:false, pk:false, fk:false, default:"datetime('now')", desc:'Thời điểm tạo' },
      { name:'published_at',           type:'TEXT',    nn:false, pk:false, fk:false, default:null,             desc:'Thời điểm đăng' },
    ],
    indexes: [
      { name:'idx_announcements_status', cols:'(status, created_at DESC)', unique:false },
    ],
    relations: [
      { fk:'created_by_employee_id', ref:'employees.id', type:'N:1', desc:'Thông báo được tạo bởi nhân viên nào' },
      { fk:'approved_by',            ref:'accounts.id',  type:'N:1', desc:'Tài khoản nào duyệt thông báo' },
    ]
  },
];

// ─────────────────────────────────────────────────────────────
// 2. STYLE HELPERS
// ─────────────────────────────────────────────────────────────
const FONT = 'Times New Roman';
const FONT_SIZE = 24; // half-points → 12pt
const FONT_SIZE_SM = 20; // 10pt

const COLOR_HEADER  = '1F3864'; // dark navy
const COLOR_SUBHEAD = '2E5FAA'; // blue
const COLOR_TH_BG   = 'BDD7EE'; // light blue table header
const COLOR_TH_GROUP= 'D6E4F7';
const COLOR_BORDER  = '4472C4';
const COLOR_PK      = 'FFF2CC'; // yellow
const COLOR_FK      = 'EDE9FE'; // purple

const borders = (color = COLOR_BORDER) => ({
  top:    { style: BorderStyle.SINGLE, size: 4, color },
  bottom: { style: BorderStyle.SINGLE, size: 4, color },
  left:   { style: BorderStyle.SINGLE, size: 4, color },
  right:  { style: BorderStyle.SINGLE, size: 4, color },
});

const cell = (text, opts = {}) => new TableCell({
  children: [new Paragraph({
    children: [new TextRun({
      text: String(text ?? ''),
      font: FONT,
      size: opts.size || FONT_SIZE_SM,
      bold: opts.bold || false,
      color: opts.color || '000000',
    })],
    alignment: opts.align || AlignmentType.LEFT,
  })],
  shading: opts.bg ? { type: ShadingType.SOLID, color: opts.bg } : undefined,
  borders: borders(),
  verticalAlign: VerticalAlign.CENTER,
  width: opts.width ? { size: opts.width, type: WidthType.DXA } : { size: 1, type: WidthType.AUTO },
  columnSpan: opts.span,
  rowSpan:    opts.rowSpan,
});

const heading1 = (text) => new Paragraph({
  children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: COLOR_HEADER })],
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 120 },
});

const heading2 = (text) => new Paragraph({
  children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: COLOR_SUBHEAD })],
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 80 },
});

const heading3 = (text) => new Paragraph({
  children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: '1F497D' })],
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 60 },
});

const para = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONT, size: opts.size || FONT_SIZE, bold: opts.bold || false, italics: opts.italic || false })],
  spacing: { before: opts.before || 60, after: opts.after || 60 },
  indent: opts.indent ? { left: convertInchesToTwip(0.3) } : undefined,
});

const empty = () => new Paragraph({ children: [], spacing: { before: 80, after: 80 } });

// ─────────────────────────────────────────────────────────────
// 3. TABLE BUILDERS
// ─────────────────────────────────────────────────────────────
function buildFieldTable(tbl) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('STT',          { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:400 }),
      cell('Tên cột',      { bold:true, bg:COLOR_TH_BG, width:1900 }),
      cell('Kiểu dữ liệu',{ bold:true, bg:COLOR_TH_BG, width:1400 }),
      cell('Bắt buộc',    { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:900 }),
      cell('Khóa',        { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:800 }),
      cell('Mặc định',    { bold:true, bg:COLOR_TH_BG, width:1400 }),
      cell('Mô tả',       { bold:true, bg:COLOR_TH_BG, width:3800 }),
    ],
  });

  const rows = tbl.fields.map((f, i) => {
    const bgColor = f.pk ? COLOR_PK : f.fk ? COLOR_FK : undefined;
    const keyLabel = f.pk ? 'PK' : f.fk ? 'FK' : '';
    return new TableRow({
      children: [
        cell(i + 1,              { bg: bgColor, align: AlignmentType.CENTER, width:400 }),
        cell(f.name,             { bg: bgColor, bold: f.pk, width:1900 }),
        cell(f.type,             { bg: bgColor, width:1400 }),
        cell(f.nn ? '✓' : '',   { bg: bgColor, align: AlignmentType.CENTER, width:900 }),
        cell(keyLabel,           { bg: bgColor, align: AlignmentType.CENTER, bold:true, color: f.pk ? 'B45309' : f.fk ? '6D28D9' : '000000', width:800 }),
        cell(f.default ?? '-',  { bg: bgColor, width:1400 }),
        cell(f.desc,             { bg: bgColor, width:3800 }),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  });
}

function buildIndexTable(tbl) {
  if (!tbl.indexes.length) return null;
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Tên index',  { bold:true, bg:COLOR_TH_BG, width:3500 }),
      cell('Cột',        { bold:true, bg:COLOR_TH_BG, width:3000 }),
      cell('Unique',     { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:800 }),
      cell('Ghi chú',   { bold:true, bg:COLOR_TH_BG, width:3300 }),
    ],
  });
  const rows = tbl.indexes.map(idx => new TableRow({
    children: [
      cell(idx.name,              { width:3500 }),
      cell(idx.cols,              { width:3000 }),
      cell(idx.unique ? '✓' : '', { align:AlignmentType.CENTER, width:800 }),
      cell(idx.partial || '-',   { width:3300 }),
    ],
  }));
  return new Table({ width:{ size:100, type:WidthType.PERCENTAGE }, rows:[headerRow,...rows] });
}

function buildRelationTable(tbl) {
  if (!tbl.relations.length) return null;
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Cột FK',          { bold:true, bg:COLOR_TH_BG, width:2500 }),
      cell('Tham chiếu đến',  { bold:true, bg:COLOR_TH_BG, width:2500 }),
      cell('Quan hệ',         { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:1000 }),
      cell('Mô tả',           { bold:true, bg:COLOR_TH_BG, width:4600 }),
    ],
  });
  const rows = tbl.relations.map(r => new TableRow({
    children: [
      cell(r.fk,   { width:2500 }),
      cell(r.ref,  { width:2500 }),
      cell(r.type, { align:AlignmentType.CENTER, bold:true, width:1000 }),
      cell(r.desc, { width:4600 }),
    ],
  }));
  return new Table({ width:{ size:100, type:WidthType.PERCENTAGE }, rows:[headerRow,...rows] });
}

// ─────────────────────────────────────────────────────────────
// 4. OVERVIEW TABLE (all tables summary)
// ─────────────────────────────────────────────────────────────
function buildOverviewTable() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('STT',          { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:400 }),
      cell('Tên bảng',     { bold:true, bg:COLOR_TH_BG, width:2800 }),
      cell('Nhóm',         { bold:true, bg:COLOR_TH_BG, width:2200 }),
      cell('Số cột',       { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:800 }),
      cell('Mô tả chức năng', { bold:true, bg:COLOR_TH_BG, width:5400 }),
    ],
  });
  const rows = TABLES.map((t, i) => new TableRow({
    children: [
      cell(i+1,          { align:AlignmentType.CENTER, width:400 }),
      cell(t.id,         { bold:true, width:2800 }),
      cell(t.group,      { width:2200 }),
      cell(t.fields.length, { align:AlignmentType.CENTER, width:800 }),
      cell(t.desc,       { width:5400 }),
    ],
  }));
  return new Table({ width:{ size:100, type:WidthType.PERCENTAGE }, rows:[headerRow,...rows] });
}

// ─────────────────────────────────────────────────────────────
// 5. RELATIONSHIP SUMMARY TABLE
// ─────────────────────────────────────────────────────────────
function buildRelSummaryTable() {
  const allRels = [];
  TABLES.forEach(t => t.relations.forEach(r => allRels.push({ from:t.id, ...r })));
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('STT',           { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:400 }),
      cell('Bảng con (FK)', { bold:true, bg:COLOR_TH_BG, width:2400 }),
      cell('Cột FK',        { bold:true, bg:COLOR_TH_BG, width:2400 }),
      cell('Bảng cha (PK)', { bold:true, bg:COLOR_TH_BG, width:2400 }),
      cell('Kiểu quan hệ',  { bold:true, bg:COLOR_TH_BG, align:AlignmentType.CENTER, width:1200 }),
      cell('Mô tả',         { bold:true, bg:COLOR_TH_BG, width:3800 }),
    ],
  });
  const rows = allRels.map((r, i) => new TableRow({
    children: [
      cell(i+1,        { align:AlignmentType.CENTER, width:400 }),
      cell(r.from,     { width:2400 }),
      cell(r.fk,       { width:2400 }),
      cell(r.ref,      { width:2400 }),
      cell(r.type,     { align:AlignmentType.CENTER, bold:true, width:1200 }),
      cell(r.desc,     { width:3800 }),
    ],
  }));
  return new Table({ width:{ size:100, type:WidthType.PERCENTAGE }, rows:[headerRow,...rows] });
}

// ─────────────────────────────────────────────────────────────
// 6. BUILD DOCUMENT
// ─────────────────────────────────────────────────────────────
const sections_content = [];

// ── COVER-like title block
sections_content.push(
  new Paragraph({
    children: [new TextRun({ text: '', break: 1 })],
    spacing: { before: 0, after: 240 },
  }),
  new Paragraph({
    children: [new TextRun({
      text: 'BÁO CÁO THIẾT KẾ CƠ SỞ DỮ LIỆU',
      font: FONT, size: 40, bold: true, color: COLOR_HEADER,
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Hệ thống Quản lý Nhân sự — Công ty Bảo vệ', font: FONT, size: 28, color: COLOR_SUBHEAD })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Đồ án tốt nghiệp | 06/2025', font: FONT, size: 24, italics: true, color: '595959' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 480 },
  }),
);

// ── 1. TỔNG QUAN
sections_content.push(
  heading1('1. Tổng quan cơ sở dữ liệu'),
  para('Hệ thống sử dụng cơ sở dữ liệu SQLite (better-sqlite3) với tổng cộng 11 bảng, được tổ chức theo 4 nhóm chức năng:'),
  empty(),
  para('• Nhân sự: employees, accounts, employee_contracts', { indent: true }),
  para('• Lương & Chấm công: salaries, shifts, shift_templates, leave_requests, leave_balances', { indent: true }),
  para('• Đối tác & Hợp đồng dịch vụ: partner_companies, contracts', { indent: true }),
  para('• Thông báo: announcements', { indent: true }),
  empty(),
  para('Bảng employees đóng vai trò trung tâm — hầu hết các bảng còn lại đều có khóa ngoại tham chiếu về bảng này.'),
  empty(),
  buildOverviewTable(),
  empty(),
);

// ── 2. THIẾT KẾ TỪNG BẢNG
sections_content.push(heading1('2. Thiết kế chi tiết từng bảng'));

TABLES.forEach((tbl, idx) => {
  sections_content.push(
    heading2(`2.${idx + 1}. Bảng ${tbl.id}`),
    para(`Nhóm: ${tbl.group}`, { bold: true }),
    para(tbl.desc),
    empty(),
    heading3('Cấu trúc cột'),
    buildFieldTable(tbl),
    empty(),
  );

  const idxTable = buildIndexTable(tbl);
  if (idxTable) {
    sections_content.push(
      heading3('Indexes'),
      idxTable,
      empty(),
    );
  }

  const relTable = buildRelationTable(tbl);
  if (relTable) {
    sections_content.push(
      heading3('Quan hệ (Foreign Keys)'),
      relTable,
      empty(),
    );
  }
});

// ── 3. TỔNG HỢP QUAN HỆ
sections_content.push(
  heading1('3. Tổng hợp quan hệ giữa các bảng'),
  para('Bảng sau liệt kê toàn bộ các mối quan hệ khoá ngoại trong hệ thống:'),
  empty(),
  buildRelSummaryTable(),
  empty(),
);

// ── 4. QUY ƯỚC & GHI CHÚ
sections_content.push(
  heading1('4. Quy ước thiết kế'),
  heading2('4.1. Kiểu dữ liệu'),
  para('• INTEGER: Số nguyên, dùng cho ID, số lượng, cờ boolean (0/1).', { indent:true }),
  para('• REAL: Số thực, dùng cho tiền lương, số ngày phép.', { indent:true }),
  para('• TEXT: Chuỗi ký tự, dùng cho tất cả trường văn bản và ngày tháng (định dạng chuỗi ISO 8601).', { indent:true }),
  empty(),
  heading2('4.2. Ngày tháng'),
  para('• Ngày: định dạng YYYY-MM-DD (ví dụ: 2025-06-01).', { indent:true }),
  para('• Tháng lương: định dạng YYYY-MM (ví dụ: 2025-06).', { indent:true }),
  para('• Ngày giờ: định dạng YYYY-MM-DD HH:MM:SS.', { indent:true }),
  empty(),
  heading2('4.3. Trạng thái (status)'),
  para('Hầu hết các bảng có cột status dạng TEXT với tập giá trị cố định được kiểm tra ở tầng ứng dụng:', { indent:false }),
  para('• employees.status: active | resigned', { indent:true }),
  para('• accounts.is_active: 0 | 1', { indent:true }),
  para('• employee_contracts.status: active | expired | terminated | pending', { indent:true }),
  para('• contracts.status, partner_companies.status: active | inactive', { indent:true }),
  para('• leave_requests.status, announcements.status: pending | approved | rejected', { indent:true }),
  para('• shift_templates.status: active | inactive', { indent:true }),
  empty(),
  heading2('4.4. Xóa mềm (Soft Delete)'),
  para('Hệ thống không xóa vật lý các bản ghi quan trọng. Thay vào đó, trạng thái được cập nhật:'),
  para('• Nhân viên nghỉ việc: employees.status = "resigned"', { indent:true }),
  para('• Hợp đồng chấm dứt: contracts.status = "inactive", employee_contracts.status = "terminated"', { indent:true }),
  para('• Tài khoản bị khóa: accounts.is_active = 0', { indent:true }),
  empty(),
);

// ── 5. SQL DDL
sections_content.push(
  heading1('5. SQL DDL tổng hợp'),
  para('Câu lệnh CREATE TABLE tóm tắt cho toàn bộ schema:'),
  empty(),
);

const ddlLines = [
  '-- employees',
  'CREATE TABLE employees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT,',
  '  full_name TEXT, avatar_url TEXT, birth_date TEXT, gender TEXT, id_card TEXT UNIQUE,',
  '  social_insurance_no TEXT, employee_type TEXT DEFAULT \'guard\', phone TEXT,',
  '  address TEXT, department TEXT, hire_date TEXT, status TEXT DEFAULT \'active\',',
  '  created_at TEXT DEFAULT (datetime(\'now\')));',
  '',
  '-- accounts',
  'CREATE TABLE accounts (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,',
  '  password TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'user\', employee_id INTEGER,',
  '  avatar_url TEXT, can_manage_salary INTEGER DEFAULT 0,',
  '  created_at TEXT DEFAULT (datetime(\'now\')), is_active INTEGER DEFAULT 1,',
  '  FOREIGN KEY (employee_id) REFERENCES employees(id));',
  '',
  '-- employee_contracts',
  'CREATE TABLE employee_contracts (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL,',
  '  contract_code TEXT NOT NULL UNIQUE, contract_type TEXT NOT NULL DEFAULT \'definite\',',
  '  position TEXT, department TEXT, base_salary REAL DEFAULT 0, allowance REAL DEFAULT 0,',
  '  start_date TEXT NOT NULL, end_date TEXT, signing_date TEXT, signed_by TEXT,',
  '  status TEXT DEFAULT \'active\', note TEXT, created_at TEXT DEFAULT (datetime(\'now\')),',
  '  FOREIGN KEY (employee_id) REFERENCES employees(id));',
  '',
  '-- salaries',
  'CREATE TABLE salaries (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL,',
  '  month TEXT NOT NULL, base_salary REAL DEFAULT 0, bonus REAL DEFAULT 0,',
  '  deduction REAL DEFAULT 0, total REAL DEFAULT 0, note TEXT, paid INTEGER DEFAULT 0,',
  '  created_at TEXT DEFAULT (datetime(\'now\')),',
  '  FOREIGN KEY (employee_id) REFERENCES employees(id),',
  '  UNIQUE (employee_id, month));',
  '',
  '-- shift_templates',
  'CREATE TABLE shift_templates (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,',
  '  name TEXT NOT NULL, check_in_time TEXT NOT NULL, check_out_time TEXT NOT NULL,',
  '  work_pattern TEXT DEFAULT \'daily\', note TEXT, status TEXT DEFAULT \'active\',',
  '  created_at TEXT DEFAULT (datetime(\'now\')));',
  '',
  '-- shifts',
  'CREATE TABLE shifts (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL,',
  '  shift_date TEXT NOT NULL, shift_type TEXT NOT NULL, shift_template_id INTEGER,',
  '  check_in_time_actual TEXT, check_out_time_actual TEXT, note TEXT,',
  '  company_id INTEGER, contract_id INTEGER, assignment_role TEXT DEFAULT \'guard\',',
  '  created_at TEXT DEFAULT (datetime(\'now\')),',
  '  FOREIGN KEY (employee_id) REFERENCES employees(id),',
  '  FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id),',
  '  FOREIGN KEY (company_id) REFERENCES partner_companies(id),',
  '  FOREIGN KEY (contract_id) REFERENCES contracts(id));',
  '',
  '-- leave_requests',
  'CREATE TABLE leave_requests (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL,',
  '  leave_date TEXT NOT NULL, duration_type TEXT NOT NULL, reason TEXT,',
  '  status TEXT DEFAULT \'pending\', approved_by INTEGER, approved_at TEXT,',
  '  reject_reason TEXT, created_at TEXT DEFAULT (datetime(\'now\')),',
  '  FOREIGN KEY (employee_id) REFERENCES employees(id),',
  '  FOREIGN KEY (approved_by) REFERENCES accounts(id));',
  '',
  '-- leave_balances',
  'CREATE TABLE leave_balances (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL,',
  '  year INTEGER NOT NULL, total_days REAL DEFAULT 12, used_days REAL DEFAULT 0,',
  '  remaining_days REAL DEFAULT 12, updated_at TEXT DEFAULT (datetime(\'now\')),',
  '  FOREIGN KEY (employee_id) REFERENCES employees(id),',
  '  UNIQUE (employee_id, year));',
  '',
  '-- partner_companies',
  'CREATE TABLE partner_companies (id INTEGER PRIMARY KEY, company_name TEXT NOT NULL,',
  '  tax_code TEXT UNIQUE, contact_name TEXT, contact_phone TEXT, contact_email TEXT,',
  '  address TEXT, status TEXT DEFAULT \'active\', note TEXT,',
  '  created_at TEXT DEFAULT (datetime(\'now\')));',
  '',
  '-- contracts',
  'CREATE TABLE contracts (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL,',
  '  shift_template_id INTEGER, contract_code TEXT NOT NULL UNIQUE, service_name TEXT,',
  '  start_date TEXT, end_date TEXT, guard_quantity INTEGER DEFAULT 0,',
  '  monthly_value REAL DEFAULT 0, status TEXT DEFAULT \'active\', note TEXT,',
  '  created_at TEXT DEFAULT (datetime(\'now\')),',
  '  FOREIGN KEY (company_id) REFERENCES partner_companies(id),',
  '  FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id));',
  '',
  '-- announcements',
  'CREATE TABLE announcements (id INTEGER PRIMARY KEY,',
  '  created_by_employee_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,',
  '  status TEXT DEFAULT \'pending\', approved_by INTEGER, approved_at TEXT,',
  '  reject_reason TEXT, created_at TEXT DEFAULT (datetime(\'now\')), published_at TEXT,',
  '  FOREIGN KEY (created_by_employee_id) REFERENCES employees(id),',
  '  FOREIGN KEY (approved_by) REFERENCES accounts(id));',
];

ddlLines.forEach(line => {
  sections_content.push(new Paragraph({
    children: [new TextRun({
      text: line,
      font: 'Courier New',
      size: 18,
      color: line.startsWith('--') ? '16822B' : '1F3864',
    })],
    spacing: { before: 0, after: 0 },
    indent: { left: convertInchesToTwip(0.2) },
  }));
});

// ─────────────────────────────────────────────────────────────
// 7. ASSEMBLE & WRITE
// ─────────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'DoAn3M - Auto Generated',
  title:   'Báo cáo Thiết kế Cơ sở Dữ liệu - KLTN 06/2025',
  description: 'Hệ thống Quản lý Nhân sự Công ty Bảo vệ',
  styles: {
    default: {
      document: {
        run: { font: FONT, size: FONT_SIZE },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top:    convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left:   convertInchesToTwip(1.2),
          right:  convertInchesToTwip(1),
        },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'Báo cáo Thiết kế CSDL — Hệ thống Quản lý Nhân sự Công ty Bảo vệ', font: FONT, size: 18, color: '595959', italics: true }),
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: '06/2025 · Trang ', font: FONT, size: 18, color: '595959' }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '595959' }),
            new TextRun({ text: ' / ', font: FONT, size: 18, color: '595959' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: '595959' }),
          ],
          alignment: AlignmentType.RIGHT,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER } },
        })],
      }),
    },
    children: sections_content,
  }],
});

const outPath = path.join(__dirname, '..', '06.2025-KLTN.ProjectDatabase.docx');
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log('✅ Done:', outPath);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
