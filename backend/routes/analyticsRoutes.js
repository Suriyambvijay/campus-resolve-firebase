const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('hod', 'principal', 'admin'));

router.get('/overview', analyticsController.overview);
router.get('/trend/weekly', analyticsController.weeklyTrend);
router.get('/trend/monthly', analyticsController.monthlyTrend);
router.get('/by-department', analyticsController.byDepartment);
router.get('/by-category', analyticsController.byCategory);
router.get('/by-priority', analyticsController.byPriority);
router.get('/by-status', analyticsController.byStatus);
router.get('/satisfaction', analyticsController.satisfaction);

module.exports = router;
