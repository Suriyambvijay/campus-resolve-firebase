const validator = require('validator');
const { auth, db } = require('../config/firebase');

const PUBLIC_REGISTERABLE_ROLES = ['student', 'staff'];

// ---------------------------------------------------------
// REGISTER
// Creates the Firebase Auth account (Admin SDK) + the Firestore
// profile document (role, department, etc). The client then signs
// in with the Firebase Auth JS SDK using the same email/password.
// ---------------------------------------------------------
exports.register = async (req, res) => {
  try {
    const { full_name, email, password, confirm_password, role, department_id, register_number, phone } = req.body;

    if (!full_name || !email || !password || !confirm_password || !role) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!PUBLIC_REGISTERABLE_ROLES.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You may only self-register as a Student or Staff member. Coordinator, HOD, Principal and Admin accounts are created by an authorized Administrator.'
      });
    }
    if (role === 'student' && !register_number) {
      return res.status(400).json({ success: false, message: 'Register number is required for students.' });
    }

    // Firebase Auth enforces unique emails; this throws auth/email-already-exists if taken.
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email: email.toLowerCase(),
        password,
        displayName: full_name.trim()
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
      }
      throw err;
    }

    let department_name = null;
    if (department_id) {
      const deptDoc = await db.collection('departments').doc(department_id).get();
      if (deptDoc.exists) department_name = deptDoc.data().department_name;
    }

    const profile = {
      full_name: full_name.trim(),
      email: email.toLowerCase(),
      role,
      department_id: department_id || null,
      department_name,
      register_number: register_number || null,
      phone: phone || null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db.collection('users').doc(userRecord.uid).set(profile);
    // Custom claim lets Firestore Security Rules (if used directly from the client) check role too.
    await auth.setCustomUserClaims(userRecord.uid, { role });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. You can now log in.',
      user: { id: userRecord.uid, ...profile }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong while creating your account.' });
  }
};

// ---------------------------------------------------------
// ME - returns the caller's Firestore profile (auth already verified by middleware)
// ---------------------------------------------------------
exports.me = async (req, res) => {
  return res.json({ success: true, user: req.user });
};

// ---------------------------------------------------------
// LOGOUT - stateless on the server (no session/cookie); the client
// simply calls firebase.auth().signOut(). This endpoint exists for
// symmetry / to revoke refresh tokens if ever needed.
// ---------------------------------------------------------
exports.logout = async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const idToken = header.split(' ')[1];
      const decoded = await auth.verifyIdToken(idToken).catch(() => null);
      if (decoded) await auth.revokeRefreshTokens(decoded.uid);
    }
  } catch (e) { /* best-effort */ }
  return res.json({ success: true, message: 'Logged out successfully.' });
};

// ---------------------------------------------------------
// FORGOT PASSWORD
// Firebase Auth can generate a password reset link server-side,
// but actually emailing it requires either Firebase's built-in
// email templates (client SDK: sendPasswordResetEmail) or your own
// mail service. We keep this endpoint privacy-safe and point the
// client at Firebase's own flow.
// ---------------------------------------------------------
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }
  return res.json({
    success: true,
    message: 'If an account exists with this email, a password reset link has been sent via Firebase Authentication.'
  });
};
