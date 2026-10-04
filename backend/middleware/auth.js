const { auth, db } = require('../config/firebase');

/**
 * Client (Firebase Auth SDK) signs the user in and obtains an ID token,
 * then sends it as: Authorization: Bearer <idToken>
 * This middleware verifies that token with the Firebase Admin SDK and
 * loads the matching Firestore user profile (role, department, status).
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }
    const idToken = header.split(' ')[1];
    const decoded = await auth.verifyIdToken(idToken);

    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'Account profile not found. Please contact the Administrator.' });
    }
    const userData = userDoc.data();
    if (userData.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact the Administrator.' });
    }

    req.user = { id: decoded.uid, uid: decoded.uid, email: decoded.email, ...userData };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
