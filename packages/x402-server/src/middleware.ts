/**
 * x402-server Express middleware
 * Framework-agnostic middleware for x402 payment verification
 */

import type {
  FacilitatorConfig,
  RouteConfig,
  RoutesConfig,
  PaymentRequirement,
  PayToConfig,
  MiddlewareOptions,
} from "./types.js";
import {
  createPaymentRequired,
  createPaymentRequirement,
  verifyPayment,
  settlePayment,
  encodePaymentResponse,
} from "./payment.js";
import { assertSupportedPaymentNetwork, normalizeEvmNetwork } from "./utils.js";

// Express types (minimal to avoid hard dependency)
interface Request {
  method: string;
  path: string;
  header(name: string): string | undefined;
}

interface Response {
  status(code: number): Response;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void | Promise<void>;

/**
 * Logger function - logs to console by default, can be overridden
 */
function log(message: string, options?: MiddlewareOptions): void {
  if (options?.debug === false) return;
  console.log(`[x402-server] ${message}`);
}

/**
 * Match a route pattern to a request
 * Patterns: "GET /path", "/path/*", "/path/:param"
 */
function matchRoute(pattern: string, method: string, path: string): boolean {
  const parts = pattern.split(" ");
  let routeMethod = "*";
  let routePath = pattern;
  
  if (parts.length === 2) {
    routeMethod = parts[0].toUpperCase();
    routePath = parts[1];
  }
  
  // Check method
  if (routeMethod !== "*" && routeMethod !== method.toUpperCase()) {
    return false;
  }
  
  // Convert route pattern to regex
  const regexPattern = routePath
    .replace(/\*/g, ".*")
    .replace(/:[\w]+/g, "[^/]+");
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Find matching route config for a request
 */
function findRouteConfig(
  routes: RoutesConfig,
  method: string,
  path: string
): RouteConfig | null {
  for (const [pattern, config] of Object.entries(routes)) {
    if (matchRoute(pattern, method, path)) {
      return config;
    }
  }
  return null;
}

/**
 * Check if network is Fast
 * Fast payments are already on-chain, so no settlement needed
 */
function isFastNetwork(network: string): boolean {
  return network.startsWith("fast-");
}

/**
 * Check if network is EVM-based
 */
function isEvmNetwork(network: string): boolean {
  const normalizedNetwork = normalizeEvmNetwork(network);
  const evmNetworks = [
    "ethereum", "arbitrum", "arbitrum-sepolia", 
    "base", "base-sepolia", "optimism", "polygon"
  ];
  return evmNetworks.includes(normalizedNetwork) || normalizedNetwork.endsWith("-sepolia");
}

/**
 * Resolve payment address based on network type
 */
function resolvePayTo(payTo: PayToConfig, network: string): string {
  assertSupportedPaymentNetwork(network);

  // If string, use as-is
  if (typeof payTo === "string") {
    return payTo;
  }
  
  // Multi-address config
  if (isFastNetwork(network)) {
    if (!payTo.fast) {
      throw new Error(
        `Fast payment address not configured. ` +
        `Add 'fast' to payTo config for network: ${network}`
      );
    }
    return payTo.fast;
  }
  
  if (isEvmNetwork(network)) {
    if (!payTo.evm) {
      throw new Error(
        `EVM payment address not configured. ` +
        `Add 'evm' to payTo config for network: ${network}`
      );
    }
    return payTo.evm;
  }
  
  throw new Error(`Unknown network type: ${network}`);
}

/**
 * Create x402 payment middleware for Express
 * 
 * Payment flow differs by network type:
 * - Fast: Verify → Serve content (payment already on-chain)
 * - EVM: Verify → Settle → Serve content (payment must be submitted on-chain)
 * 
 * @param payTo - Address(es) to receive payments. Can be:
 *   - Single address string (must match network type)
 *   - Object with `evm` and/or `fast` addresses
 * @param routes - Route configuration map
 * @param facilitator - Facilitator configuration
 * 
 * @example
 * ```typescript
 * // Single address (EVM only)
 * app.use(paymentMiddleware(
 *   "0x1234...",
 *   { "GET /api/data": { price: "$0.10", network: "arbitrum-sepolia" } },
 *   { url: "http://localhost:4020" }
 * ));
 * 
 * // Multiple addresses (EVM + Fast)
 * app.use(paymentMiddleware(
 *   {
 *     evm: "0x1234...",
 *     fast: "fast1abc...",
 *   },
 *   {
 *     "GET /api/evm-data": { price: "$0.10", network: "arbitrum-sepolia" },
 *     "GET /api/fast-data": { price: "$0.01", network: "fast-testnet" },
 *   },
 *   { url: "http://localhost:4020" }
 * ));
 * ```
 */
export function paymentMiddleware(
  payTo: PayToConfig,
  routes: RoutesConfig,
  facilitator: FacilitatorConfig,
  options?: MiddlewareOptions
) {
  const opts = { debug: true, ...options };
  
  return async function x402Middleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Find matching route
    const routeConfig = findRouteConfig(routes, req.method, req.path);
    
    // No matching protected route - pass through
    if (!routeConfig) {
      return next();
    }
    
    log(`→ ${req.method} ${req.path} (${routeConfig.network}, ${routeConfig.price})`, opts);
    
    // Check for X-PAYMENT header
    const paymentHeader = req.header("X-PAYMENT");
    
    // Resolve payment address for this network
    let resolvedPayTo: string;
    try {
      resolvedPayTo = resolvePayTo(payTo, routeConfig.network);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`✗ Address resolution error: ${errorMessage}`, opts);
      res.status(500);
      return res.json({ error: errorMessage });
    }
    
    if (!paymentHeader) {
      // Return 402 Payment Required
      log(`← 402 Payment Required (no X-PAYMENT header)`, opts);
      try {
        const paymentRequired = createPaymentRequired(
          resolvedPayTo,
          routeConfig,
          req.path
        );
        res.status(402);
        return res.json(paymentRequired);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`✗ Error creating payment requirement: ${errorMessage}`, opts);
        res.status(500);
        return res.json({ error: errorMessage });
      }
    }
    
