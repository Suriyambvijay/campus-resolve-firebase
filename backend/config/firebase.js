const admin = require('firebase-admin');
require('dotenv').config();

// Initialize using a service account JSON file (downloaded from
// Firebase Console -> Project Settings -> Service Accounts -> Generate new private key).
// Save it as backend/serviceAccountKey.json (this file is git-ignored).
//
// Alternative: set GOOGLE_APPLICATION_CREDENTIALS env var to the path of that file,
// or set FIREBASE_SERVICE_ACCOUNT as a JSON string env var (useful for hosting platforms).

let credential;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  try {
    const serviceAccount = require('../serviceAccountKey.json');
    credential = admin.credential.cert(serviceAccount);
  } catch (err) {
    console.error('❌ Could not load Firebase service account credentials.');
    console.error('   Place your serviceAccountKey.json in the backend/ folder,');
    console.error('   or set FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS.');
  }
}

admin.initializeApp({
  credential: credential || admin.credential.applicationDefault(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
});

const db = admin.firestore();
const auth = admin.auth();
const bucket = process.env.FIREBASE_STORAGE_BUCKET ? admin.storage().bucket() : null;

async function testConnection() {
  try {
    await db.collection('_health').doc('check').set({ ok: true, at: new Date() });
    console.log('✅ Firestore connected successfully. Project:', admin.app().options.projectId || '(unknown)');
  } catch (err) {
    console.error('❌ Firestore connection failed:', err.message);
    console.error('   Check your serviceAccountKey.json / FIREBASE_SERVICE_ACCOUNT and Firestore rules.');
  }
}

module.exports = { admin, db, auth, bucket, testConnection };
