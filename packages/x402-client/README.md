# x402-client

Client SDK for the [x402 HTTP payment protocol](https://github.com/fastxyz/x402-sdk).

Pay for 402-protected content with Fast or EVM wallets.

## Dependencies

```json
{
  "@fastxyz/sdk": "^0.1.8",
  "@fastxyz/allset-sdk": "^0.1.3",
  "viem": "^2.46.2"
}
```

## Install

```bash
npm install @fastxyz/x402-client @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

```typescript
import { x402Pay } from '@fastxyz/x402-client';
import { FastWallet, FastProvider } from '@fastxyz/sdk';
import { createEvmWallet } from '@fastxyz/allset-sdk/node';

// Create wallets using SDKs
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// EVM payment
const result = await x402Pay({
  url: 'https://api.example.com/premium-data',
  wallet: evmWallet,
});

// Fast payment
const result = await x402Pay({
  url: 'https://api.example.com/fast-data',
  wallet: fastWallet,
});

if (result.success) {
  console.log('Payment:', result.payment);
  console.log('Data:', result.body);
}
```

## Supported Networks

### Fast
- `fast-testnet` - Fast testnet
- `fast-mainnet` - Fast mainnet

### EVM (EIP-3009)
- `arbitrum-sepolia` - Arbitrum testnet
- `arbitrum` - Arbitrum mainnet
- `ethereum-sepolia` - Ethereum testnet
- `ethereum` - Ethereum mainnet

## API

### `x402Pay(params)`

Make a request to an x402-protected endpoint, automatically handling payment.

```typescript
interface X402PayParams {
  url: string;                           // URL of protected resource
  method?: string;                       // HTTP method (default: GET)
  headers?: Record<string, string>;      // Custom headers
  body?: string;                         // Request body
  wallet: Wallet | Wallet[];             // Wallet(s) to use
  verbose?: boolean;                     // Enable debug logging
}

interface X402PayResult {
  success: boolean;                      // Request succeeded
  statusCode: number;                    // HTTP status
  headers: Record<string, string>;       // Response headers
  body: unknown;                         // Response body
  payment?: PaymentDetails;              // Payment info (if paid)
  note: string;                          // Human-readable note
  logs?: string[];                       // Debug logs (if verbose)
}
```

## Wallet Types

Wallets must be created using the respective SDKs:

### FastWallet (from @fastxyz/sdk)

```typescript
import { FastWallet, FastProvider } from '@fastxyz/sdk';

const provider = new FastProvider({ network: 'testnet' });

// From keyfile
const wallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// From private key
const wallet = await FastWallet.fromPrivateKey('your-hex-private-key', provider);

// Generate new wallet
const wallet = await FastWallet.generate(provider);
```

### EvmWallet (from @fastxyz/allset-sdk/node)

```typescript
import { createEvmWallet } from '@fastxyz/allset-sdk/node';

// From keyfile
const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// From private key
const wallet = createEvmWallet('0x...');

// Generate new wallet
const wallet = createEvmWallet();
```

## How It Works

1. **Initial Request**: Client makes request to protected URL
2. **402 Response**: Server returns `402 Payment Required` with accepted payment methods
3. **Payment**: Client creates and signs payment based on server requirements:

   **Case A: Fast Payment**
   - Client sends a `TokenTransfer` transaction to the server's Fast account
   - Transaction is submitted on-chain and a certificate is returned
   - Client includes the transaction certificate in the `X-PAYMENT` header

   **Case B: EVM Payment (Arbitrum, Ethereum)**
   - Client checks if their EVM wallet has sufficient USDC balance
   - **If sufficient**: Client signs an EIP-3009 `transferWithAuthorization`
   - **If insufficient**: Client auto-bridges fastUSDC → USDC via AllSet, then signs

4. **Retry**: Client retries the original request with the `X-PAYMENT` header
5. **Content**: Server verifies payment (via facilitator) and returns the protected content

## Auto-Bridge

When you provide both Fast and EVM wallets, the SDK enables **auto-bridge**: if an EVM payment is required but your EVM wallet lacks sufficient USDC, the SDK will automatically bridge fastUSDC from your Fast account via AllSet.

```typescript
// Provide both wallets for auto-bridge support
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: [evmWallet, fastWallet],
});

// Check if bridging occurred
if (result.payment?.bridged) {
  console.log('Auto-bridged via:', result.payment.bridgeTxHash);
}
```

## Verbose Logging

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: myWallet,
  verbose: true,
});

// Print debug logs
result.logs?.forEach(log => console.log(log));
```

## Manual Payment Flow

```typescript
import { parse402Response, buildPaymentHeader } from '@fastxyz/x402-client';

// Get requirements
const res = await fetch('https://api.example.com/data');
if (res.status === 402) {
  const requirements = await parse402Response(res);
  console.log('Payment required:', requirements);
  
  // Build payment manually...
  const payment = { /* your signed payment */ };
  const header = buildPaymentHeader(payment);
  
  // Retry with payment
  const paidRes = await fetch('https://api.example.com/data', {
    headers: { 'X-PAYMENT': header },
  });
}
```

## Documentation

For detailed technical specifications and advanced usage, see [skills/client-skill.md](../../skills/client-skill.md).

## License

MIT
