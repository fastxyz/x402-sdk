/**
 * x402-server
 * Server SDK for x402 payment protocol
 * 
 * Create 402 Payment Required responses, verify payments, and protect routes.
 * 
 * @example
 * ```typescript
 * import { paymentMiddleware } from "x402-server";
 * 
 * app.use(paymentMiddleware(
 *   "0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372",
 *   {
 *     "GET /api/premium": {
 *       price: "$0.10",
 *       network: "arbitrum-sepolia",
 *     },
 *   },
 *   { url: "http://localhost:3002" }
 * ));
 * ```
 */

// Types
export type {
  RouteConfig,
  PaymentRequirement,
  PaymentRequiredResponse,
  FacilitatorConfig,
  VerifyResponse,
  SettleResponse,
  PaymentResponse,
  NetworkConfig,
  RoutesConfig,
  XPaymentPayload,
  PayToConfig,
} from "./types.js";

// Utils
export {
  NETWORK_CONFIGS,
  parsePrice,
  getNetworkConfig,
  encodePayload,
  decodePayload,
} from "./utils.js";

// Core payment functions
export {
  createPaymentRequirement,
  createPaymentRequired,
  parsePaymentHeader,
  verifyPayment,
  settlePayment,
  encodePaymentResponse,
  verifyAndSettle,
} from "./payment.js";

// Middleware
export {
  paymentMiddleware,
  paywall,
  type Request,
  type Response,
  type NextFunction,
} from "./middleware.js";
