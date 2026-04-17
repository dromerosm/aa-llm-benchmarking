export class ApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.extra = extra;
  }
}
