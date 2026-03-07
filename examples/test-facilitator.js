/**
 * Test Facilitator Server
 * Runs on port 4020
 */
import express from 'express';
import { createFacilitatorServer } from '../packages/x402-facilitator/dist/index.js';

const app = express();
app.use(express.json());

// Facilitator private key (has ETH for gas)
const FACILITATOR_KEY = '0xd815c906df2ce8ec6213eef172bdfe1bd2370ffeb3a83ce7487b2ee54117e60b';

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
