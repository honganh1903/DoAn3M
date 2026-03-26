const express = require('express');
const controller = require('../controllers/branch.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin', 'employee'), controller.getAll);
router.post('/', authenticate, authorize('admin', 'employee'), controller.create);
router.put('/:id', authenticate, authorize('admin', 'employee'), controller.update);
router.delete('/:id', authenticate, authorize('admin', 'employee'), controller.remove);

module.exports = router;
