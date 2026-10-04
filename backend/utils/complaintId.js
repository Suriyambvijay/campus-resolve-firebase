const { db } = require('../config/firebase');

/**
 * Generates a unique, human-readable complaint code: CMP-2026-0001
 * Uses a Firestore transaction on a per-year counter document so
 * concurrent submissions never collide.
 */
async function generateComplaintCode() {
  const year = new Date().getFullYear();
  const counterRef = db.collection('counters').doc(`complaints_${year}`);

  const nextSeq = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? doc.data().value : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });

  const padded = String(nextSeq).padStart(4, '0');
  return `CMP-${year}-${padded}`;
}

module.exports = { generateComplaintCode };
