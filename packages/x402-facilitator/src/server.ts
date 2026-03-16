/**
 * Facilitator HTTP server
 * 
 * Express middleware for x402 facilitator endpoints.
 */

import type { Request, Response, NextFunction } from "express";
import type {
  FacilitatorConfig,
  PaymentPayload,
  SupportedPaymentKind,
} from "./types.js";
import { verifyWithChainMaps } from "./verify.js";
import { settleWithChainMaps } from "./settle.js";
import {
  loadChainMaps,
  getEvmChainConfigFromMaps,
  getSupportedEvmNetworksFromMaps,
  getSupportedFastNetworksFromMaps,
} from "./chains.js";

/**
 * Create facilitator Express routes
 * 
 * Endpoints:
 * - POST /verify - Verify a payment signature/certificate
 * - POST /settle - Settle a payment on-chain (EVM only)
 * - GET /supported - List supported payment kinds
 * 
 * @param config - Facilitator configuration
 * @returns Express router with facilitator endpoints
 */
export function createFacilitatorRoutes(config: FacilitatorConfig = {}) {
  const chainMaps = loadChainMaps(config.configPath);

  const routes: Array<{
    method: "get" | "post";
    path: string;
    handler: (req: Request, res: Response) => Promise<void>;
  }> = [];

  // POST /verify
  routes.push({
    method: "post",
    path: "/verify",
    handler: async (req: Request, res: Response) => {
      try {
        const { paymentPayload, paymentRequirements } = req.body;

        if (!paymentPayload || !paymentRequirements) {
          res.status(400).json({
            isValid: false,
            invalidReason: "missing_parameters",
          });
          return;
        }

        // Decode payload if it's a base64 string
        let decoded: PaymentPayload;
        if (typeof paymentPayload === "string") {
          try {
            decoded = JSON.parse(Buffer.from(paymentPayload, "base64").toString());
          } catch {
            res.status(400).json({
              isValid: false,
              invalidReason: "invalid_payload_encoding",
            });
            return;
          }
        } else {
          decoded = paymentPayload;
        }

        const result = await verifyWithChainMaps(decoded, paymentRequirements, chainMaps);
        res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
          isValid: false,
          invalidReason: `verification_error: ${message}`,
        });
      }
    },
  });

  // POST /settle
  routes.push({
    method: "post",
    path: "/settle",
    handler: async (req: Request, res: Response) => {
      try {
        const { paymentPayload, paymentRequirements } = req.body;

        if (!paymentPayload || !paymentRequirements) {
          res.status(400).json({
            success: false,
            errorReason: "missing_parameters",
          });
          return;
        }

        // Decode payload if it's a base64 string
        let decoded: PaymentPayload;
        if (typeof paymentPayload === "string") {
          try {
            decoded = JSON.parse(Buffer.from(paymentPayload, "base64").toString());
          } catch {
            res.status(400).json({
              success: false,
              errorReason: "invalid_payload_encoding",
            });
            return;
          }
        } else {
          decoded = paymentPayload;
        }

        const result = await settleWithChainMaps(decoded, paymentRequirements, config, chainMaps);
        res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
          success: false,
          errorReason: `settlement_error: ${message}`,
        });
      }
    },
  });

  // GET /supported
  routes.push({
    method: "get",
    path: "/supported",
    handler: async (req: Request, res: Response) => {
      const paymentKinds: SupportedPaymentKind[] = [];

      // Add EVM networks
      for (const network of getSupportedEvmNetworksFromMaps(chainMaps)) {
        const chainConfig = getEvmChainConfigFromMaps(chainMaps, network);
        if (!chainConfig) continue;
        paymentKinds.push({
          x402Version: 1,
          scheme: "exact",
          network,
          extra: {
            asset: chainConfig.usdcAddress,
            name: chainConfig.usdcName || "USD Coin",
            version: chainConfig.usdcVersion || "2",
          },
        });
      }

      // Add Fast networks
      for (const network of getSupportedFastNetworksFromMaps(chainMaps)) {
        paymentKinds.push({
          x402Version: 1,
          scheme: "exact",
          network,
        });
      }

      res.json({ paymentKinds });
    },
  });

  return routes;
}

/**
 * Create facilitator Express middleware
 * 
 * @param config - Facilitator configuration
 * @returns Express middleware that handles /verify, /settle, /supported
 */
export function createFacilitatorServer(config: FacilitatorConfig = {}) {
  const routes = createFacilitatorRoutes(config);

  return async function facilitatorMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    for (const route of routes) {
      if (req.method.toLowerCase() === route.method && req.path === route.path) {
        return route.handler(req, res);
      }
    }
    next();
  };
}
