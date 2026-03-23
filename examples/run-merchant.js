#!/usr/bin/env node
/**
 * x402 Merchant Server
 * Protected API endpoints that require payment
 */

import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

// Merchant addresses
const MERCHANT_EVM = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';
const MERCHANT_FAST = 'fast1hjayqnp44xevxvw52jwkgfyrzvquld7eu4383adp3vht9msqtw0s2sz9mv';

// Facilitator config
const facilitator = { url: 'http://localhost:4020' };

// Protected routes with payment requirements
app.use(paymentMiddleware(
  {
    evm: MERCHANT_EVM,
    fast: MERCHANT_FAST,
  },
  {
    'GET /api/arb-sepolia': { price: '$0.000001', network: 'arbitrum-sepolia' },
    'GET /api/eth-sepolia': { price: '$0.000001', network: 'ethereum-sepolia' },
    'GET /api/base': { price: '$0.000001', network: 'base' },
    'GET /api/fast': { price: '$0.000001', network: 'fast-testnet' },
  },
  facilitator
));

// Protected endpoints
app.get('/api/arb-sepolia', (req, res) => {
  res.json({ 
    message: 'Arbitrum Sepolia content unlocked!',
    network: 'arbitrum-sepolia',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/eth-sepolia', (req, res) => {
  res.json({ 
    message: 'Ethereum Sepolia content!',
    network: 'ethereum-sepolia',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/base', (req, res) => {
  res.json({ 
    message: 'Base mainnet content!',
    network: 'base',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/fast', (req, res) => {
  res.json({ 
    message: 'Fast network content!',
    network: 'fast-testnet',
    timestamp: new Date().toISOString()
  });
});

// Health check (free)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4021;
app.listen(PORT, () => {
  console.log(`[merchant] Running on http://localhost:${PORT}`);
  console.log(`[merchant] Protected endpoints ($0.000001 each):`);
  console.log(`  GET /api/arb-sepolia  - arbitrum-sepolia`);
  console.log(`  GET /api/eth-sepolia  - ethereum-sepolia`);
  console.log(`  GET /api/base         - base`);
  console.log(`  GET /api/fast         - fast-testnet`);
  console.log(`[merchant] Free: GET /health`);
});
