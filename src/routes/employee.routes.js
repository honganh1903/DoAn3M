const express = require('express');
const controller = require('../controllers/employee.controller');
const { authenticate, authorize, authorizeSalaryManager } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin', 'employee'), controller.getAll);
router.get('/:id', authenticate, authorize('admin', 'employee'), controller.getById);
router.post('/', authenticate, authorizeSalaryManager, controller.create);
router.put('/:id', authenticate, authorizeSalaryManager, controller.update);
router.delete('/:id', authenticate, authorizeSalaryManager, controller.remove);

module.exports = router;


