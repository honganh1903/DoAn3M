const express = require('express');
const controller = require('../controllers/employee_contract.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Nhân viên xem hợp đồng của mình
router.get('/mine', authenticate, controller.getMine);

// Thống kê hợp đồng (admin/employee)
router.get('/stats', authenticate, authorize('admin', 'employee'), controller.getStats);

// Danh sách hợp đồng sắp hết hạn
router.get('/expiring-soon', authenticate, authorize('admin', 'employee'), controller.getExpiringSoon);

// Lấy tất cả hợp đồng của 1 nhân viên
router.get('/employee/:employeeId', authenticate, authorize('admin', 'employee'), controller.getByEmployeeId);

// CRUD chính
router.get('/', authenticate, authorize('admin', 'employee'), controller.getAll);
router.get('/:id', authenticate, controller.getById);
router.post('/', authenticate, authorize('admin', 'employee'), controller.create);
router.put('/:id', authenticate, authorize('admin', 'employee'), controller.update);
router.delete('/:id', authenticate, authorize('admin', 'employee'), controller.remove);

module.exports = router;
