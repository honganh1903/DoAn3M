const express = require('express');
const controller = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Self-service for user/HR/admin accounts linked to employee profile
router.get('/me', authenticate, authorize('user', 'employee', 'admin'), controller.getMe);
router.get('/me/salaries', authenticate, authorize('user', 'employee', 'admin'), controller.getMySalaries);
router.get('/me/shifts', authenticate, authorize('user', 'employee', 'admin'), controller.getMyShifts);

module.exports = router;
