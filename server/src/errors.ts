import type { ApiError } from "@qt/core";

export type ErrorCode = ApiError["error"]["code"];

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, "bad_request", msg);
export const notFound = (msg: string) => new HttpError(404, "not_found", msg);
export const providerError = (msg: string) => new HttpError(502, "provider_error", msg);
