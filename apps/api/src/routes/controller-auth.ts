import type { FastifyInstance, FastifyReply } from "fastify";
import {
  loginControllerUser,
  logoutControllerUser,
  registerControllerUser,
  restoreControllerAuth,
  serializeControllerAuthClearCookie,
  serializeControllerAuthCookie,
  updateControllerProfile
} from "../modules/controller/controller-auth-service.js";
import type { ControllerAuthRepository } from "../modules/controller/repositories/controller-auth-repository.js";

export interface ControllerAuthRouteDependencies {
  controllerAuth: ControllerAuthRepository;
  /** 改昵称后把队列里显示的点歌人也换掉；电视端读的是队列快照 */
  queueEntries?: {
    renameRequester?(input: { phone: string; displayName: string }): Promise<number>;
  };
}

interface RegisterBody {
  phone?: string;
  password?: string;
  displayName?: string;
}

interface LoginBody {
  phone?: string;
  password?: string;
}

interface ProfileBody {
  displayName?: string;
}

export async function registerControllerAuthRoutes(server: FastifyInstance, dependencies: ControllerAuthRouteDependencies): Promise<void> {
  server.post<{ Body: RegisterBody }>("/controller/auth/register", async (request, reply) => {
    try {
      const result = await registerControllerUser({
        phone: request.body.phone,
        password: request.body.password,
        displayName: request.body.displayName,
        repository: dependencies.controllerAuth
      });
      reply.header("Set-Cookie", serializeControllerAuthCookie(result.token));
      await reply.send({ user: publicUser(result.user) });
    } catch (error) {
      await sendAuthError(reply, error);
    }
  });

  server.post<{ Body: LoginBody }>("/controller/auth/login", async (request, reply) => {
    try {
      const result = await loginControllerUser({
        phone: request.body.phone,
        password: request.body.password,
        repository: dependencies.controllerAuth
      });
      reply.header("Set-Cookie", serializeControllerAuthCookie(result.token));
      await reply.send({ user: publicUser(result.user) });
    } catch (error) {
      await sendAuthError(reply, error);
    }
  });

  server.get("/controller/auth/me", async (request, reply) => {
    const user = await restoreControllerAuth({
      cookieHeader: request.headers.cookie,
      repository: dependencies.controllerAuth
    });
    if (!user) {
      await reply.code(401).send({ code: "AUTH_REQUIRED" });
      return;
    }
    await reply.send({ user: publicUser(user) });
  });

  server.post("/controller/auth/logout", async (request, reply) => {
    await logoutControllerUser({
      cookieHeader: request.headers.cookie,
      repository: dependencies.controllerAuth
    });
    reply.header("Set-Cookie", serializeControllerAuthClearCookie());
    await reply.code(204).send();
  });

  server.patch<{ Body: ProfileBody }>("/controller/auth/profile", async (request, reply) => {
    try {
      const user = await updateControllerProfile({
        cookieHeader: request.headers.cookie,
        displayName: request.body.displayName,
        repository: dependencies.controllerAuth
      });
      if (!user) {
        await reply.code(401).send({ code: "AUTH_REQUIRED" });
        return;
      }
      try {
        await dependencies.queueEntries?.renameRequester?.({
          phone: user.phone,
          displayName: user.displayName
        });
      } catch (error) {
        request.log.warn({ err: error }, "failed to sync requester display name");
      }
      await reply.send({ user: publicUser(user) });
    } catch (error) {
      await sendAuthError(reply, error);
    }
  });
}

function publicUser(user: { phone: string; displayName: string }) {
  return { phone: user.phone, displayName: user.displayName };
}

async function sendAuthError(reply: FastifyReply, error: unknown): Promise<void> {
  const code = error instanceof Error ? error.message : "AUTH_ERROR";
  if (code === "USER_ALREADY_EXISTS") {
    await reply.code(409).send({ code });
    return;
  }
  if (code === "INVALID_CREDENTIALS") {
    await reply.code(401).send({ code });
    return;
  }
  if (code === "INVALID_PHONE" || code === "INVALID_PASSWORD" || code === "INVALID_DISPLAY_NAME") {
    await reply.code(400).send({ code });
    return;
  }
  throw error;
}
