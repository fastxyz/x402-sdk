import { x402Pay } from '@fastxyz/x402-client';

console.log('Starting x402Pay for ethereum-sepolia...');
console.log('ETH_SEPOLIA_RPC:', process.env.ETH_SEPOLIA_RPC ? 'set' : 'not set');

try {
  const result = await x402Pay({
    url: 'http://localhost:4021/api/eth-sepolia',
    method: 'GET',
    wallet: [
      { type: 'evm', address: '0x1253537Cd5848424C920DD54Ce6DFeBD75EDC471', privateKey: '0x8ffe13c5c67e1c4cc467bc5a0f167f23703646e286469b66e0c49cb587751d89' },
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
