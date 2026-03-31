const express = require('express');
const multer = require('multer');
const controller = require('../controllers/shift.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.get('/', authenticate, authorize('admin', 'employee', 'user'), (req, res) => {
  return res.json({
    success: true,
    message: 'Shift API namespace',
    data: {
      templates: '/api/shifts/templates',
      assignments: '/api/shifts/assignments'
    }
  });
});

router.get('/templates', authenticate, authorize('admin', 'employee', 'user'), controller.listTemplates);
router.get('/templates/:id', authenticate, authorize('admin', 'employee', 'user'), controller.getTemplateById);
router.post('/templates', authenticate, authorize('admin', 'employee'), controller.createTemplate);
router.put('/templates/:id', authenticate, authorize('admin', 'employee'), controller.updateTemplate);
router.delete('/templates/:id', authenticate, authorize('admin', 'employee'), controller.removeTemplate);

router.get('/assignments', authenticate, authorize('admin', 'employee'), controller.getAll);
router.get('/assignments/candidates', authenticate, authorize('admin', 'employee'), controller.getAssignmentCandidates);
router.get('/assignments/contracts/:contractId/candidates', authenticate, authorize('admin', 'employee'), controller.getContractCandidates);
router.put('/assignments/contracts/:contractId/members', authenticate, authorize('admin', 'employee'), controller.syncContractMembers);
router.get('/assignments/my', authenticate, authorize('user', 'employee', 'admin'), controller.getMine);
router.get('/assignments/employee/:employeeId', authenticate, authorize('admin', 'employee'), controller.getByEmployee);
router.post('/assignments', authenticate, authorize('admin', 'employee'), controller.create);
router.post('/assignments/range', authenticate, authorize('admin', 'employee'), controller.createRange);
router.post('/assignments/checkin-checkout/import', authenticate, authorize('admin', 'employee'), excelUpload.single('file'), controller.importCheckinCheckoutExcel);
router.put('/assignments/:id', authenticate, authorize('admin', 'employee'), controller.update);
router.delete('/assignments/:id', authenticate, authorize('admin', 'employee'), controller.remove);

module.exports = router;
