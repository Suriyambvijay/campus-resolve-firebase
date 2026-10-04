const { db, admin } = require('../config/firebase');
const { FieldValue } = admin.firestore;

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return ts;
}

exports.listNotifications = async (req, res) => {
  const snap = await db.collection('notifications').where('user_id', '==', req.user.id).get();
  let notifications = snap.docs.map(d => ({ id: d.id, ...d.data(), created_at: toIso(d.data().created_at) }));
  notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Enrich with complaint_code
  const complaintIds = [...new Set(notifications.map(n => n.complaint_id).filter(Boolean))];
  const complaintDocs = await Promise.all(complaintIds.map(id => db.collection('complaints').doc(id).get()));
  const codeById = {};
  complaintDocs.forEach(c => { if (c.exists) codeById[c.id] = c.data().complaint_code; });
  notifications.forEach(n => { n.complaint_code = n.complaint_id ? codeById[n.complaint_id] : null; });

  notifications = notifications.slice(0, 50);
  const unread_count = notifications.filter(n => !n.is_read).length;

  return res.json({ success: true, notifications, unread_count });
};

exports.markRead = async (req, res) => {
  const { id } = req.params;
  const doc = await db.collection('notifications').doc(id).get();
  if (doc.exists && doc.data().user_id === req.user.id) {
    await doc.ref.update({ is_read: true });
  }
  return res.json({ success: true });
};

exports.markAllRead = async (req, res) => {
  const snap = await db.collection('notifications').where('user_id', '==', req.user.id).where('is_read', '==', false).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.update(d.ref, { is_read: true }));
  await batch.commit();
  return res.json({ success: true, message: 'All notifications marked as read.' });
};
