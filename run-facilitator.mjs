#!/usr/bin/env node
/**
 * x402 Facilitator Server for mainnet testing
 * Uses dedicated RPCs for Base and Arbitrum
 */
import http from 'http';
import { readFileSync } from 'fs';
import { createFacilitatorServer } from './packages/x402-facilitator/dist/index.js';

const PORT = 4020;

// Load private RPC config
let rpcConfig = {};
try {
  rpcConfig = JSON.parse(readFileSync(process.env.HOME + '/.config/x402/rpc.json', 'utf8'));
} catch {
  console.warn('Warning: No custom RPC config found, using public RPCs');
}

// Facilitator EVM private key
const FACILITATOR_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

if (!FACILITATOR_PRIVATE_KEY) {
  console.error('ERROR: EVM_PRIVATE_KEY environment variable required');
  process.exit(1);
}

const facilitatorMiddleware = createFacilitatorServer({
  evmPrivateKey: FACILITATOR_PRIVATE_KEY,
  debug: true,
  // Custom RPC URLs for each chain
  rpcUrls: {
    base: rpcConfig.base,
    arbitrum: rpcConfig.arbitrum,
  },
});

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    await new Promise(resolve => req.on('end', resolve));
    try {
      req.body = JSON.parse(body);
    } catch {
      req.body = {};
    }
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`);
  req.path = url.pathname;
  
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  
  if (req.path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  await facilitatorMiddleware(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

server.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`x402 Facilitator Server`);
  console.log(`===========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`RPCs:`);
  console.log(`  Base: ${rpcConfig.base ? 'dedicated ✓' : 'public'}`);
  console.log(`  Arbitrum: ${rpcConfig.arbitrum ? 'dedicated ✓' : 'public'}`);
  console.log(`Debug: enabled`);
  console.log(`===========================================`);
  console.log(``);
});
