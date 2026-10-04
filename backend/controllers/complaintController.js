const { db, admin } = require('../config/firebase');
const { FieldValue } = admin.firestore;
const { calculateDeadline, deadlineLabel } = require('../utils/deadline');
const { generateComplaintCode } = require('../utils/complaintId');
const { createNotification, logAction } = require('../utils/notify');

const complaintsCol = () => db.collection('complaints');

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return ts;
}

function serializeComplaint(doc) {
  const c = doc.data();
  return {
    id: doc.id,
    ...c,
    submitted_at: toIso(c.submitted_at),
    deadline: toIso(c.deadline),
    resolved_at: toIso(c.resolved_at),
    escalated_at: toIso(c.escalated_at),
    created_at: toIso(c.created_at),
    updated_at: toIso(c.updated_at),
    deadline_info: deadlineLabel(toIso(c.deadline), c.status)
  };
}

// ---------------------------------------------------------
// CREATE
// ---------------------------------------------------------
exports.createComplaint = async (req, res) => {
  try {
    const { category_id, department_id, title, description, location, priority } = req.body;

    if (!title || !description || !priority) {
      return res.status(400).json({ success: false, message: 'Title, description and priority are required.' });
    }
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority value.' });
    }

    const complaint_code = await generateComplaintCode();
    const deadline = calculateDeadline(priority); // ALWAYS server-calculated

    let category_name = null, department_name = null;
    if (category_id) {
      const catDoc = await db.collection('categories').doc(category_id).get();
      if (catDoc.exists) category_name = catDoc.data().category_name;
    }
    if (department_id) {
      const deptDoc = await db.collection('departments').doc(department_id).get();
      if (deptDoc.exists) department_name = deptDoc.data().department_name;
    }

    const attachment_path = req.file ? `/uploads/${req.file.filename}` : null;

    const docRef = await complaintsCol().add({
      complaint_code,
      user_id: req.user.id,
      student_name: req.user.full_name,
      student_email: req.user.email,
      department_id: department_id || null,
      department_name,
      category_id: category_id || null,
      category_name,
      title: title.trim(),
      description: description.trim(),
      location: location || null,
      priority,
      status: 'Submitted',
      attachment_path,
      assigned_coordinator_id: null,
      coordinator_name: null,
      submitted_at: FieldValue.serverTimestamp(),
      deadline: deadline.toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      escalation_level: 'none',
      escalated_at: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    await logAction({
      complaintId: docRef.id,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      action: 'Complaint Submitted',
      remarks: 'Concern submitted by ' + req.user.full_name
    });

    await createNotification({
      userId: req.user.id,
      complaintId: docRef.id,
      title: 'Concern submitted successfully',
      message: `Your concern "${title}" has been submitted with ID ${complaint_code}. Expected resolution by ${deadline.toLocaleDateString()}.`,
      type: 'success'
    });

    return res.status(201).json({
      success: true,
      message: 'Your concern has been submitted successfully.',
      complaint: { id: docRef.id, complaint_code, status: 'Submitted', deadline: deadline.toISOString() }
    });
  } catch (err) {
    console.error('Create complaint error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong while submitting your concern.' });
  }
};

// ---------------------------------------------------------
// LIST (role-aware; filtered/paginated in memory - fine at college scale
// and avoids requiring Firestore composite indexes for every filter combo)
// ---------------------------------------------------------
exports.listComplaints = async (req, res) => {
  try {
    const { status, priority, category_id, department_id, search, page = 1, limit = 20 } = req.query;

    let query = complaintsCol();

    if (['student', 'staff'].includes(req.user.role)) {
      query = query.where('user_id', '==', req.user.id);
    } else if (req.user.role === 'coordinator') {
      query = query.where('assigned_coordinator_id', '==', req.user.id);
    } else if (req.user.role === 'hod') {
      query = query.where('department_id', '==', req.user.department_id);
    }
    // principal & admin: no filter, see all

    const snapshot = await query.get();
    let complaints = snapshot.docs.map(serializeComplaint);

    if (status) complaints = complaints.filter(c => c.status === status);
    if (priority) complaints = complaints.filter(c => c.priority === priority);
    if (category_id) complaints = complaints.filter(c => c.category_id === category_id);
    if (department_id) complaints = complaints.filter(c => c.department_id === department_id);
    if (search) {
      const s = search.toLowerCase();
      complaints = complaints.filter(c =>
        c.complaint_code?.toLowerCase().includes(s) ||
        c.title?.toLowerCase().includes(s) ||
        c.student_name?.toLowerCase().includes(s)
      );
    }

    complaints.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const total = complaints.length;
    const start = (pageNum - 1) * limitNum;
    const pageItems = complaints.slice(start, start + limitNum);

    return res.json({
      success: true,
      complaints: pageItems,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 }
    });
  } catch (err) {
    console.error('List complaints error:', err);
    return res.status(500).json({ success: false, message: 'Unable to load complaints.' });
  }
};

