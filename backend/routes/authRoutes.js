const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// NOTE: There is no POST /login route here. With Firebase Auth, the
// frontend signs the user in directly via the Firebase JS SDK
// (signInWithEmailAndPassword), obtains an ID token, and sends it as
// "Authorization: Bearer <idToken>" on every subsequent API call.

router.post('/register', authController.register);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.get('/me', authenticate, authController.me);

module.exports = router;
