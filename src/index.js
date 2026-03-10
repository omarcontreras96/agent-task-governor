const express = require('express');
const cors = require('cors');
const { validateInput } = require('./schema/validate');
const governor = require('./engine/governor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Main governance endpoint
app.post('/api/govern', (req, res) => {
  // Set 8s timeout to stay under Join39's 10s limit
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Request timed out' });
    }
  }, 8000);

  try {
    const validation = validateInput(req.body);
    if (!validation.valid) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { tasks, policy, currentTime } = validation.data;
    const result = governor.run(tasks, policy, currentTime);

    clearTimeout(timeout);
    return res.json(result);
  } catch (err) {
    clearTimeout(timeout);
    console.error('Governor error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Agent Task Governor running on port ${PORT}`);
});

module.exports = app;
