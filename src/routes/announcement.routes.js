const express = require('express');
const controller = require('../controllers/announcement.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('user', 'employee', 'admin'), controller.getPublicApproved);
router.get('/my', authenticate, authorize('employee', 'admin'), controller.getMyPosts);
router.post('/', authenticate, authorize('employee'), controller.create);

module.exports = router;
