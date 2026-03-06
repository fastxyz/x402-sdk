/**
 * Test Protected API Server
 * Runs on port 3000
 */
import express from 'express';
import { paymentMiddleware } from '../packages/x402-server/dist/index.js';

const app = express();
app.use(express.json());

// Merchant addresses
const MERCHANT_EVM = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';
const MERCHANT_FAST = 'fast1hjayqnp44xevxvw52jwkgfyrzvquld7eu4383adp3vht9msqtw0s2sz9mv';

// Facilitator URL
const FACILITATOR_URL = 'http://localhost:4020';

// Protect routes with payment middleware
app.use(paymentMiddleware(
  {
    evm: MERCHANT_EVM,
    fast: MERCHANT_FAST,
  },
  {
    'GET /api/weather': { price: '$0.01', network: 'arbitrum-sepolia' },
    'GET /api/fast-weather': { price: '$0.01', network: 'fast-testnet' },
    'GET /api/premium/*': { price: '$0.05', network: 'arbitrum-sepolia' },
  },
  { url: FACILITATOR_URL }
));

// Protected endpoints
app.get('/api/weather', (req, res) => {
  res.json({
    location: 'Singapore',
    temperature: '31°C',
    conditions: 'Partly Cloudy',
    humidity: '75%',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/fast-weather', (req, res) => {
  res.json({
    location: 'Singapore',
    temperature: '31°C',
    conditions: 'Partly Cloudy',
    humidity: '75%',
    timestamp: new Date().toISOString(),
    network: 'fast-testnet',
  });
});

app.get('/api/premium/forecast', (req, res) => {
  res.json({
    location: 'Singapore',
    forecast: [
      { day: 'Today', high: '32°C', low: '26°C', conditions: 'Sunny' },
      { day: 'Tomorrow', high: '31°C', low: '25°C', conditions: 'Cloudy' },
      { day: 'Day 3', high: '30°C', low: '25°C', conditions: 'Rain' },
    ],
    timestamp: new Date().toISOString(),
  });
});

// Health check (free)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'protected-api' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Protected API running on http://localhost:${PORT}`);
  console.log('');
  console.log('Protected endpoints:');
  console.log('  GET /api/weather       - $0.01 (arbitrum-sepolia)');
  console.log('  GET /api/fast-weather  - $0.01 (fast-testnet)');
  console.log('  GET /api/premium/*     - $0.05 (arbitrum-sepolia)');
  console.log('');
  console.log('Free endpoints:');
  console.log('  GET /health');
});
