import express from 'express';
import { createFacilitatorServer } from './packages/x402-facilitator/dist/index.js';
import { readFileSync } from 'fs';

// Load facilitator private key
const keyPath = process.env.HOME + '/.money/keys/facilitator-arb.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
const FACILITATOR_KEY = keyData.privateKey;

console.log('Facilitator address:', keyData.address);

const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`\n→ ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('  Body:', JSON.stringify(req.body, null, 2).split('\n').map(l => '  ' + l).join('\n'));
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

app.use(createFacilitatorServer({
  evmPrivateKey: FACILITATOR_KEY,
  // Custom chain configs with private RPC
  chains: {
    'base': {
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    },
  },
}));

const PORT = process.env.PORT || 4020;
app.listen(PORT, () => {
  console.log(`Facilitator running on http://localhost:${PORT}`);
  console.log('Endpoints: POST /verify, POST /settle, GET /supported');
  console.log('✅ Request logging ENABLED\n');
});
