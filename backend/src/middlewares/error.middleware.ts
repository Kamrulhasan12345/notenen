import type { NextFunction, Request, Response } from "express";
import { isHttpError } from "http-errors";
import { ZodError } from "zod";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  // 1. Handle Explicit Errors
  if (isHttpError(err)) {
    return res.status(err.status).json({
      error: err.name,
      message: err.message
    });
  }

  // 2. Handle Lazy Database Errors (MongoDB)
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue)[0]!;
    const capitalizedField = field.charAt(0).toUpperCase() + field.slice(1);
    return res.status(409).json({
      error: "Conflict",
      message: `${capitalizedField} already exists`
    });
  }

  // 3. Handle Validation (Zod)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "ValidationError",
      message: "Invalid input data",
      details: err.issues.map(i => ({ field: i.path[1], message: i.message }))
    })
  }

  // 4. Handle JWT Errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Session invalid"
    });
  }
  // 5. Catch-all
  return res.status(500).json({
    error: "InternalServerError",
    message: "Something went wrong."
  })
}