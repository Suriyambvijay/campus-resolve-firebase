const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, admin } = require('../config/firebase');
const { FieldValue } = admin.firestore;

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function toDate(v) {
  if (!v) return null;
  return v.toDate ? v.toDate() : new Date(v);
}

async function gatherStats(periodStart, periodEnd, departmentId = null) {
  const snap = await db.collection('complaints').get();
  let complaints = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => {
    const submitted = toDate(c.submitted_at);
    return submitted && submitted >= periodStart && submitted <= periodEnd;
  });
  if (departmentId) complaints = complaints.filter(c => c.department_id === departmentId);

  const total = complaints.length;
  const resolved = complaints.filter(c => ['Resolved', 'Feedback', 'Closed'].includes(c.status)).length;
  const pending = complaints.filter(c => !['Resolved', 'Feedback', 'Closed', 'Escalated'].includes(c.status)).length;
  const inProgress = complaints.filter(c => c.status === 'In Progress').length;
  const escalated = complaints.filter(c => c.status === 'Escalated').length;

  const resolvedWithTimes = complaints.filter(c => c.resolved_at && c.submitted_at);
  let avgResolutionHours = null;
  if (resolvedWithTimes.length > 0) {
    const totalHrs = resolvedWithTimes.reduce((sum, c) => sum + (toDate(c.resolved_at) - toDate(c.submitted_at)) / 36e5, 0);
    avgResolutionHours = (totalHrs / resolvedWithTimes.length).toFixed(1);
  }

  const complaintIds = new Set(complaints.map(c => c.id));
  const ratingsSnap = await db.collection('ratings').get();
  const relevantRatings = ratingsSnap.docs.filter(r => complaintIds.has(r.id)).map(r => r.data().rating);
  const avgRating = relevantRatings.length > 0 ? (relevantRatings.reduce((a, b) => a + b, 0) / relevantRatings.length).toFixed(1) : null;

  function group(keyFn) {
    const map = {};
    complaints.forEach(c => { const k = keyFn(c) || 'Unassigned'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }

  const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';

  return {
    total, resolved, pending, inProgress, escalated, resolutionRate,
    avgResolutionHours, avgRating, ratingCount: relevantRatings.length,
    byDept: group(c => c.department_name), byCategory: group(c => c.category_name), byPriority: group(c => c.priority)
  };
}

function drawHeader(doc, subtitle, periodLabel) {
  doc.fontSize(20).fillColor('#2b1e6b').text('CAMPUS RESOLVE', { align: 'center' });
  doc.fontSize(11).fillColor('#555').text('College Complaint Management System', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(15).fillColor('#000').text(subtitle, { align: 'center' });
  doc.fontSize(10).fillColor('#555').text(`Period: ${periodLabel}`, { align: 'center' });
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown(1);
}

function sectionTitle(doc, title) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor('#2b1e6b').text(title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#000');
}

function keyValRow(doc, label, value) {
  doc.text(`${label}: `, { continued: true }).font('Helvetica-Bold').text(`${value}`).font('Helvetica');
}

async function generateReport({ type, periodStart, periodEnd, generatedFor, departmentId = null }) {
  const stats = await gatherStats(periodStart, periodEnd, departmentId);
  const periodLabel = `${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`;
  const fileName = `${type.toLowerCase()}-report-${generatedFor.toLowerCase()}-${Date.now()}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);

  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  drawHeader(doc, `${type} Complaint Report`, periodLabel);

  if (stats.total === 0) {
    doc.fontSize(12).text('No sufficient data available for this reporting period.', { align: 'center' });
  } else {
    sectionTitle(doc, 'Executive Summary');
    keyValRow(doc, 'Total Complaints', stats.total);
    keyValRow(doc, 'Resolved', stats.resolved);
    keyValRow(doc, 'Pending', stats.pending);
    keyValRow(doc, 'In Progress', stats.inProgress);
    keyValRow(doc, 'Escalated', stats.escalated);
    keyValRow(doc, 'Resolution Rate', `${stats.resolutionRate}%`);
    keyValRow(doc, 'Average Resolution Time', stats.avgResolutionHours ? `${stats.avgResolutionHours} hours` : 'N/A');
    keyValRow(doc, 'Average Student Rating', stats.avgRating ? `${stats.avgRating} / 5 (${stats.ratingCount} responses)` : 'No ratings yet');

    sectionTitle(doc, 'Department-wise Summary');
    stats.byDept.length ? stats.byDept.forEach(d => doc.text(`${d.key}: ${d.count} complaint(s)`)) : doc.text('No data available.');

    sectionTitle(doc, 'Category-wise Summary');
    stats.byCategory.length ? stats.byCategory.forEach(c => doc.text(`${c.key}: ${c.count} complaint(s)`)) : doc.text('No data available.');

    sectionTitle(doc, 'Priority-wise Summary');
    stats.byPriority.forEach(p => doc.text(`${p.key}: ${p.count} complaint(s)`));

    sectionTitle(doc, 'Escalation Summary');
    doc.text(`${stats.escalated} complaint(s) required escalation during this period.`);

    sectionTitle(doc, 'Feedback Summary');
    doc.text(stats.ratingCount > 0
      ? `${stats.ratingCount} student(s) submitted feedback with an average satisfaction of ${stats.avgRating} out of 5.`
      : 'No student feedback was submitted during this period.');

    sectionTitle(doc, 'Key Observations');
    const observations = [];
    if (Number(stats.resolutionRate) < 50) observations.push('Resolution rate is below 50% - additional coordinator capacity may be required.');
    if (stats.escalated > 0) observations.push(`${stats.escalated} complaint(s) were escalated, indicating deadline or complexity challenges.`);
    if (stats.avgRating && Number(stats.avgRating) < 3) observations.push('Average student satisfaction is below 3/5, suggesting a need to review resolution quality.');
    if (observations.length === 0) observations.push('No significant concerns identified for this period.');
    observations.forEach(o => doc.text(`• ${o}`));

    sectionTitle(doc, 'Recommended Administrative Actions');
    const actions = [];
    if (Number(stats.resolutionRate) < 50) actions.push('Review coordinator workload distribution and reassign pending complaints.');
    if (stats.escalated > 0) actions.push('Conduct a review of escalated complaints with department HODs.');
    if (actions.length === 0) actions.push('Continue current resolution practices; no immediate action required.');
    actions.forEach(a => doc.text(`• ${a}`));
  }

  doc.moveDown(1.5);
  doc.fontSize(9).fillColor('#777').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
  doc.text(`Generated for: ${generatedFor}`, { align: 'right' });

  doc.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });

  await db.collection('reports').add({
    report_type: type, period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(),
    generated_for: generatedFor, department_id: departmentId, file_path: `/reports/${fileName}`,
    generated_at: FieldValue.serverTimestamp(), status: 'generated'
  });

  return { filePath, fileName, stats };
}

module.exports = { generateReport, gatherStats };
