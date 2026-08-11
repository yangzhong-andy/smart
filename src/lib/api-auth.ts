import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as jwt from "jsonwebtoken";
import { authOptions } from "@/lib/auth-options";
import { AUTH_COOKIE_NAMES } from "@/lib/auth-cookies";
import { AUTH_SECRET } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
};

type ApiAuthFailure = { user: null; response: NextResponse };
type ApiAuthSuccess = { user: ApiUser; response: null };
export type ApiAuthResult = ApiAuthFailure | ApiAuthSuccess;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "权限不足" }, { status: 403 });
}

function toApiUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
  department: { name: string; code: string | null } | null;
}): ApiUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    departmentCode: user.department?.code ?? null,
  };
}

async function findActiveUser(userId: string): Promise<ApiUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true },
  });

  if (!user || !user.isActive) return null;
  return toApiUser(user);
}

function getBearerToken(request: NextRequest): string | null {
  const value = request.headers.get("authorization");
  if (!value || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

async function userFromJwt(token: string): Promise<ApiUser | null> {
  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as {
      userId?: unknown;
      id?: unknown;
    };
    const userId =
      typeof decoded.userId === "string"
        ? decoded.userId
        : typeof decoded.id === "string"
          ? decoded.id
          : null;
    return userId ? await findActiveUser(userId) : null;
  } catch {
    return null;
  }
}

/** Resolve an authenticated, active database user for an API request. */
export async function getApiUser(request: NextRequest): Promise<ApiUser | null> {
  try {
    const bearer = getBearerToken(request);
    if (bearer) return await userFromJwt(bearer);

    const cookieToken = request.cookies.get(AUTH_COOKIE_NAMES.customToken)?.value;
    if (cookieToken) {
      const user = await userFromJwt(cookieToken);
      if (user) return user;
    }

    const session = await getServerSession(authOptions);
    const sessionUserId = session?.user?.id;
    return sessionUserId ? await findActiveUser(sessionUserId) : null;
  } catch (error) {
    console.error("[api-auth] authentication failed:", error);
    return null;
  }
}

export async function requireApiUser(
  request: NextRequest,
  options?: { roles?: string[] },
): Promise<ApiAuthResult> {
  const user = await getApiUser(request);
  if (!user) return { user: null, response: unauthorized() };

  if (options?.roles && !options.roles.includes(user.role)) {
    return { user: null, response: forbidden() };
  }

  return { user, response: null };
}
