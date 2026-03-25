import express from 'express';
import { paymentMiddleware } from './packages/x402-server/dist/index.js';
import { readFileSync } from 'fs';

// Load merchant wallet
const keyPath = process.env.HOME + '/.money/keys/merchant-arb.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
const MERCHANT_EVM_ADDRESS = keyData.address;

// TODO: Get merchant Fast address from keyfile when available
const MERCHANT_FAST_ADDRESS = 'fast1u9nqllcflassw406wgxptp2pegazwgd3zmmt4fq5qefx2e2dk08sw0v2ag';

console.log('Merchant EVM address:', MERCHANT_EVM_ADDRESS);
console.log('Merchant Fast address:', MERCHANT_FAST_ADDRESS);

const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`\n→ ${req.method} ${req.path}`);
  if (req.headers['x-payment']) {
    console.log('  X-Payment:', req.headers['x-payment'].slice(0, 100) + '...');
  }
  
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - start;
    console.log(`← ${res.statusCode} (${duration}ms)`);
    try {
      const parsed = JSON.parse(body);
      console.log('  Response:', JSON.stringify(parsed, null, 2).split('\n').slice(0, 10).map(l => '  ' + l).join('\n'));
    } catch (e) {
      console.log('  Response:', String(body).slice(0, 200));
    }
    return originalSend.call(this, body);
  };
  next();
});

// Facilitator URL
const FACILITATOR_URL = 'http://localhost:4020';

// Health endpoint (free - before payment middleware)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    merchant: {
      evm: MERCHANT_EVM_ADDRESS,
      fast: MERCHANT_FAST_ADDRESS,
    },
    timestamp: new Date().toISOString()
  });
});

// Payment middleware for protected routes
app.use(paymentMiddleware(
  {
    evm: MERCHANT_EVM_ADDRESS,
    fast: MERCHANT_FAST_ADDRESS,
  },
  {
    'GET /api/fast': { price: '0.000001', network: 'fast-mainnet' },
    'GET /api/base': { price: '0.000001', network: 'base' },
    'GET /api/arbitrum': { price: '0.000001', network: 'arbitrum' },
  },
  { url: FACILITATOR_URL }
));

// Fast mainnet endpoint
app.get('/api/fast', (req, res) => {
  res.json({ 
    success: true,
    network: 'fast-mainnet',
    message: '🚀 Fast mainnet payment received!',
    timestamp: new Date().toISOString()
  });
});

// Base mainnet endpoint
app.get('/api/base', (req, res) => {
  res.json({
    success: true,
    network: 'base',
    message: '🔵 Base mainnet payment received!',
    timestamp: new Date().toISOString()
  });
});

// Arbitrum mainnet endpoint
app.get('/api/arbitrum', (req, res) => {
  res.json({
    success: true,
    network: 'arbitrum',
    message: '🟠 Arbitrum mainnet payment received!',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4021;
app.listen(PORT, () => {
  console.log(`Merchant running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET /health           - Free health check');
  console.log('  GET /api/fast         - Fast mainnet (0.000001 USDC)');
  console.log('  GET /api/base         - Base mainnet (0.000001 USDC)');
  console.log('  GET /api/arbitrum     - Arbitrum mainnet (0.000001 USDC)');
  console.log('');
  console.log('✅ Request logging ENABLED\n');
});
