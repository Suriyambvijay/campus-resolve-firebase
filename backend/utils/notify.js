const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin').firestore;

async function createNotification({ userId, complaintId = null, title, message, type = 'info' }) {
  if (!userId) return;
  await db.collection('notifications').add({
    user_id: userId,
    complaint_id: complaintId,
    title,
    message,
    type,
    is_read: false,
    created_at: FieldValue.serverTimestamp()
  });
}

async function logAction({ complaintId, performedBy, performedByRole, action, remarks = null }) {
  await db.collection('complaint_actions').add({
    complaint_id: complaintId,
    performed_by: performedBy || null,
    performed_by_role: performedByRole || 'system',
    action,
    remarks: remarks || null,
    created_at: FieldValue.serverTimestamp()
  });
}

module.exports = { createNotification, logAction };
