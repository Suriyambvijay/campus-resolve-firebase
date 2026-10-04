/**
 * Seeds demo accounts as real Firebase Auth users + Firestore profiles.
 * Passwords are read from environment variables (see .env.example) - never hard-coded.
 * Run with: npm run seed
 */
require('dotenv').config();
const { db, auth } = require('../config/firebase');
const admin = require('firebase-admin');

async function upsertUser({ full_name, email, password, role, department_id, department_name, register_number }) {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password, displayName: full_name });
    console.log(`↻ Updated existing demo user: ${email}`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    userRecord = await auth.createUser({ email, password, displayName: full_name });
    console.log(`✓ Created demo user: ${email} (${role})`);
  }

  await db.collection('users').doc(userRecord.uid).set({
    full_name, email, role,
    department_id: department_id || null,
    department_name: department_name || null,
    register_number: register_number || null,
    phone: null,
    status: 'active',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await auth.setCustomUserClaims(userRecord.uid, { role });
  return userRecord.uid;
}

async function seed() {
  try {
    // Seed departments (idempotent - checks by name first)
    const deptNames = [
      'Computer Science and Engineering',
      'Electronics and Communication Engineering',
      'Electrical and Electronics Engineering',
      'Mechanical Engineering',
      'Civil Engineering',
      'Information Technology'
    ];
    let cseDeptId = null;
    for (const name of deptNames) {
      const existing = await db.collection('departments').where('department_name', '==', name).limit(1).get();
      let id;
      if (existing.empty) {
        const ref = await db.collection('departments').add({ department_name: name, hod_user_id: null, hod_name: null, status: 'active', created_at: admin.firestore.FieldValue.serverTimestamp() });
        id = ref.id;
        console.log(`✓ Created department: ${name}`);
      } else {
        id = existing.docs[0].id;
      }
      if (name === 'Computer Science and Engineering') cseDeptId = id;
    }

    // Seed categories
    const categories = ['Academic', 'Infrastructure', 'Laboratory', 'Library', 'Transport', 'Hostel', 'Canteen', 'Cleanliness', 'Internet & Technology', 'Electrical', 'Sports Facilities', 'Campus Security', 'Administration', 'Other'];
    for (const name of categories) {
      const existing = await db.collection('categories').where('category_name', '==', name).limit(1).get();
      if (existing.empty) {
        await db.collection('categories').add({ category_name: name, description: null, status: 'active', created_at: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`✓ Created category: ${name}`);
      }
    }

    const cseDeptName = 'Computer Science and Engineering';

    await upsertUser({ full_name: 'System Administrator', email: 'admin@campusresolve.local', password: process.env.DEMO_ADMIN_PASSWORD || 'Admin@123', role: 'admin' });
    await upsertUser({ full_name: 'Dr. R. Principal', email: 'principal@campusresolve.local', password: process.env.DEMO_PRINCIPAL_PASSWORD || 'Principal@123', role: 'principal' });
    const hodId = await upsertUser({ full_name: 'Dr. K. HOD', email: 'hod@campusresolve.local', password: process.env.DEMO_HOD_PASSWORD || 'Hod@123', role: 'hod', department_id: cseDeptId, department_name: cseDeptName });

    if (cseDeptId) {
      await db.collection('departments').doc(cseDeptId).update({ hod_user_id: hodId, hod_name: 'Dr. K. HOD' });
    }

    await upsertUser({ full_name: 'Mr. S. Coordinator', email: 'coordinator@campusresolve.local', password: process.env.DEMO_COORDINATOR_PASSWORD || 'Coordinator@123', role: 'coordinator', department_id: cseDeptId, department_name: cseDeptName });
    await upsertUser({ full_name: 'Suriya Student', email: 'student@campusresolve.local', password: process.env.DEMO_STUDENT_PASSWORD || 'Student@123', role: 'student', department_id: cseDeptId, department_name: cseDeptName, register_number: '9231XXXXXX' });
    await upsertUser({ full_name: 'Ms. A. Staff', email: 'staff@campusresolve.local', password: process.env.DEMO_STAFF_PASSWORD || 'Staff@123', role: 'staff', department_id: cseDeptId, department_name: cseDeptName });

    console.log('\n✅ Seeding complete. Demo accounts are ready (see README for passwords).');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
