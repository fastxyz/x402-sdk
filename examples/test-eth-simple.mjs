import { x402Pay } from '@fastxyz/x402-client';

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
const EVM_ADDRESS = process.env.EVM_ADDRESS;

if (!EVM_PRIVATE_KEY || !EVM_ADDRESS) {
  console.error('ERROR: EVM_PRIVATE_KEY and EVM_ADDRESS environment variables required');
  process.exit(1);
}

console.log('Starting x402Pay for ethereum-sepolia...');
console.log('ETH_SEPOLIA_RPC:', process.env.ETH_SEPOLIA_RPC ? 'set' : 'not set');

try {
  const result = await x402Pay({
    url: 'http://localhost:4021/api/eth-sepolia',
    method: 'GET',
    wallet: [
      { type: 'evm', address: EVM_ADDRESS, privateKey: EVM_PRIVATE_KEY },
    ],
    facilitatorUrl: 'http://localhost:4020',
    verbose: true,
  });
  console.log('Success:', result.success);
  console.log('Status:', result.statusCode);
  console.log('Payment:', JSON.stringify(result.payment, null, 2));
  if (result.logs) result.logs.forEach(l => console.log(l));
} catch (err) {
  console.error('Error:', err.message);
  if (err.stack) console.error(err.stack);
}
