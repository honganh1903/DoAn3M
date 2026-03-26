const express = require('express');
const controller = require('../controllers/leave.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/my', authenticate, authorize('user', 'employee', 'admin'), controller.getMyRequests);
router.post('/', authenticate, authorize('user', 'employee'), controller.create);

module.exports = router;
