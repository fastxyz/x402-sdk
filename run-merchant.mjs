#!/usr/bin/env node
/**
 * x402 Merchant Server for mainnet testing
 * Uses @fastxyz/allset-sdk ^0.1.8
 */
import http from 'http';
import { paymentMiddleware } from './packages/x402-server/dist/index.js';

const PORT = 4021;
const FACILITATOR_URL = 'http://localhost:4020';

// Merchant receives payments
const MERCHANT_EVM = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';
const MERCHANT_FAST = 'fast1u9nqllcflassw406wgxptp2pegazwgd3zmmt4fq5qefx2e2dk08sw0v2ag';

// Payment configuration - separate addresses for Fast and EVM
const payTo = {
  evm: MERCHANT_EVM,
  fast: MERCHANT_FAST,
};

const routes = {
  'GET /api/arbitrum': {
    price: '$0.000001',
    network: 'arbitrum',
    config: {
      description: 'Access to /api/arbitrum',
      asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
  },
  'GET /api/base': {
    price: '$0.000001',
    network: 'base',
    config: {
      description: 'Access to /api/base',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
  'GET /api/fast': {
    price: '$0.000001',
    network: 'fast-mainnet',
    config: {
      description: 'Access to /api/fast',
    },
  },
};

const facilitator = {
  url: FACILITATOR_URL,
};

// Create x402 middleware
const x402 = paymentMiddleware(payTo, routes, facilitator, { debug: true });

// Create HTTP server with Express-compatible req/res
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // Add Express-like properties
  req.path = url.pathname;
  req.header = (name) => req.headers[name.toLowerCase()];
  
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  
  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  // Wrap next() to send response
  let handled = false;
  const next = () => { handled = true; };
  
  // Run x402 middleware
  await x402(req, res, next);
  
  // If middleware didn't handle it (payment verified), send success response
  if (handled && !res.writableEnded) {
    if (url.pathname === '/api/arbitrum') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        network: 'arbitrum',
        message: '🟠 Arbitrum mainnet payment received!',
        timestamp: new Date().toISOString(),
      }));
    } else if (url.pathname === '/api/base') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        network: 'base',
        message: '🔵 Base mainnet payment received!',
        timestamp: new Date().toISOString(),
      }));
    } else if (url.pathname === '/api/fast') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        network: 'fast-mainnet',
        message: '⚡ Fast mainnet payment received!',
        timestamp: new Date().toISOString(),
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`x402 Merchant Server`);
  console.log(`===========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`Facilitator: ${FACILITATOR_URL}`);
  console.log(`Merchant EVM: ${MERCHANT_EVM}`);
  console.log(`Merchant Fast: ${MERCHANT_FAST}`);
  console.log(`Packages: @fastxyz/allset-sdk ^0.1.8`);
  console.log(`===========================================`);
  console.log(`Endpoints:`);
  console.log(`  GET /api/arbitrum  ($0.000001)`);
  console.log(`  GET /api/base      ($0.000001)`);
  console.log(`  GET /api/fast      ($0.000001)`);
  console.log(`===========================================`);
  console.log(``);
});
