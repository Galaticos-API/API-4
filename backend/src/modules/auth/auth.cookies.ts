import { Request } from "express";

import { SESSION_COOKIE_NAME } from "./auth.constants.js";

export function getSessionToken(
  req: Request,
): string | null {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");

    if (rawName === SESSION_COOKIE_NAME) {
      const value = rawValue.join("=");

      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}