export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const unauthorized = (message = 'sign in first') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'not allowed') => new HttpError(403, 'forbidden', message);
export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
