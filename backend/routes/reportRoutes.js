const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('hod', 'principal', 'admin'));

router.get('/', reportController.listReports);
router.get('/weekly', reportController.generateWeekly);
router.get('/monthly', reportController.generateMonthly);
router.post('/generate', async (req, res) => {
  const { type } = req.body;
  if (type === 'Weekly') return reportController.generateWeekly(req, res);
  if (type === 'Monthly') return reportController.generateMonthly(req, res);
  return res.status(400).json({ success: false, message: 'type must be Weekly or Monthly.' });
});

module.exports = router;
