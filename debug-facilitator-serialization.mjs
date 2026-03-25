import { readFileSync } from 'fs';
import {
  serializeFastTransaction,
  unwrapFastTransaction,
  serializeVersionedTransaction,
  VersionedTransactionBcs,
} from './packages/x402-facilitator/dist/fast-bcs.js';

// Load the certificate
const cert = JSON.parse(readFileSync('/tmp/fast-cert.json', 'utf8'));

console.log('=== Facilitator Serialization Test ===\n');

// Test with the full transaction (Release20260319 wrapper)
const txBytes1 = serializeFastTransaction(cert.envelope.transaction);
console.log('1. serializeFastTransaction(envelope.transaction):', txBytes1.length, 'bytes');
console.log('   First 50 bytes:', Buffer.from(txBytes1.slice(0, 50)).toString('hex'));

// Test with unwrapped transaction
const unwrapped = unwrapFastTransaction(cert.envelope.transaction);
const txBytes2 = serializeVersionedTransaction(unwrapped);
console.log('\n2. serializeVersionedTransaction(unwrapped):', txBytes2.length, 'bytes');
console.log('   First 50 bytes:', Buffer.from(txBytes2.slice(0, 50)).toString('hex'));

// Test with VersionedTransactionBcs
const txBytes3 = VersionedTransactionBcs.serialize({ Release20260319: unwrapped }).toBytes();
console.log('\n3. VersionedTransactionBcs.serialize({Release20260319}):', txBytes3.length, 'bytes');
console.log('   First 50 bytes:', Buffer.from(txBytes3.slice(0, 50)).toString('hex'));

// Compare
console.log('\n=== Comparison ===');
console.log('Method 1 == Method 2:', Buffer.from(txBytes1).equals(Buffer.from(txBytes2)));
console.log('Method 1 == Method 3:', Buffer.from(txBytes1).equals(Buffer.from(txBytes3)));
console.log('Method 2 == Method 3:', Buffer.from(txBytes2).equals(Buffer.from(txBytes3)));
