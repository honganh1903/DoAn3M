const express = require('express');
const leaveController = require('../controllers/leave.controller');
const announcementController = require('../controllers/announcement.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/leave-requests', authenticate, authorize('admin'), leaveController.getAllForAdmin);
router.patch('/leave-requests/:id/approve', authenticate, authorize('admin'), leaveController.approve);
router.patch('/leave-requests/:id/reject', authenticate, authorize('admin'), leaveController.reject);

router.get('/announcements', authenticate, authorize('admin'), announcementController.getAllForAdmin);
router.patch('/announcements/:id/approve', authenticate, authorize('admin'), announcementController.approve);
router.patch('/announcements/:id/reject', authenticate, authorize('admin'), announcementController.reject);

module.exports = router;
