// Updated server.js with improved error handling and timeout settings
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');

dotenv.config();
const app = express();

// Increase JSON payload size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware setup
app.use(cors());

// Restrict end-user access to local Wi-Fi subnet but allow internal server calls
// Restrict end-user access to local Wi-Fi subnet but allow internal server calls
app.use((req, res, next) => {
  const requestIP = req.headers['x-forwarded-for'] || req.ip;

  const isLocalhost = requestIP.includes('127.0.0.1') || requestIP.includes('::1');
  const isOnWifi = requestIP.includes('172.21.100.');

  if (!isLocalhost && !isOnWifi) {
    console.warn(`Blocked request from IP: ${requestIP}`);
    return res.status(403).json({ message: 'Access denied: not on Wi-Fi network' });
  }

  next();
});

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Increase timeout for API responses
app.use((req, res, next) => {
  // Set timeout to 120 seconds
  req.setTimeout(120000);
  res.setTimeout(120000);
  next();
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Import routes
const gameRoutes = require('./routes/game');

// Register API routes
app.use('/api/game', gameRoutes);

// Debug route to verify server is running
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running correctly' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ message: 'Server error', error: err.message });
});

// Catch-all route for 404s
app.use((req, res) => {
  console.log(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ message: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));