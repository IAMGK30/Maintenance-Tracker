// server.js  – TaskEscalate backend entry point
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const mongoose = require('mongoose');
const routes    = require('./routes');
const { startScheduler } = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 3001;

mongoose.connect(process.env.MONGO_URI)    
    .then(() =>console.log("MongoDB Connected"))
    .catch(err => console.log("MongoDB Error:",err));


// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Serve React frontend in production ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendBuild = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ success: false, error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡ TaskEscalate backend running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health\n`);
  startScheduler();
});

module.exports = app;