// ---------------------------------------------------------
// DETAIL
// ---------------------------------------------------------
exports.getComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    let doc = await complaintsCol().doc(id).get();

    if (!doc.exists) {
      const bycode = await complaintsCol().where('complaint_code', '==', id).limit(1).get();
      if (bycode.empty) return res.status(404).json({ success: false, message: 'Complaint not found.' });
      doc = bycode.docs[0];
    }

    const complaint = serializeComplaint(doc);

    if (['student', 'staff'].includes(req.user.role) && complaint.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this complaint.' });
    }
    if (req.user.role === 'coordinator' && complaint.assigned_coordinator_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This complaint is not assigned to you.' });
    }
    if (req.user.role === 'hod' && complaint.department_id !== req.user.department_id) {
      return res.status(403).json({ success: false, message: 'This complaint does not belong to your department.' });
    }

    const actionsSnap = await db.collection('complaint_actions').where('complaint_id', '==', doc.id).get();
    const actions = actionsSnap.docs.map(a => {
      const d = a.data();
      return { id: a.id, ...d, created_at: toIso(d.created_at) };
    }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Enrich performer names
    const uids = [...new Set(actions.map(a => a.performed_by).filter(Boolean))];
    const userDocs = await Promise.all(uids.map(uid => db.collection('users').doc(uid).get()));
    const nameByUid = {};
    userDocs.forEach(u => { if (u.exists) nameByUid[u.id] = u.data().full_name; });
    actions.forEach(a => { a.performed_by_name = a.performed_by ? (nameByUid[a.performed_by] || 'Unknown') : 'System'; });

    const ratingDoc = await db.collection('ratings').doc(doc.id).get();

    return res.json({
      success: true,
      complaint,
      history: actions,
      rating: ratingDoc.exists ? ratingDoc.data() : null
    });
  } catch (err) {
    console.error('Get complaint error:', err);
    return res.status(500).json({ success: false, message: 'Unable to load complaint details.' });
  }
};

// ---------------------------------------------------------
// ASSIGN
// ---------------------------------------------------------
exports.assignCoordinator = async (req, res) => {
  try {
    const { id } = req.params;
    const { coordinator_id } = req.body;
    if (!coordinator_id) return res.status(400).json({ success: false, message: 'coordinator_id is required.' });

    const coordDoc = await db.collection('users').doc(coordinator_id).get();
    if (!coordDoc.exists || coordDoc.data().role !== 'coordinator') {
      return res.status(400).json({ success: false, message: 'Selected coordinator not found.' });
    }

    const complaintRef = complaintsCol().doc(id);
    const complaintDoc = await complaintRef.get();
    if (!complaintDoc.exists) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const complaint = complaintDoc.data();

    await complaintRef.update({
      assigned_coordinator_id: coordinator_id,
      coordinator_name: coordDoc.data().full_name,
      status: 'Assigned',
      updated_at: FieldValue.serverTimestamp()
    });

    await logAction({ complaintId: id, performedBy: req.user.id, performedByRole: req.user.role, action: 'Complaint Assigned', remarks: `Assigned to ${coordDoc.data().full_name}` });
    await createNotification({ userId: coordinator_id, complaintId: id, title: 'New complaint assigned', message: `Complaint ${complaint.complaint_code} has been assigned to you.`, type: 'info' });
    await createNotification({ userId: complaint.user_id, complaintId: id, title: 'Complaint assigned', message: `Your complaint ${complaint.complaint_code} has been assigned to a coordinator.`, type: 'info' });

    return res.json({ success: true, message: 'Coordinator assigned successfully.' });
  } catch (err) {
    console.error('Assign error:', err);
    return res.status(500).json({ success: false, message: 'Unable to assign coordinator.' });
  }
};

