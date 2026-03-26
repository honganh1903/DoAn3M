const express = require('express');
const controller = require('../controllers/salary.controller');
const { authenticate, authorize, authorizeSalaryManager } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorizeSalaryManager, controller.getAll);
router.get('/my', authenticate, authorize('user', 'employee', 'admin'), controller.getMine);
router.get('/:id', authenticate, authorizeSalaryManager, controller.getById);
router.post('/', authenticate, authorizeSalaryManager, controller.create);
router.put('/:id', authenticate, authorizeSalaryManager, controller.update);
router.patch('/:id/pay', authenticate, authorizeSalaryManager, controller.markAsPaid);
router.delete('/:id', authenticate, authorizeSalaryManager, controller.remove);

module.exports = router;