    log(`  X-PAYMENT header present (${paymentHeader.length} chars)`, opts);
    
    // Create payment requirement for verification
    const paymentRequirement = createPaymentRequirement(
      resolvedPayTo,
      routeConfig,
      req.path
    );
    
    const isFast = isFastNetwork(routeConfig.network);
    
    try {
      // Step 1: Verify payment with facilitator
      log(`  → Verifying payment with facilitator...`, opts);
      const verifyResult = await verifyPayment(
        paymentHeader,
        paymentRequirement,
        facilitator
      );
      
      if (!verifyResult.isValid) {
        log(`  ✗ Verification failed: ${verifyResult.invalidReason}`, opts);
        res.status(402);
        return res.json({
          error: verifyResult.invalidReason || "Payment verification failed",
          accepts: [paymentRequirement],
          payer: verifyResult.payer,
        });
      }
      
      log(`  ✓ Payment verified (payer: ${verifyResult.payer?.slice(0, 20)}...)`, opts);
      
      // Step 2: For Fast, payment is already on-chain - serve content immediately
      if (isFast) {
        log(`← 200 OK (Fast payment - no settlement needed)`, opts);
        // Set response header with verification info
        res.setHeader(
          "X-PAYMENT-RESPONSE",
          encodePaymentResponse({
            success: true,
            network: verifyResult.network,
            payer: verifyResult.payer,
          })
        );
        
        // Serve content
        return next();
      }
      
      // Step 3: For EVM, must settle before serving content
      log(`  → Settling EVM payment...`, opts);
      const settleResult = await settlePayment(
        paymentHeader,
        paymentRequirement,
        facilitator
      );
      
      if (!settleResult.success) {
        log(`  ✗ Settlement failed: ${settleResult.errorReason}`, opts);
        res.status(402);
        return res.json({
          error: settleResult.errorReason || "Payment settlement failed",
          accepts: [paymentRequirement],
          payer: verifyResult.payer,
        });
      }
      
      log(`  ✓ Payment settled (tx: ${settleResult.txHash?.slice(0, 20)}...)`, opts);
      log(`← 200 OK`, opts);
      
      // Set response header with settlement info
      res.setHeader(
        "X-PAYMENT-RESPONSE",
        encodePaymentResponse({
          success: true,
          txHash: settleResult.txHash,
          network: settleResult.network || verifyResult.network,
          payer: settleResult.payer || verifyResult.payer,
        })
      );
      
      // Payment successful - serve content
      return next();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`✗ Payment error: ${errorMessage}`, opts);
      res.status(500);
      return res.json({
        error: `Payment processing error: ${errorMessage}`,
      });
    }
  };
}

/**
 * Simple middleware that returns 402 for all requests without X-PAYMENT
 * Useful for single-endpoint protection
 */
export function paywall(
  payTo: PayToConfig,
  config: RouteConfig,
  facilitator: FacilitatorConfig,
  options?: MiddlewareOptions
) {
  return paymentMiddleware(
    payTo,
    { "*": config },
    facilitator,
    options
  );
}

export type { Request, Response, NextFunction };
