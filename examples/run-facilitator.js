#!/usr/bin/env node
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

// Facilitator needs an EVM private key with ETH for gas
// Set via environment variable: EVM_PRIVATE_KEY=0x...
const evmPrivateKey = process.env.EVM_PRIVATE_KEY;

if (!evmPrivateKey) {
  console.error('[facilitator] ERROR: EVM_PRIVATE_KEY environment variable required');
  console.error('[facilitator] Export a private key with ETH for gas on target chains');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Request logging with response body
app.use((req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    if (body?.isValid !== undefined) {
      console.log(`  → isValid: ${body.isValid}${body.invalidReason ? ', reason: ' + body.invalidReason : ''}`);
    }
    return originalJson(body);
  };
  next();
});

app.use(createFacilitatorServer({ evmPrivateKey }));

const PORT = 4020;
app.listen(PORT, () => {
  console.log(`[facilitator] Running on http://localhost:${PORT}`);
  console.log(`[facilitator] Endpoints: /verify, /settle, /supported`);
});
