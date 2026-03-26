const express = require('express');
const controller = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Account management for HR/Admin
router.get('/', authenticate, authorize('admin', 'employee'), controller.getAll);
router.post('/', authenticate, authorize('admin', 'employee'), controller.create);
router.put('/:id', authenticate, authorize('admin', 'employee'), controller.update);
router.patch('/:id/reset-password', authenticate, authorize('admin', 'employee'), controller.resetPassword);
router.delete('/:id', authenticate, authorize('admin', 'employee'), controller.remove);

module.exports = router;
