# x402-client

Client SDK for the [x402 HTTP payment protocol](https://github.com/fastxyz/x402-sdk) — pay for 402-protected content with crypto.

## Install

```bash
npm install @fastxyz/x402-client
```

---

## Quick Start

```typescript
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'evm',
    privateKey: process.env.EVM_KEY as `0x${string}`,
    address: '0x...',
  },
});

if (result.success) {
  console.log('Content:', result.body);
}
```

---

## Wallet Types

### EVM Wallet (Ethereum Sepolia, Arbitrum, Base)

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: {
    type: 'evm',
    privateKey: '0x...',  // 32-byte hex WITH 0x prefix
    address: '0x...',
  },
});
```

### Fast Wallet

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: {
    type: 'fast',
    privateKey: '...',     // 32-byte hex WITHOUT 0x prefix
    publicKey: '...',      // 32-byte hex
    address: 'fast1...',   // bech32m address
  },
});
```

### Auto-Bridge (Fast → EVM)

Provide both wallets to automatically bridge from Fast to EVM USDC when EVM balance is insufficient:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: [
    { type: 'fast', privateKey: '...', publicKey: '...', address: 'fast1...' },
    { type: 'evm', privateKey: '0x...', address: '0x...' },
  ],
  verbose: true,
});

// Check if bridging occurred
if (result.payment?.bridged) {
  console.log('Bridged via:', result.payment.bridgeTxHash);
}
```

---

## API

### x402Pay(params)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `string` | ✅ | URL of protected resource |
| `wallet` | `Wallet \| Wallet[]` | ✅ | Wallet(s) to use |
| `method` | `string` | | HTTP method (default: `'GET'`) |
| `headers` | `Record<string, string>` | | Custom headers |
| `body` | `string` | | Request body |
| `verbose` | `boolean` | | Enable debug logging |

### Return Value

```typescript
interface X402PayResult {
  success: boolean;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  payment?: {
    network: string;
    amount: string;
    txHash?: string;
    bridged?: boolean;
    bridgeTxHash?: string;
  };
  note: string;
  logs?: string[];  // If verbose: true
}
```

---

## Payment Flows

### EVM Payment Flow

1. Fetch URL → receive 402 with payment requirements
2. Sign EIP-3009 `transferWithAuthorization`
3. Send request with `X-PAYMENT` header
4. Facilitator verifies and settles on-chain
5. Server returns content

### Fast Payment Flow

1. Fetch URL → receive 402 with payment requirements
2. Submit TokenTransfer to Fast network (instant!)
3. Send request with transaction certificate
4. Server verifies certificate
5. Server returns content

### Auto-Bridge Flow

1. Detect EVM payment required
2. Check EVM USDC balance → insufficient
3. Bridge Fast → EVM USDC via AllSet (~3-4s)
4. Continue with EVM payment flow

---

## Supported Networks

### Mainnet

| Network | Type | Token |
|---------|------|-------|
| `fast-mainnet` | Fast | USDC |
| `arbitrum` | EVM | USDC |
| `base` | EVM | USDC |

### Testnet

| Network | Type | Token |
|---------|------|-------|
| `fast-testnet` | Fast | testUSDC |
| `ethereum-sepolia` | EVM | USDC |
| `arbitrum-sepolia` | EVM | USDC |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `INSUFFICIENT_BALANCE` | Not enough USDC | Fund wallet or use auto-bridge |
| `INVALID_SIGNATURE` | Key/address mismatch | Verify wallet config |
| `BRIDGE_TIMEOUT` | Bridge took too long | Check Fast balance, retry |
| `NETWORK_NOT_SUPPORTED` | Unknown network | Check endpoint configuration |

### Debug Mode

```typescript
const result = await x402Pay({
  url: '...',
  wallet: myWallet,
  verbose: true,
});

result.logs?.forEach(log => console.log(log));
```

---

## License

MIT
