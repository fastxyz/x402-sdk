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
  verifyAndSettle,
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

type NextFunction = () => void;

/**
 * Options for payment middleware
 */
export interface PaymentMiddlewareOptions {
  /** 
   * Timing strategy for EVM payments:
   * - "verify-first": Verify → Deliver → Settle (faster, but risky)
   * - "settle-first": Verify → Settle → Deliver (safer, default)
   */
  evmStrategy?: "verify-first" | "settle-first";
  
  /**
   * Timing strategy for FastSet payments:
   * - "verify-only": Verify only (tx already on-chain) - default for FastSet
   * - "settle-first": Also call settle endpoint
   */
  fastsetStrategy?: "verify-only" | "settle-first";
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
 * Check if network is FastSet
 */
function isFastSetNetwork(network: string): boolean {
  return network.startsWith("fastset-") || network === "fast";
}

/**
 * Create x402 payment middleware for Express
 * 
 * @param payTo - Address to receive payments
 * @param routes - Route configuration map
 * @param facilitator - Facilitator configuration
 * @param options - Middleware options
 */
export function paymentMiddleware(
  payTo: string,
  routes: RoutesConfig,
  facilitator: FacilitatorConfig,
  options: PaymentMiddlewareOptions = {}
) {
  const {
    evmStrategy = "settle-first",
    fastsetStrategy = "verify-only",
  } = options;
  
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
    
    try {
      const isFastSet = isFastSetNetwork(routeConfig.network);
      
      // Verify and settle payment
      const paymentResponse = await verifyAndSettle(
        paymentHeader,
        paymentRequirement,
        facilitator
      );
      
      // Set response header
      res.setHeader(
        "X-PAYMENT-RESPONSE",
        encodePaymentResponse(paymentResponse)
      );
      
      if (!paymentResponse.success) {
        res.status(402);
        return res.json({
          error: paymentResponse.errorMessage || "Payment failed",
          accepts: [paymentRequirement],
        });
      }
      
      // Payment successful - proceed to handler
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