// ---------------------------------------------------------
// STATUS UPDATE
// ---------------------------------------------------------
const ALLOWED_TRANSITIONS = {
  Submitted: ['Assigned', 'Under Review'],
  Assigned: ['Under Review', 'In Progress'],
  'Under Review': ['In Progress', 'Resolved'],
  'In Progress': ['Resolved'],
  Resolved: ['Feedback', 'Reopened'],
  Feedback: ['Closed'],
  Reopened: ['Under Review', 'In Progress'],
  Escalated: ['Under Review', 'In Progress', 'Resolved']
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });

    const complaintRef = complaintsCol().doc(id);
    const doc = await complaintRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const complaint = doc.data();

    const allowed = ALLOWED_TRANSITIONS[complaint.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot change status from "${complaint.status}" to "${status}".` });
    }

    const update = { status, updated_at: FieldValue.serverTimestamp() };
    if (remarks) update.resolution_remarks = remarks;
    if (status === 'Resolved') update.resolved_at = FieldValue.serverTimestamp();

    await complaintRef.update(update);

    const actionLabel = {
      'Under Review': 'Complaint Reviewed', 'In Progress': 'Resolution Started',
      Resolved: 'Resolution Completed', Feedback: 'Feedback Submitted',
      Closed: 'Complaint Closed', Reopened: 'Complaint Reopened'
    }[status] || 'Status Updated';

    await logAction({ complaintId: id, performedBy: req.user.id, performedByRole: req.user.role, action: actionLabel, remarks });

    await createNotification({
      userId: complaint.user_id,
      complaintId: id,
      title: 'Complaint status updated',
      message: `Your complaint ${complaint.complaint_code} is now "${status}".` + (status === 'Resolved' ? ' Please share your feedback.' : ''),
      type: status === 'Resolved' ? 'success' : 'info'
    });

    return res.json({ success: true, message: 'Status updated successfully.' });
  } catch (err) {
    console.error('Update status error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update status.' });
  }
};

exports.resolveComplaint = async (req, res) => {
  req.body.status = 'Resolved';
  return exports.updateStatus(req, res);
};

// ---------------------------------------------------------
// ESCALATE
// ---------------------------------------------------------
exports.escalateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const complaintRef = complaintsCol().doc(id);
    const doc = await complaintRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const complaint = doc.data();

    let nextLevel, actionLabel;
    if (complaint.escalation_level === 'none') { nextLevel = 'hod'; actionLabel = 'Escalated to HOD'; }
    else if (complaint.escalation_level === 'hod') { nextLevel = 'principal'; actionLabel = 'Escalated to Principal'; }
    else return res.status(400).json({ success: false, message: 'This complaint has already been escalated to the highest level.' });

    await complaintRef.update({
      status: 'Escalated', escalation_level: nextLevel, escalated_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()
    });

    await logAction({
      complaintId: id, performedBy: req.user.id, performedByRole: req.user.role, action: actionLabel,
      remarks: remarks || `Complaint escalated because ${new Date(complaint.deadline) < new Date() ? 'the resolution deadline was exceeded.' : 'further administrative attention is required.'}`
    });

    if (nextLevel === 'hod') {
      const hodsSnap = await db.collection('users').where('role', '==', 'hod').where('department_id', '==', complaint.department_id).get();
      for (const hod of hodsSnap.docs) {
        await createNotification({ userId: hod.id, complaintId: id, title: 'Complaint escalated', message: `Complaint ${complaint.complaint_code} has been escalated to you.`, type: 'warning' });
      }
    } else {
      const principalsSnap = await db.collection('users').where('role', '==', 'principal').get();
      for (const p of principalsSnap.docs) {
        await createNotification({ userId: p.id, complaintId: id, title: 'Complaint escalated to Principal', message: `Complaint ${complaint.complaint_code} requires Principal-level intervention.`, type: 'warning' });
      }
    }
    await createNotification({ userId: complaint.user_id, complaintId: id, title: 'Complaint escalated', message: `Your complaint ${complaint.complaint_code} has been escalated for further review.`, type: 'warning' });

    return res.json({ success: true, message: `Complaint escalated to ${nextLevel === 'hod' ? 'HOD' : 'Principal'}.` });
  } catch (err) {
    console.error('Escalate error:', err);
    return res.status(500).json({ success: false, message: 'Unable to escalate complaint.' });
  }
};

// ---------------------------------------------------------
// RATING
// ---------------------------------------------------------
exports.rateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }

    const complaintRef = complaintsCol().doc(id);
    const doc = await complaintRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const complaint = doc.data();

    if (complaint.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the person who submitted this complaint may rate it.' });
    }
    if (!['Resolved', 'Feedback'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'You can only rate a complaint after it has been resolved.' });
    }

    const ratingRef = db.collection('ratings').doc(id);
    if ((await ratingRef.get()).exists) {
      return res.status(409).json({ success: false, message: 'This complaint has already received feedback.' });
    }

    await ratingRef.set({ complaint_id: id, student_id: req.user.id, rating, feedback: feedback || null, created_at: FieldValue.serverTimestamp() });
    await complaintRef.update({ status: 'Closed', updated_at: FieldValue.serverTimestamp() });

    await logAction({ complaintId: id, performedBy: req.user.id, performedByRole: req.user.role, action: 'Feedback Submitted', remarks: feedback });
    await logAction({ complaintId: id, performedBy: req.user.id, performedByRole: req.user.role, action: 'Complaint Closed' });

    return res.json({ success: true, message: 'Thank you for helping us improve campus services.' });
  } catch (err) {
    console.error('Rate complaint error:', err);
    return res.status(500).json({ success: false, message: 'Unable to submit feedback.' });
  }
};

// ---------------------------------------------------------
// DASHBOARD STATS
// ---------------------------------------------------------
exports.dashboardStats = async (req, res) => {
  try {
    let query = complaintsCol();
    if (['student', 'staff'].includes(req.user.role)) query = query.where('user_id', '==', req.user.id);
    else if (req.user.role === 'coordinator') query = query.where('assigned_coordinator_id', '==', req.user.id);
    else if (req.user.role === 'hod') query = query.where('department_id', '==', req.user.department_id);

    const snap = await query.get();
    const complaints = snap.docs.map(d => d.data());

    const total = complaints.length;
    const pending = complaints.filter(c => ['Submitted', 'Assigned'].includes(c.status)).length;
    const under_review = complaints.filter(c => c.status === 'Under Review').length;
    const in_progress = complaints.filter(c => c.status === 'In Progress').length;
    const resolved = complaints.filter(c => ['Resolved', 'Feedback', 'Closed'].includes(c.status)).length;
    const escalated = complaints.filter(c => c.status === 'Escalated').length;
    const deadline_exceeded = complaints.filter(c => new Date(c.deadline) < new Date() && !['Resolved', 'Feedback', 'Closed'].includes(c.status)).length;
    const awaiting_feedback = complaints.filter(c => c.status === 'Resolved').length;

    const complaintIds = new Set(snap.docs.map(d => d.id));
    let average_rating = null;
    if (complaintIds.size > 0) {
      const ratingsSnap = await db.collection('ratings').get();
      const relevant = ratingsSnap.docs.filter(r => complaintIds.has(r.id)).map(r => r.data().rating);
      if (relevant.length > 0) average_rating = (relevant.reduce((a, b) => a + b, 0) / relevant.length).toFixed(1);
    }

    return res.json({ success: true, stats: { total, pending, under_review, in_progress, resolved, escalated, deadline_exceeded, awaiting_feedback, average_rating } });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ success: false, message: 'Unable to load dashboard statistics.' });
  }
};
