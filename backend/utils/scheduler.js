const cron = require('node-cron');
const { db, admin } = require('../config/firebase');
const { FieldValue } = admin.firestore;
const { createNotification, logAction } = require('./notify');
const { generateReport } = require('./reportGenerator');

function toDate(v) {
  if (!v) return null;
  return v.toDate ? v.toDate() : new Date(v);
}

// ---------------------------------------------------------
// Auto-escalation: runs every hour.
// ---------------------------------------------------------
async function checkOverdueComplaints() {
  try {
    const snap = await db.collection('complaints').get();
    const now = new Date();
    const overdue = snap.docs.filter(d => {
      const c = d.data();
      return toDate(c.deadline) < now && !['Resolved', 'Feedback', 'Closed'].includes(c.status) && c.escalation_level !== 'principal';
    });

    for (const doc of overdue) {
      const complaint = doc.data();
      const nextLevel = complaint.escalation_level === 'none' ? 'hod' : 'principal';

      await doc.ref.update({ status: 'Escalated', escalation_level: nextLevel, escalated_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });

      await logAction({
        complaintId: doc.id, performedBy: null, performedByRole: 'system',
        action: nextLevel === 'hod' ? 'Escalated to HOD' : 'Escalated to Principal',
        remarks: 'Complaint escalated automatically because the resolution deadline was exceeded.'
      });

      if (nextLevel === 'hod') {
        const hodsSnap = await db.collection('users').where('role', '==', 'hod').where('department_id', '==', complaint.department_id).get();
        for (const hod of hodsSnap.docs) {
          await createNotification({ userId: hod.id, complaintId: doc.id, title: 'Deadline exceeded - complaint escalated', message: `Complaint ${complaint.complaint_code} exceeded its deadline and has been escalated to you.`, type: 'warning' });
        }
      } else {
        const principalsSnap = await db.collection('users').where('role', '==', 'principal').get();
        for (const p of principalsSnap.docs) {
          await createNotification({ userId: p.id, complaintId: doc.id, title: 'Complaint escalated to Principal', message: `Complaint ${complaint.complaint_code} requires Principal-level intervention.`, type: 'warning' });
        }
      }

      await createNotification({ userId: complaint.user_id, complaintId: doc.id, title: 'Complaint escalated', message: `Your complaint ${complaint.complaint_code} exceeded its target resolution date and has been escalated for further attention.`, type: 'warning' });
    }

    if (overdue.length > 0) console.log(`[Scheduler] Escalated ${overdue.length} overdue complaint(s).`);
  } catch (err) {
    console.error('[Scheduler] Escalation check failed:', err.message);
  }
}

async function checkApproachingDeadlines() {
  try {
    const snap = await db.collection('complaints').get();
    const now = new Date();
    const in2Days = new Date(now.getTime() + 2 * 864e5);
    const approaching = snap.docs.filter(d => {
      const c = d.data();
      const dl = toDate(c.deadline);
      return !['Resolved', 'Feedback', 'Closed'].includes(c.status) && dl >= now && dl <= in2Days;
    });

    for (const doc of approaching) {
      const c = doc.data();
      if (c.assigned_coordinator_id) {
        await createNotification({ userId: c.assigned_coordinator_id, complaintId: doc.id, title: 'Deadline approaching', message: `Complaint ${c.complaint_code} is due within 2 days.`, type: 'warning' });
      }
    }
  } catch (err) {
    console.error('[Scheduler] Deadline reminder check failed:', err.message);
  }
}

async function generateWeeklyReports() {
  try {
    const end = new Date();
    const start = new Date(); start.setDate(end.getDate() - 7);

    await generateReport({ type: 'Weekly', periodStart: start, periodEnd: end, generatedFor: 'Principal' });

    const deptsSnap = await db.collection('departments').where('status', '==', 'active').get();
    for (const d of deptsSnap.docs) {
      await generateReport({ type: 'Weekly', periodStart: start, periodEnd: end, generatedFor: 'HOD', departmentId: d.id });
    }

    const principalsSnap = await db.collection('users').where('role', '==', 'principal').get();
    for (const p of principalsSnap.docs) {
      await createNotification({ userId: p.id, title: 'Weekly report generated', message: 'The weekly complaint report is now available.', type: 'info' });
    }

    console.log('[Scheduler] Weekly reports generated.');
  } catch (err) {
    console.error('[Scheduler] Weekly report generation failed:', err.message);
  }
}

async function generateMonthlyReports() {
  try {
    const end = new Date();
    const start = new Date(); start.setMonth(end.getMonth() - 1);

    await generateReport({ type: 'Monthly', periodStart: start, periodEnd: end, generatedFor: 'Principal' });

    const deptsSnap = await db.collection('departments').where('status', '==', 'active').get();
    for (const d of deptsSnap.docs) {
      await generateReport({ type: 'Monthly', periodStart: start, periodEnd: end, generatedFor: 'HOD', departmentId: d.id });
    }

    const principalsSnap = await db.collection('users').where('role', '==', 'principal').get();
    for (const p of principalsSnap.docs) {
      await createNotification({ userId: p.id, title: 'Monthly report generated', message: 'The monthly complaint report is now available.', type: 'info' });
    }

    console.log('[Scheduler] Monthly reports generated.');
  } catch (err) {
    console.error('[Scheduler] Monthly report generation failed:', err.message);
  }
}

function startScheduler() {
  cron.schedule('0 * * * *', checkOverdueComplaints);       // hourly
  cron.schedule('0 8 * * *', checkApproachingDeadlines);    // daily 8am
  cron.schedule('0 6 * * 1', generateWeeklyReports);        // Monday 6am
  cron.schedule('0 6 1 * *', generateMonthlyReports);       // 1st of month 6am

  console.log('🕒 Cron scheduler started (hourly escalation checks, daily reminders, weekly/monthly reports).');
}

module.exports = { startScheduler, checkOverdueComplaints, generateWeeklyReports, generateMonthlyReports };
