import { test, expect } from "@playwright/test";
import { createHmac, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
const enabled = process.env.ADMIN_E2E_LOCAL === "1";
const shots = process.env.ADMIN_SCREENSHOTS || "test-results/screenshots";
function totp(secret: string) {
  let bits = "";
  for (const c of secret.replace(/\s/g, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(c)
      .toString(2)
      .padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((x) => parseInt(x, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", key).update(counter).digest(),
    o = mac.at(-1)! & 15;
  return ((mac.readUInt32BE(o) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
test("public login: responsive, local assets, no credentials stored", async ({
  page,
}) => {
  await mkdir(shots, { recursive: true });
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Вход", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Показать пароль" }).click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: shots + "/admin-login.png", fullPage: true });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
  const broken = await page
    .locator("img")
    .evaluateAll((imgs) =>
      imgs
        .filter((i) => !(i as HTMLImageElement).naturalWidth)
        .map((i) => (i as HTMLImageElement).src),
    );
  expect(broken).toEqual([]);
});
test("real backend: invitation, MFA, refresh, category and game CRUD with images", async ({
  page,
  request,
}) => {
  test.skip(
    !enabled,
    "Requires an explicitly enabled disposable local stack and QA invitation.",
  );
  await mkdir(shots, { recursive: true });
  const inbox = await (
    await request.get("http://localhost:18026/api/v1/messages")
  ).json();
  const message = inbox.messages.find((m: any) =>
    m.To.some((x: any) => x.Address === "admin-web-qa@example.test"),
  );
  expect(message).toBeTruthy();
  const mail = await (
    await request.get("http://localhost:18026/api/v1/message/" + message.ID)
  ).json();
  const invite = (mail.Text as string).match(
    /http[^\s]+\/invite#token=[^\s]+/,
  )![0];
  let access = "";
  page.on("response", async (r) => {
    if (/\/auth\/(mfa\/enroll|refresh|mfa\/verify)$/.test(r.url()) && r.ok()) {
      const v = await r.json();
      access = v.accessToken || v.session?.accessToken || access;
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(invite);
  await page.getByLabel("Ваше имя").fill("Тестовый владелец");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("QA-" + randomBytes(18).toString("base64url"));
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Подключите приложение" }),
  ).toBeVisible();
  const secret = (await page.locator(".enrollment code").innerText()).trim();
  await expect(
    page.getByAltText("QR-код для подключения двухфакторной проверки"),
  ).toBeVisible();
  await page
    .getByLabel("Код из приложения", { exact: true })
    .fill(totp(secret));
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(page.locator(".recovery-codes code")).toHaveCount(10);
  await page.getByLabel("Я сохранил резервные коды").check();
  await page.getByRole("button", { name: "Перейти в панель" }).click();
  await expect(
    page.getByRole("heading", { name: "Главная", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: shots + "/admin-dashboard.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Главная", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Категории", exact: true }).click();
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  const suffix = Date.now().toString(36),
    category = "Симрейсинг QA " + suffix;
  await page.getByLabel("Название · RU").fill(category);
  await page.getByLabel("Название · UZ").fill("Simreysing QA");
  await page.getByLabel("Название · EN").fill("Sim racing QA");
  await page.getByLabel("Slug", { exact: true }).fill("qa-" + suffix);
  await page.locator(".editor input[type=checkbox]").first().check();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Категория сохранена." }),
  ).toBeVisible();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#6596f5";
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = "white";
    x.font = "bold 28px sans-serif";
    x.fillText("QA", 10, 42);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Загрузить PNG", { exact: true }).setInputFiles({
    name: "qa-icon.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Категория сохранена." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Статус обновлён." }),
  ).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: shots + "/admin-categories.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Игры", exact: true }).click();
  await page.getByRole("button", { name: "Новая игра", exact: true }).click();
  const game = "Racing QA " + suffix;
  await page.getByLabel("Название", { exact: true }).fill(game);
  await page.getByLabel("Синонимы для поиска").fill("raceqa, симулятор");
  await page.getByLabel("Жанр", { exact: true }).fill("Симулятор");
  await page.getByLabel(category, { exact: true }).check();
  await page.getByLabel("Возраст", { exact: true }).selectOption("12+");
  await page.getByLabel("Добавить обложку", { exact: true }).setInputFiles({
    name: "qa-cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Игра сохранена." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Статус обновлён." }),
  ).toBeVisible();
  await page.getByLabel("Название", { exact: true }).fill(game + " Updated");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Игра сохранена." }),
  ).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: shots + "/admin-games.png", fullPage: true });
  await page.reload();
  await expect(
    page.getByRole("button", { name: new RegExp(game + " Updated") }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(game + " Updated") })
    .click();
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    game + " Updated",
  );
  await expect(page.locator(".game-cover img")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "В архив", exact: true }).click();
  await expect(page.locator(".game-editor .status")).toHaveText("В архиве");
  await page
    .getByRole("link", { name: "Журнал действий", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Добавлена игра", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Изменена обложка игры", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Стало" })).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: shots + "/admin-audit.png", fullPage: true });
  const headers = {
    Authorization: "Bearer " + access,
    "X-Admin-Client": "web",
  };
  const list = await (
    await request.get(
      "http://localhost:5175/api/operations/v1/games?q=" +
        encodeURIComponent(game),
      { headers },
    )
  ).json();
  expect(list.items[0].state).toBe("ARCHIVED");
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const cookie = (await page.context().cookies()).find(
    (x) => x.name === "bronuz_admin_rt",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Вход", exact: true }),
  ).toBeVisible();
});
