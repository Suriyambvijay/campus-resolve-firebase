const { db } = require('../config/firebase');

async function scopedComplaints(user) {
  let query = db.collection('complaints');
  if (user.role === 'hod') query = query.where('department_id', '==', user.department_id);
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function groupCount(arr, keyFn) {
  const map = {};
  arr.forEach(item => {
    const k = keyFn(item) || 'Unassigned';
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).map(([k, count]) => ({ key: k, count }));
}

exports.overview = async (req, res) => {
  try {
    const complaints = await scopedComplaints(req.user);
    const total = complaints.length;
    const resolved = complaints.filter(c => ['Resolved', 'Feedback', 'Closed'].includes(c.status)).length;
    const pending = complaints.filter(c => !['Resolved', 'Feedback', 'Closed'].includes(c.status)).length;
    const escalated = complaints.filter(c => c.status === 'Escalated').length;

    const resolvedWithTimes = complaints.filter(c => c.resolved_at && c.submitted_at);
    let avg_resolution_hours = null;
    if (resolvedWithTimes.length > 0) {
      const totalHrs = resolvedWithTimes.reduce((sum, c) => {
        const sub = c.submitted_at.toDate ? c.submitted_at.toDate() : new Date(c.submitted_at);
        const res = c.resolved_at.toDate ? c.resolved_at.toDate() : new Date(c.resolved_at);
        return sum + (res - sub) / 36e5;
      }, 0);
      avg_resolution_hours = (totalHrs / resolvedWithTimes.length).toFixed(1);
    }

    const complaintIds = new Set(complaints.map(c => c.id));
    const ratingsSnap = await db.collection('ratings').get();
    const relevantRatings = ratingsSnap.docs.filter(r => complaintIds.has(r.id)).map(r => r.data().rating);
    const average_rating = relevantRatings.length > 0 ? (relevantRatings.reduce((a, b) => a + b, 0) / relevantRatings.length).toFixed(1) : null;

    return res.json({
      success: true,
      overview: {
        total, resolved, pending, escalated,
        resolution_rate: total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0',
        avg_resolution_hours, average_rating
      }
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    return res.status(500).json({ success: false, message: 'Unable to load analytics.' });
  }
};

exports.weeklyTrend = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);
  const recent = complaints.filter(c => {
    const d = c.submitted_at?.toDate ? c.submitted_at.toDate() : new Date(c.submitted_at);
    return d >= sevenDaysAgo;
  });
  const byDay = groupCount(recent, c => {
    const d = c.submitted_at?.toDate ? c.submitted_at.toDate() : new Date(c.submitted_at);
    return d.toISOString().slice(0, 10);
  });
  return res.json({ success: true, trend: byDay.map(b => ({ day: b.key, count: b.count })).sort((a, b) => a.day.localeCompare(b.day)) });
};

exports.monthlyTrend = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const yearAgo = new Date(); yearAgo.setMonth(yearAgo.getMonth() - 12);
  const recent = complaints.filter(c => {
    const d = c.submitted_at?.toDate ? c.submitted_at.toDate() : new Date(c.submitted_at);
    return d >= yearAgo;
  });
  const byMonth = groupCount(recent, c => {
    const d = c.submitted_at?.toDate ? c.submitted_at.toDate() : new Date(c.submitted_at);
    return d.toISOString().slice(0, 7);
  });
  return res.json({ success: true, trend: byMonth.map(b => ({ month: b.key, count: b.count })).sort((a, b) => a.month.localeCompare(b.month)) });
};

exports.byDepartment = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const grouped = groupCount(complaints, c => c.department_name);
  return res.json({ success: true, data: grouped.map(g => ({ department_name: g.key, count: g.count })) });
};

exports.byCategory = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const grouped = groupCount(complaints, c => c.category_name);
  return res.json({ success: true, data: grouped.map(g => ({ category_name: g.key, count: g.count })) });
};

exports.byPriority = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const grouped = groupCount(complaints, c => c.priority);
  return res.json({ success: true, data: grouped.map(g => ({ priority: g.key, count: g.count })) });
};

exports.byStatus = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const grouped = groupCount(complaints, c => c.status);
  return res.json({ success: true, data: grouped.map(g => ({ status: g.key, count: g.count })) });
};

exports.satisfaction = async (req, res) => {
  const complaints = await scopedComplaints(req.user);
  const complaintIds = new Set(complaints.map(c => c.id));
  const ratingsSnap = await db.collection('ratings').get();
  const relevant = ratingsSnap.docs.filter(r => complaintIds.has(r.id)).map(r => r.data());
  const grouped = groupCount(relevant, r => String(r.rating));
  return res.json({ success: true, data: grouped.map(g => ({ rating: Number(g.key), count: g.count })).sort((a, b) => a.rating - b.rating) });
};
