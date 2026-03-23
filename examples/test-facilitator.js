/**
 * Test Facilitator Server
 * Runs on port 4020
 */
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

const app = express();
app.use(express.json());

// Facilitator private key (has ETH for gas) - set via environment variable
const FACILITATOR_KEY = process.env.EVM_PRIVATE_KEY;

if (!FACILITATOR_KEY) {
  console.error('ERROR: EVM_PRIVATE_KEY environment variable required');
  process.exit(1);
}

app.use(createFacilitatorServer({
  evmPrivateKey: FACILITATOR_KEY,
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'facilitator' });
});

const PORT = 4020;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Facilitator running on http://0.0.0.0:${PORT}`);
  console.log('Endpoints: /verify, /settle, /supported');
});
