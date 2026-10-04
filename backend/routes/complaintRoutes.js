const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/stats/dashboard', complaintController.dashboardStats);

router.post('/', authorize('student', 'staff'), upload.single('attachment'), complaintController.createComplaint);
router.get('/', complaintController.listComplaints);
router.get('/:id', complaintController.getComplaint);

router.post('/:id/assign', authorize('admin', 'hod'), complaintController.assignCoordinator);
router.post('/:id/status', authorize('coordinator', 'hod', 'principal', 'admin'), complaintController.updateStatus);
router.post('/:id/resolve', authorize('coordinator', 'hod', 'principal', 'admin'), complaintController.resolveComplaint);
router.post('/:id/escalate', authorize('coordinator', 'hod', 'admin'), complaintController.escalateComplaint);
router.post('/:id/rating', authorize('student', 'staff'), complaintController.rateComplaint);

module.exports = router;
