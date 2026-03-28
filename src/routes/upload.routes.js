const express = require('express');
const controller = require('../controllers/upload.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');

const router = express.Router();

router.post('/employees/:id/avatar', authenticate, authorize('admin', 'employee'), uploadImage.single('image'), controller.uploadEmployeeAvatar);

module.exports = router;
