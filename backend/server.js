require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { testConnection } = require('./config/firebase');
const { startScheduler } = require('./utils/scheduler');

const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const adminRoutes = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Static file serving (uploads + generated reports)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Campus Resolve API (Firebase edition) is running.' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`\n🚀 Campus Resolve (Firebase edition) running on http://localhost:${PORT}`);
  await testConnection();
  startScheduler();
});
