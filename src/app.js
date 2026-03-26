const express = require('express');
const cors = require('cors');

require('./config/db');

const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const salaryRoutes = require('./routes/salary.routes');
const shiftRoutes = require('./routes/shift.routes');
const userRoutes = require('./routes/user.routes');
const accountRoutes = require('./routes/account.routes');
const partnerRoutes = require('./routes/partner.routes');
const branchRoutes = require('./routes/branch.routes');
const contractRoutes = require('./routes/contract.routes');
const leaveRoutes = require('./routes/leave.routes');
const announcementRoutes = require('./routes/announcement.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Security company HR API is running'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

module.exports = app;


