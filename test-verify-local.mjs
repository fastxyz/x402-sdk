// Test verification locally without making a request
import { readFileSync } from 'fs';
import {
  serializeFastTransaction,
  unwrapFastTransaction,
  createFastTransactionSigningMessage,
  fastAddressToBytes,
  bytesToHex,
} from './packages/x402-facilitator/dist/fast-bcs.js';
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifyEd25519(publicKeyBytes, message, signatureBytes) {
  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) {
    console.log('Bad lengths:', publicKeyBytes.length, signatureBytes.length);
    return false;
  }
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
      format: "der",
      type: "spki",
    });
    return verifySignature(null, Buffer.from(message), publicKey, Buffer.from(signatureBytes));
  } catch (e) {
    console.log('Verify error:', e.message);
    return false;
  }
}

// Load the certificate we just generated
const cert = JSON.parse(readFileSync('/tmp/fast-cert.json', 'utf8'));

console.log('=== Testing Signature Verification ===\n');

// 1. Unwrap transaction
const transaction = unwrapFastTransaction(cert.envelope.transaction);
console.log('1. Unwrapped transaction:', JSON.stringify(transaction, (k, v) => 
  Array.isArray(v) && v.length === 32 ? `[${v.length} bytes]` : v, 2).slice(0, 500));

// 2. Serialize transaction
const txBytes = serializeFastTransaction(cert.envelope.transaction);
console.log('\n2. Serialized tx bytes:', txBytes.length, 'bytes');
console.log('   First 32 bytes:', bytesToHex(txBytes.slice(0, 32)));

// 3. Create signing message
const signingMessage = createFastTransactionSigningMessage(txBytes);
console.log('\n3. Signing message:', signingMessage.length, 'bytes');
console.log('   Prefix:', new TextDecoder().decode(signingMessage.slice(0, 22)));

// 4. Extract sender public key
const senderPubkey = new Uint8Array(transaction.sender);
console.log('\n4. Sender pubkey:', bytesToHex(senderPubkey));

// 5. Extract signature
const signatureArray = cert.envelope.signature.Signature;
const signature = new Uint8Array(signatureArray);
console.log('\n5. Signature:', bytesToHex(signature));

// 6. Verify
console.log('\n6. Verifying...');
const valid = verifyEd25519(senderPubkey, signingMessage, signature);
console.log('   Result:', valid ? '✅ VALID' : '❌ INVALID');
