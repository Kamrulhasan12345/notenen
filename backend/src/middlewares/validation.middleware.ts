import type { Request, Response, NextFunction } from "express";
import { ZodObject, ZodError } from "zod";

/**
 * Validates the request against a Zod schema.
 * Supports validating Body, Query, and Params.
 */
export const validate = (schema: ZodObject<any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // parseAsync ensures we catch both sync and async validation errors
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Return a nice format for the frontend (e.g. React Native RHF)
        return res.status(400).json({
          error: "ValidationError",
          details: error.issues.map((e) => ({
            field: e.path[1], // [0] is 'body'/'query', [1] is the field name
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ error: "Invalid Request" });
    }
  };