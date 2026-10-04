const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Users - Admin only
router.get('/users', authorize('admin'), adminController.listUsers);
router.post('/users', authorize('admin'), adminController.createUser);
router.put('/users/:id', authorize('admin'), adminController.updateUser);
router.patch('/users/:id/status', authorize('admin'), adminController.setUserStatus);

// Coordinators list - Admin & HOD (for assignment)
router.get('/coordinators', authorize('admin', 'hod'), adminController.listCoordinators);

// Departments
router.get('/departments', adminController.listDepartments); // public-ish (used in registration/complaint forms too, but behind auth here)
router.post('/departments', authorize('admin'), adminController.createDepartment);
router.put('/departments/:id', authorize('admin'), adminController.updateDepartment);

// Categories
router.get('/categories', adminController.listCategories);
router.post('/categories', authorize('admin'), adminController.createCategory);
router.put('/categories/:id', authorize('admin'), adminController.updateCategory);

module.exports = router;
