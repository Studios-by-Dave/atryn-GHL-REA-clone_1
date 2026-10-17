export class AuthenticationRequiredError extends Error {
  readonly code = "UNAUTHENTICATED";
  readonly status = 401;

  constructor() {
    super("Sign in is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class InvitationError extends Error {
  readonly code = "INVALID_INVITATION";
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InvitationError";
  }
}
