const { db } = require('../config/firebase');
const { generateReport } = require('../utils/reportGenerator');

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return ts;
}

exports.generateWeekly = async (req, res) => {
  try {
    const end = new Date();
    const start = new Date(); start.setDate(end.getDate() - 7);
    const generatedFor = req.user.role === 'principal' ? 'Principal' : 'HOD';
    const departmentId = req.user.role === 'hod' ? req.user.department_id : null;

    const result = await generateReport({ type: 'Weekly', periodStart: start, periodEnd: end, generatedFor, departmentId });
    return res.json({ success: true, message: 'Weekly report generated.', file: `/reports/${result.fileName}` });
  } catch (err) {
    console.error('Generate weekly report error:', err);
    return res.status(500).json({ success: false, message: 'Unable to generate weekly report.' });
  }
};

exports.generateMonthly = async (req, res) => {
  try {
    const end = new Date();
    const start = new Date(); start.setMonth(end.getMonth() - 1);
    const generatedFor = req.user.role === 'principal' ? 'Principal' : 'HOD';
    const departmentId = req.user.role === 'hod' ? req.user.department_id : null;

    const result = await generateReport({ type: 'Monthly', periodStart: start, periodEnd: end, generatedFor, departmentId });
    return res.json({ success: true, message: 'Monthly report generated.', file: `/reports/${result.fileName}` });
  } catch (err) {
    console.error('Generate monthly report error:', err);
    return res.status(500).json({ success: false, message: 'Unable to generate monthly report.' });
  }
};

exports.listReports = async (req, res) => {
  const snap = await db.collection('reports').get();
  let reports = snap.docs.map(d => ({ id: d.id, ...d.data(), generated_at: toIso(d.data().generated_at) }));

  if (req.user.role === 'hod') {
    reports = reports.filter(r => r.generated_for === 'HOD' && (r.department_id === req.user.department_id || !r.department_id));
  } else if (req.user.role === 'principal') {
    reports = reports.filter(r => r.generated_for === 'Principal');
  }

  reports.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
  return res.json({ success: true, reports: reports.slice(0, 50) });
};
