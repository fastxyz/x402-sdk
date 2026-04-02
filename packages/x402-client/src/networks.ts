/**
 * Shared network identifiers used by x402-client.
 */

const EVM_NETWORK_ALIASES: Record<string, string> = {
  "eip155:11155111": "ethereum-sepolia",
  "eip155:42161": "arbitrum",
  "eip155:421614": "arbitrum-sepolia",
  "eip155:8453": "base",
  "eip155:84532": "base-sepolia",
};

export const CANONICAL_EVM_NETWORKS = [
  "ethereum-sepolia",
  "arbitrum-sepolia",
  "arbitrum",
  "base-sepolia",
  "base",
] as const;

export type CanonicalEvmNetwork = (typeof CANONICAL_EVM_NETWORKS)[number];

export function normalizeEvmNetwork(network: string): CanonicalEvmNetwork | null {
  const normalized = EVM_NETWORK_ALIASES[network] ?? network;
  return CANONICAL_EVM_NETWORKS.includes(normalized as CanonicalEvmNetwork)
    ? (normalized as CanonicalEvmNetwork)
    : null;
}
