const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

router.get('/departments', async (req, res) => {
  const snap = await db.collection('departments').where('status', '==', 'active').get();
  const departments = snap.docs
    .map(d => ({ id: d.id, department_name: d.data().department_name }))
    .sort((a, b) => a.department_name.localeCompare(b.department_name));
  res.json({ success: true, departments });
});

router.get('/categories', async (req, res) => {
  const snap = await db.collection('categories').where('status', '==', 'active').get();
  const categories = snap.docs
    .map(d => ({ id: d.id, category_name: d.data().category_name, description: d.data().description }))
    .sort((a, b) => a.category_name.localeCompare(b.category_name));
  res.json({ success: true, categories });
});

module.exports = router;
