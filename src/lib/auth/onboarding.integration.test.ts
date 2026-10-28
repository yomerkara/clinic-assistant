import { POST as showGuide } from "@/app/api/account/guide/route";
import { POST as account } from "@/app/api/account/route";
import { requiresAccountSetup } from "./local-security-deferral";
import {
  afterEach,
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as step } from "@/app/api/onboarding/step/route";
import { POST as verify } from "@/app/api/auth/verify-email/route";
import { POST as complete } from "@/app/api/onboarding/complete/route";
import { sendAuthMail } from "./mail";
import { hashPasswordAsync } from "./password-async";
import { issueSession } from "./session";
const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    prisma: new PrismaClient({
      datasourceUrl:
        process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost/unused",
    }),
  };
});
vi.mock("./mail", () => ({ sendAuthMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/session", async () => {
  const { prisma } = await import("@/lib/prisma");
  return {
    requireUser: () => prisma.user.findUniqueOrThrow({ where: { id: state.userId } }),
    issueSession: vi.fn().mockResolvedValue({
      token: "synthetic-session",
      expiresAt: new Date(Date.now() + 100000),
    }),
    sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
  };
});
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw Error("Separate test database required");
describe.skipIf(!url)("onboarding email, phone and password boundaries", () => {
  const ids: string[] = [];
  afterEach(() => vi.unstubAllEnvs());
  let hash: string;
  const current = "temporary synthetic password 042";
  const request = (body: Record<string, string>) =>
    new Request("http://localhost:3000/api/onboarding/step", {
      method: "POST",
      body: new URLSearchParams(body),
    });
  const location = (r: Response) =>
    decodeURIComponent((r.headers.get("location") ?? "").replaceAll("+", " "));
  beforeAll(async () => {
    hash = await hashPasswordAsync(current);
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(sendAuthMail).mockResolvedValue(undefined);
    const id = crypto.randomUUID();
    const user = await prisma.user.create({
      data: {
        name: "Synthetic setup",
        role: "THERAPIST",
        email: `setup-${id}@example.invalid`,
        username: `temp-${id.slice(0, 8)}`,
        passwordHash: hash,
      },
    });
    state.userId = user.id;
    ids.push(user.id);
  });
  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  it("defers only the local admin email without verifying or mailing; other steps remain mandatory", async () => {
    vi.stubEnv("APP_URL", "https://localhost");
    vi.stubEnv("ALLOW_LOCAL_SETUP_SKIP", "true");
    await prisma.user.update({
      where: { id: state.userId },
      data: { role: "ADMIN", email: "admin@santa.local" },
    });
    for (let i = 0; i < 3; i++)
      await step(request({ intent: "email", email: "local-test@example.invalid" }));
    vi.mocked(sendAuthMail).mockClear();
    await step(request({ intent: "email", email: "admin@santa.local" }));
    expect(sendAuthMail).not.toHaveBeenCalled();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: state.userId } }))
        .emailVerifiedAt,
    ).toBeNull();
    expect(location(await complete(request({ tourViewed: "yes" })))).toContain(
      "securityError",
    );
    await step(request({ intent: "phone", phone: "05321234567" }));
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: state.userId } })).phone,
    ).toBe("+905321234567");
    vi.stubEnv("APP_URL", "https://clinic.example");
    expect(
      location(await step(request({ intent: "phone", phone: "05321234568" }))),
    ).toContain("Önce e-posta");
  });
  it("cannot request the admin exception from a therapist account", async () => {
    vi.stubEnv("APP_URL", "https://localhost");
    vi.stubEnv("ALLOW_LOCAL_SETUP_SKIP", "true");
    expect(
      location(await step(request({ intent: "email", email: "admin@santa.local" }))),
    ).toContain("securityError");
    expect(sendAuthMail).not.toHaveBeenCalled();
    expect(
      await prisma.auditEvent.count({
        where: { actorId: state.userId, action: "account.local_email_deferred" },
      }),
    ).toBe(0);
  });
  it("defers security locally without modifying credentials, resumes it, and ignores deferral in production", async () => {
    vi.stubEnv("APP_URL", "https://localhost");
    vi.stubEnv("ALLOW_LOCAL_SETUP_SKIP", "true");
    expect(location(await step(request({ intent: "security-defer" })))).toContain(
      "securityError",
    );
    await prisma.user.update({
      where: { id: state.userId },
      data: { role: "ADMIN", emailVerifiedAt: new Date(), phone: "+905321234567" },
    });
    await step(request({ intent: "security-defer" }));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
    expect(user).toMatchObject({
      mustChangePassword: true,
      mfaEnabledAt: null,
      passwordHash: hash,
    });
    expect(await requiresAccountSetup(user)).toBe(false);
    expect(location(await complete(request({ tourViewed: "yes" })))).toContain("/queue");
    vi.stubEnv("APP_URL", "https://clinic.example");
    expect(await requiresAccountSetup(user)).toBe(false);
    expect(location(await step(request({ intent: "security-defer" })))).toContain(
      "securityError",
    );
    vi.stubEnv("APP_URL", "https://localhost");
    expect(location(await step(request({ intent: "security-resume" })))).toContain(
      "step=2",
    );
    expect(await requiresAccountSetup(user)).toBe(false);
  });
  it("updates only the current user's profile fields", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
    expect(
      location(
        await account(
          request({
            intent: "profile",
            name: "Yeni Ad Soyad",
            phone: "05321234567",
            role: "ADMIN",
            email: "ignored@example.invalid",
            userId: "other-user",
          }),
        ),
      ),
    ).toContain("profile_saved");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
    expect(after).toMatchObject({
      name: "Yeni Ad Soyad",
      phone: "+905321234567",
      role: before.role,
      email: before.email,
      passwordHash: before.passwordHash,
    });
    expect(
      location(await account(request({ intent: "profile", name: "x", phone: "bad" }))),
    ).toContain("securityError");
  });
  it("requires the current password and preserves the old email until confirmation", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
    const email = `new-${crypto.randomUUID()}@example.invalid`;
    expect(
      location(
        await account(request({ intent: "email", email, currentPassword: "wrong" })),
      ),
    ).toContain("securityError");
    expect(sendAuthMail).not.toHaveBeenCalled();
    expect(
      location(
        await account(request({ intent: "email", email, currentPassword: current })),
      ),
    ).toContain("security=sent");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: state.userId } })).email,
    ).toBe(before.email);
    const link = new URL(
      vi.mocked(sendAuthMail).mock.calls[0][2].match(/https?:\/\/\S+/)![0],
    );
    expect(link.searchParams.get("returnTo")).toBe("account");
    const response = await verify(
      request({ token: link.searchParams.get("token")!, returnTo: "account" }),
    );
    expect(location(response)).toContain(
      "/settings/account?section=email&security=verified",
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: state.userId } })).email,
    ).toBe(email);
  });
  it("updates the password only after reauthentication and invalidates old sessions/tokens", async () => {
    const password = "another valid personal passphrase 042";
    expect(
      location(
        await account(
          request({
            intent: "password",
            currentPassword: "wrong",
            password,
            confirmPassword: password,
          }),
        ),
      ),
    ).toContain("securityError");
    await prisma.session.create({
      data: {
        userId: state.userId,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await prisma.securityToken.create({
      data: {
        userId: state.userId,
        tokenHash: crypto.randomUUID(),
        kind: "reset",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      location(
        await account(
          request({
            intent: "password",
            currentPassword: current,
            password,
            confirmPassword: password,
          }),
        ),
      ),
    ).toContain("password_saved");
    expect(await prisma.session.count({ where: { userId: state.userId } })).toBe(0);
    expect(await prisma.securityToken.count({ where: { userId: state.userId } })).toBe(0);
    expect(issueSession).toHaveBeenCalledWith(state.userId);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: state.userId } })).passwordHash,
    ).not.toBe(hash);
  });
  it("cannot save phone, change password or complete before email verification", async () => {
    expect(
      location(await step(request({ intent: "phone", phone: "05321234567" }))),
    ).toContain("Önce e-posta");
    expect(location(await step(request({ intent: "password" })))).toContain(
      "Önce e-posta",
    );
    await complete(request({ tourViewed: "yes" }));
    expect(await prisma.user.findUnique({ where: { id: state.userId } })).toMatchObject({
      phone: null,
      mustChangePassword: true,
      onboardingCompletedAt: null,
    });
  });
  it("verifies a mailed single-use token before allowing phone and initial password change", async () => {
    const email = `verified-${crypto.randomUUID()}@example.invalid`;
    expect(location(await step(request({ intent: "email", email })))).toContain(
      "security=sent",
    );
    const body = vi.mocked(sendAuthMail).mock.calls[0][2];
    const token = new URL(body.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
    expect(
      (await prisma.securityToken.findFirstOrThrow({ where: { userId: state.userId } }))
        .tokenHash,
    ).not.toBe(token);
    expect(location(await verify(request({ token })))).toContain("security=verified");
    expect(location(await verify(request({ token })))).toContain("securityError");
    await step(request({ intent: "phone", phone: "0532 123 45 67" }));
    await prisma.session.create({
      data: {
        userId: state.userId,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const password = "a different synthetic password 052";
    await step(
      request({
        intent: "password",
        username: `new-${crypto.randomUUID().slice(0, 8)}`,
        currentPassword: current,
        password,
        confirmPassword: password,
      }),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
    expect(user.phone).toBe("+905321234567");
    expect(user.email).toBe(email);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.mustChangePassword).toBe(false);
    expect(user.passwordHash).not.toBe(hash);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(issueSession).toHaveBeenCalledWith(user.id);
  });
  it("cleans unsent tokens and does not pretend mail was delivered", async () => {
    vi.mocked(sendAuthMail).mockRejectedValueOnce(new Error("provider unavailable"));
    expect(
      location(await step(request({ intent: "email", email: "test@example.invalid" }))),
    ).toContain("securityError");
    expect(await prisma.securityToken.count({ where: { userId: state.userId } })).toBe(0);
  });
  it("limits verification emails per account", async () => {
    for (let i = 0; i < 4; i++)
      await step(request({ intent: "email", email: "test@example.invalid" }));
    expect(sendAuthMail).toHaveBeenCalledTimes(3);
  });
  it("requires verified email, phone and therapist calendar, without security or a separate tour", async () => {
    await prisma.user.update({
      where: { id: state.userId },
      data: {
        emailVerifiedAt: new Date(),
        mustChangePassword: false,
        phone: "+905321234567",
      },
    });
    expect(location(await complete(request({ tourViewed: "yes" })))).toContain(
      "calendar_required",
    );
    await prisma.user.update({
      where: { id: state.userId },
      data: { mfaEnabledAt: new Date() },
    });
    expect(location(await complete(request({ tourViewed: "yes" })))).toContain(
      "calendar_required",
    );
    await prisma.calendarConnection.create({
      data: {
        userId: state.userId,
        accessToken: "synthetic",
        refreshToken: "synthetic",
        expiresAt: new Date(),
        calendarId: "primary",
      },
    });
    expect(location(await complete(request({})))).toContain("/queue?guide=welcome");
    expect(location(await complete(request({ tourViewed: "yes" })))).toContain("/queue");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: state.userId } }))
        .onboardingCompletedAt,
    ).not.toBeNull();
  });
  it("claims the automatic guide once per account, including concurrent requests", async () => {
    await prisma.user.update({
      where: { id: state.userId },
      data: { onboardingCompletedAt: new Date() },
    });
    const responses = await Promise.all([showGuide(), showGuide()]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(results.filter((r) => r.show)).toHaveLength(1);
    expect((await (await showGuide()).json()).show).toBe(false);
  });
  it("does not show the automatic guide before setup completion", async () => {
    expect((await (await showGuide()).json()).show).toBe(false);
  });
  it("keeps the guide manual for accounts whose previous setup was already completed", async () => {
    await prisma.user.update({
      where: { id: state.userId },
      data: { onboardingCompletedAt: new Date() },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: state.userId,
        action: "account.guide_initialized",
        entityType: "User",
        entityId: state.userId,
        metadata: {},
      },
    });
    expect((await (await showGuide()).json()).show).toBe(false);
  });
});
