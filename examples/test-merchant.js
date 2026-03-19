/**
 * Test Merchant Server
 * Accepts payments on fast-testnet, ethereum-sepolia, arbitrum-sepolia, and base
 * Runs on port 4021
 */
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();
app.use(express.json());

// Merchant addresses
const MERCHANT_FAST_ADDRESS = 'fast1hjayqnp44xevxvw52jwkgfyrzvquld7eu4383adp3vht9msqtw0s2sz9mv';
const MERCHANT_EVM_ADDRESS = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';

// Facilitator URL
const FACILITATOR_URL = 'http://localhost:4020';

// Pay-to config (supports both Fast and EVM)
const payTo = {
  fast: MERCHANT_FAST_ADDRESS,
  evm: MERCHANT_EVM_ADDRESS,
};

// Routes config - all endpoints charge 0.000001 USDC
// Price format: "$0.000001" or raw units "1"
const routes = {
  'GET /weather': {
    price: '$0.000001',
    network: 'fast-testnet',
  },
  'GET /weather/eth': {
    price: '$0.000001',
    network: 'ethereum-sepolia',
  },
  'GET /weather/arb': {
    price: '$0.000001',
    network: 'arbitrum-sepolia',
  },
  'GET /weather/base': {
    price: '$0.000001',
    network: 'base',
  },
  'GET /joke': {
    price: '$0.000001',
    network: 'fast-testnet',
  },
  'GET /quote': {
    price: '$0.000001',
    network: 'fast-testnet',
  },
};

// Apply payment middleware
app.use(paymentMiddleware(payTo, routes, { url: FACILITATOR_URL }));

// Protected endpoints
app.get('/weather', (req, res) => {
  res.json({
    service: 'weather',
    network: 'fast-testnet',
    data: {
      location: 'Singapore',
      temperature: '31°C',
      humidity: '75%',
      conditions: 'Partly Cloudy',
    },
  });
});

app.get('/weather/eth', (req, res) => {
  res.json({
    service: 'weather',
    network: 'ethereum-sepolia',
    data: {
      location: 'Singapore',
      temperature: '31°C',
      humidity: '75%',
      conditions: 'Partly Cloudy',
    },
  });
});

app.get('/weather/arb', (req, res) => {
  res.json({
    service: 'weather',
    network: 'arbitrum-sepolia',
    data: {
      location: 'Singapore',
      temperature: '31°C',
      humidity: '75%',
      conditions: 'Partly Cloudy',
    },
  });
});

app.get('/weather/base', (req, res) => {
  res.json({
    service: 'weather',
    network: 'base',
    data: {
      location: 'Singapore',
      temperature: '31°C',
      humidity: '75%',
      conditions: 'Partly Cloudy',
    },
  });
});

app.get('/joke', (req, res) => {
  const jokes = [
    "Why do programmers prefer dark mode? Because light attracts bugs!",
    "Why did the blockchain developer break up? They had trust issues.",
    "What's a crypto trader's favorite key? The HODL key!",
  ];
  res.json({
    service: 'joke',
    network: 'fast-testnet',
    data: { joke: jokes[Math.floor(Math.random() * jokes.length)] },
  });
});

app.get('/quote', (req, res) => {
  const quotes = [
    "The best time to plant a tree was 20 years ago. The second best time is now.",
    "Code is like humor. When you have to explain it, it's bad.",
    "First, solve the problem. Then, write the code.",
  ];
  res.json({
    service: 'quote',
    network: 'fast-testnet',
    data: { quote: quotes[Math.floor(Math.random() * quotes.length)] },
  });
});

// Health check (free - not in routes config)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'merchant' });
});

// Info endpoint (free)
app.get('/', (req, res) => {
  res.json({
    service: 'Test Merchant',
    price: '0.000001 USDC',
    endpoints: {
      '/weather': 'fast-testnet',
      '/weather/eth': 'ethereum-sepolia',
      '/weather/arb': 'arbitrum-sepolia',
      '/weather/base': 'base',
      '/joke': 'fast-testnet',
      '/quote': 'fast-testnet',
    },
    facilitator: FACILITATOR_URL,
    payTo: payTo,
  });
});

const PORT = 4021;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Merchant running on http://0.0.0.0:${PORT}`);
  console.log(`Price: 0.000001 USDC per request`);
  console.log('');
  console.log('Paid endpoints:');
  console.log('  GET /weather      → fast-testnet');
  console.log('  GET /weather/eth  → ethereum-sepolia');
  console.log('  GET /weather/arb  → arbitrum-sepolia');
  console.log('  GET /weather/base → base');
  console.log('  GET /joke         → fast-testnet');
  console.log('  GET /quote        → fast-testnet');
  console.log('');
  console.log('Free endpoints:');
  console.log('  GET /             → Service info');
  console.log('  GET /health       → Health check');
});
