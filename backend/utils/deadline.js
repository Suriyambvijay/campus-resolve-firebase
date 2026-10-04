/**
 * Deadlines are ALWAYS calculated on the backend, never trusted from the client.
 * Standard resolution period: 1-2 weeks, varying by priority.
 */
function calculateDeadline(priority, fromDate = new Date()) {
  const base = new Date(fromDate);
  let daysToAdd;

  switch (priority) {
    case 'Critical':
      // Immediate administrative attention - short SLA
      daysToAdd = 2;
      break;
    case 'High':
      daysToAdd = 7; // within 1 week
      break;
    case 'Medium':
      daysToAdd = 10; // within 1-2 weeks
      break;
    case 'Low':
      daysToAdd = 14; // within 2 weeks
      break;
    default:
      daysToAdd = 10;
  }

  base.setDate(base.getDate() + daysToAdd);
  return base;
}

function daysRemaining(deadline) {
  const now = new Date();
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function deadlineLabel(deadline, status) {
  if (['Resolved', 'Feedback', 'Closed'].includes(status)) {
    return { text: 'Completed', level: 'success' };
  }
  const remaining = daysRemaining(deadline);
  if (remaining < 0) {
    return { text: `Deadline exceeded by ${Math.abs(remaining)} day(s)`, level: 'danger' };
  }
  if (remaining === 0) {
    return { text: 'Due today', level: 'warning' };
  }
  if (remaining <= 2) {
    return { text: `Deadline approaching - ${remaining} day(s) remaining`, level: 'warning' };
  }
  return { text: `${remaining} day(s) remaining`, level: 'success' };
}

module.exports = { calculateDeadline, daysRemaining, deadlineLabel };
