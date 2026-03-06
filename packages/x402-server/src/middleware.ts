/**
 * x402-server Express middleware
 * Framework-agnostic middleware for x402 payment verification
 */

import type {
  FacilitatorConfig,
  RouteConfig,
  RoutesConfig,
  PaymentRequirement,
} from "./types.js";
import {
  createPaymentRequired,
  createPaymentRequirement,
  verifyPayment,
  settlePayment,
  encodePaymentResponse,
} from "./payment.js";

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
 * Check if network is FastSet
 * FastSet payments are already on-chain, so no settlement needed
 */
function isFastSetNetwork(network: string): boolean {
  return network.startsWith("fastset-") || network === "fast";
}

/**
 * Create x402 payment middleware for Express
 * 
 * Payment flow differs by network type:
 * - FastSet: Verify → Serve content (payment already on-chain)
 * - EVM: Verify → Settle → Serve content (payment must be submitted on-chain)
 * 
 * @param payTo - Address to receive payments
 * @param routes - Route configuration map
 * @param facilitator - Facilitator configuration
 * 
 * @example
 * ```typescript
 * app.use(paymentMiddleware(
 *   "0x1234...",
 *   {
 *     "GET /api/premium/*": { price: "$0.10", network: "arbitrum-sepolia" },
 *     "POST /api/ai/generate": { price: "$0.01", network: "fastset-devnet" },
 *   },
 *   { url: "http://localhost:4020" }
 * ));
 * ```
 */
export function paymentMiddleware(
  payTo: string,
  routes: RoutesConfig,
  facilitator: FacilitatorConfig
) {
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
    
    // Check for X-PAYMENT header
    const paymentHeader = req.header("X-PAYMENT");
    
    if (!paymentHeader) {
      // Return 402 Payment Required
      const paymentRequired = createPaymentRequired(
        payTo,
        routeConfig,
        req.path
      );
      res.status(402);
      return res.json(paymentRequired);
    }
    
    // Create payment requirement for verification
    const paymentRequirement = createPaymentRequirement(
      payTo,
      routeConfig,
      req.path
    );
    
    const isFastSet = isFastSetNetwork(routeConfig.network);
    
    try {
      // Step 1: Verify payment with facilitator
      const verifyResult = await verifyPayment(
        paymentHeader,
        paymentRequirement,
        facilitator
      );
      
      if (!verifyResult.valid) {
        res.status(402);
        return res.json({
          error: verifyResult.invalidReason || "Payment verification failed",
          accepts: [paymentRequirement],
          payer: verifyResult.payer,
        });
      }
      
      // Step 2: For FastSet, payment is already on-chain - serve content immediately
      if (isFastSet) {
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
      const settleResult = await settlePayment(
        paymentHeader,
        paymentRequirement,
        facilitator
      );
      
      if (!settleResult.success) {
        res.status(402);
        return res.json({
          error: settleResult.errorMessage || "Payment settlement failed",
          accepts: [paymentRequirement],
          payer: verifyResult.payer,
        });
      }
      
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
  payTo: string,
  config: RouteConfig,
  facilitator: FacilitatorConfig
) {
  return paymentMiddleware(
    payTo,
    { "*": config },
    facilitator
  );
}

export type { Request, Response, NextFunction };
