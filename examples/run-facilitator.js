#!/usr/bin/env node
/**
 * x402 Facilitator Server
 * Verifies and settles x402 payments
 */

import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';
import fs from 'fs';
import path from 'path';

// Load facilitator key
const keyPath = path.join(process.env.HOME, '.money/keys/evm.json');
const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const evmPrivateKey = `0x${keyData.privateKey}`;

const app = express();
app.use(express.json());

// Add facilitator endpoints: /verify, /settle, /supported
app.use(createFacilitatorServer({
  evmPrivateKey,
}));

const PORT = process.env.PORT || 4020;
app.listen(PORT, () => {
  console.log(`[facilitator] Running on http://localhost:${PORT}`);
  console.log(`[facilitator] Endpoints: /verify, /settle, /supported`);
});
