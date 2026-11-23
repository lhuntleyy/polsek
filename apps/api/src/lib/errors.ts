export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = "Sesi tidak valid"): AppError {
  return new AppError(401, "unauthorized", message);
}

export function forbidden(message = "Akses ditolak"): AppError {
  return new AppError(403, "forbidden", message);
}

export function notFound(message = "Data tidak ditemukan"): AppError {
  return new AppError(404, "not_found", message);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "bad_request", message, details);
}

export function conflict(message: string): AppError {
  return new AppError(409, "conflict", message);
}
