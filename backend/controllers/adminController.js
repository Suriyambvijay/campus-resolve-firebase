const { db, auth, admin } = require('../config/firebase');
const { FieldValue } = admin.firestore;

// ---------- USERS ----------
exports.listUsers = async (req, res) => {
  const { role, department_id, search } = req.query;
  let query = db.collection('users');
  if (role) query = query.where('role', '==', role);
  if (department_id) query = query.where('department_id', '==', department_id);

  const snap = await query.get();
  let users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (search) {
    const s = search.toLowerCase();
    users = users.filter(u => u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
  }
  users.sort((a, b) => new Date(b.created_at?._seconds ? b.created_at._seconds * 1000 : b.created_at) - new Date(a.created_at?._seconds ? a.created_at._seconds * 1000 : a.created_at));

  return res.json({ success: true, users });
};

exports.createUser = async (req, res) => {
  try {
    const { full_name, email, password, role, department_id, register_number, phone } = req.body;
    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Full name, email, password and role are required.' });
    }
    const validRoles = ['student', 'staff', 'coordinator', 'hod', 'principal', 'admin'];
    if (!validRoles.includes(role)) return res.status(400).json({ success: false, message: 'Invalid role.' });

    let userRecord;
    try {
      userRecord = await auth.createUser({ email: email.toLowerCase(), password, displayName: full_name.trim() });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') return res.status(409).json({ success: false, message: 'Email already in use.' });
      throw err;
    }

    let department_name = null;
    if (department_id) {
      const deptDoc = await db.collection('departments').doc(department_id).get();
      if (deptDoc.exists) department_name = deptDoc.data().department_name;
    }

    await db.collection('users').doc(userRecord.uid).set({
      full_name: full_name.trim(), email: email.toLowerCase(), role,
      department_id: department_id || null, department_name,
      register_number: register_number || null, phone: phone || null,
      status: 'active', created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()
    });
    await auth.setCustomUserClaims(userRecord.uid, { role });

    if (role === 'hod' && department_id) {
      await db.collection('departments').doc(department_id).update({ hod_user_id: userRecord.uid, hod_name: full_name.trim() });
    }

    return res.status(201).json({ success: true, message: 'User created successfully.', user_id: userRecord.uid });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ success: false, message: 'Unable to create user.' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, department_id, phone, register_number } = req.body;
    const update = { updated_at: FieldValue.serverTimestamp() };
    if (full_name) update.full_name = full_name;
    if (role) update.role = role;
    if (phone) update.phone = phone;
    if (register_number) update.register_number = register_number;
    if (department_id !== undefined) {
      update.department_id = department_id || null;
      if (department_id) {
        const deptDoc = await db.collection('departments').doc(department_id).get();
        update.department_name = deptDoc.exists ? deptDoc.data().department_name : null;
      } else {
        update.department_name = null;
      }
    }
    await db.collection('users').doc(id).update(update);
    if (role) await auth.setCustomUserClaims(id, { role });
    return res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update user.' });
  }
};

exports.setUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be active or inactive.' });
  }
  await db.collection('users').doc(id).update({ status, updated_at: FieldValue.serverTimestamp() });
  await auth.updateUser(id, { disabled: status === 'inactive' }).catch(() => {});
  return res.json({ success: true, message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully.` });
};

exports.listCoordinators = async (req, res) => {
  const { department_id } = req.query;
  let query = db.collection('users').where('role', '==', 'coordinator').where('status', '==', 'active');
  const snap = await query.get();
  let coordinators = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (department_id) coordinators = coordinators.filter(c => c.department_id === department_id);
  return res.json({ success: true, coordinators });
};

// ---------- DEPARTMENTS ----------
exports.listDepartments = async (req, res) => {
  const snap = await db.collection('departments').get();
  const departments = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.department_name.localeCompare(b.department_name));
  return res.json({ success: true, departments });
};

exports.createDepartment = async (req, res) => {
  const { department_name } = req.body;
  if (!department_name) return res.status(400).json({ success: false, message: 'Department name is required.' });
  const docRef = await db.collection('departments').add({
    department_name: department_name.trim(), hod_user_id: null, hod_name: null, status: 'active', created_at: FieldValue.serverTimestamp()
  });
  return res.status(201).json({ success: true, message: 'Department created successfully.', id: docRef.id });
};

exports.updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { department_name, hod_user_id, status } = req.body;
  const update = {};
  if (department_name) update.department_name = department_name;
  if (status) update.status = status;
  if (hod_user_id !== undefined) update.hod_user_id = hod_user_id || null;
  await db.collection('departments').doc(id).update(update);
  return res.json({ success: true, message: 'Department updated successfully.' });
};

// ---------- CATEGORIES ----------
exports.listCategories = async (req, res) => {
  const snap = await db.collection('categories').get();
  const categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.category_name.localeCompare(b.category_name));
  return res.json({ success: true, categories });
};

exports.createCategory = async (req, res) => {
  const { category_name, description } = req.body;
  if (!category_name) return res.status(400).json({ success: false, message: 'Category name is required.' });
  const docRef = await db.collection('categories').add({
    category_name: category_name.trim(), description: description || null, status: 'active', created_at: FieldValue.serverTimestamp()
  });
  return res.status(201).json({ success: true, message: 'Category created successfully.', id: docRef.id });
};

exports.updateCategory = async (req, res) => {
  const { id } = req.params;
  const { category_name, description, status } = req.body;
  const update = {};
  if (category_name) update.category_name = category_name;
  if (description !== undefined) update.description = description;
  if (status) update.status = status;
  await db.collection('categories').doc(id).update(update);
  return res.json({ success: true, message: 'Category updated successfully.' });
};
