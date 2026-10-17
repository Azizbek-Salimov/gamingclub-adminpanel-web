export type Staff = {
  id: string;
  name: string;
  email: string;
  role: "PLATFORM_OWNER" | "MODERATOR";
};
export type Session = {
  accessToken: string;
  staff: Staff;
  expiresInSeconds: number;
};
export type Category = {
  id: string;
  slug: string;
  titles: Record<string, string>;
  marketIds: string[];
  bookingUnit: string;
  templateId: string;
  templateVersion: number;
  version: number;
  state: string;
  iconKey: string | null;
  iconMediaId: string | null;
  iconUrl: string | null;
};
export type Game = {
  id: string;
  title: string;
  genre: string;
  ageRating: string;
  synonyms: string[];
  platforms: string[];
  featured: boolean;
  categoryIds: string[];
  version: number;
  state: string;
  imageId: string | null;
  clubCount: number;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  version?: number;
};
const messages: Record<string, string> = {
  ICON_SIZE_INVALID: "Иконка должна занимать не более 2 МБ.",
  IMAGE_SIZE_INVALID: "Изображение превышает допустимый размер.",
  IMAGE_FORMAT_INVALID:
    "Файл повреждён или имеет неподдерживаемый формат. Нужен JPG или PNG.",
  IMAGE_DIMENSIONS_INVALID:
    "Изображение слишком большое по разрешению: максимум 40 мегапикселей и 16384 пикселя по стороне.",
  IMAGE_PROCESSING_BUSY:
    "Обрабатываются другие изображения. Попробуйте ещё раз.",
  INVALID_CREDENTIALS: "Неверная почта или пароль.",
  MFA_INVALID: "Неверный или уже использованный код.",
  INVALID_CODE: "Неверный или уже использованный код.",
  VERSION_MISMATCH:
    "Запись изменена другим сотрудником. Обновите данные перед сохранением.",
  CATEGORY_IN_USE:
    "Категория используется клубами или играми. Сначала перенесите связи.",
  GAME_IN_USE: "Игра используется залами. Вместо архива можно скрыть её.",
  GAME_CATEGORY_IN_USE: "Категория используется залами с этой игрой.",
  PERMISSION_DENIED: "Недостаточно прав.",
  PLATFORM_UNAVAILABLE: "Платформа временно недоступна. Попробуйте позже.",
  LAST_OWNER: "Нельзя отключить последнего владельца.",
  INVITE_INVALID: "Приглашение истекло или уже использовано.",
  SUBMISSION_VERSION_CONFLICT:
    "Заявку изменил другой сотрудник. Перечитайте данные перед продолжением.",
  REVIEW_NOT_PENDING:
    "Заявка уже обработана или отозвана владельцем. Обновите данные.",
  MODERATION_REVIEW_INCOMPLETE:
    "Проверьте все шесть разделов и устраните замечания перед одобрением.",
  MODERATION_FEEDBACK_INVALID:
    "Для возврата нужно хотя бы одно замечание; для одобрения список должен быть пустым.",
  MODERATION_FEEDBACK_TARGET_INVALID:
    "Замечание ссылается на отсутствующее поле, зал или фотографию.",
  MODERATION_REASON_INVALID:
    "Выберите причину отклонения заявки. Для варианта «Другое» добавьте пояснение.",
  MODERATION_FEEDBACK_REQUIRED:
    "Добавьте хотя бы одно замечание для возврата на исправление.",
  CLUB_PERMISSION_DENIED:
    "Нельзя проверять собственный клуб или заявку связанного с вами владельца.",
  SUBMITTED_SNAPSHOT_NO_LONGER_READY:
    "Данные заявки больше не готовы к публикации. Верните её владельцу для обновления.",
  INPUT_INVALID: "Проверьте заполненные поля.",
  INVALID_INPUT: "Проверьте заполненные поля.",
};
export class ApiError extends Error {
  public status: number;
  public code: string;
  constructor(status: number, code: string) {
    super(
      messages[code] ||
        {
          401: "Войдите в панель заново.",
          403: "Недостаточно прав.",
          409: "Конфликт данных: запись уже существует или используется.",
          413: "Файл слишком большой. Иконки — до 2 МБ, обложки — до 5 МБ.",
          415: "Нужен корректный JPG или PNG.",
          429: "Слишком много попыток. Подождите минуту.",
        }[status] ||
        `Запрос не выполнен (${status}, ${code}).`,
    );
    this.status = status;
    this.code = code;
  }
}
let session: Session | null = null;
let refreshing: Promise<Session> | null = null;
const listeners = new Set<() => void>();
export const auth = {
  get: () => session,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
  set: (s: Session | null) => {
    session = s;
    listeners.forEach((f) => f());
  },
};
const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("bronuz-admin-session");
channel?.addEventListener("message", (event) => {
  if (event.data === "logout") auth.set(null);
});
const base = "/api/operations/v1";
async function raw(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  h.set("X-Admin-Client", "web");
  if (session) h.set("Authorization", `Bearer ${session.accessToken}`);
  if (init.body && !(init.body instanceof FormData))
    h.set("Content-Type", "application/json");
  return fetch(base + path, {
    ...init,
    headers: h,
    credentials: "same-origin",
    cache: "no-store",
  });
}
async function decode<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let code = "HTTP_ERROR";
    try {
      code = (await r.json()).code || code;
    } catch {}
    throw new ApiError(r.status, code);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}
export function refresh() {
  if (!refreshing) {
    const action = async () => {
      const s = await decode<Session>(
        await raw("/auth/refresh", { method: "POST" }),
      );
      auth.set(s);
      return s;
    };
    refreshing = (
      navigator.locks
        ? navigator.locks.request("bronuz-admin-refresh", action)
        : action()
    )
      .catch((e) => {
        auth.set(null);
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
export async function apiResponse<T>(
  path: string,
  method = "GET",
  body?: unknown,
  version?: number | string,
  key?: string,
): Promise<{ data: T; etag: string | null }> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Idempotency-Key"] = key || crypto.randomUUID();
  if (version !== undefined)
    headers["If-Match"] =
      typeof version === "number" ? `"${version}"` : version;
  const init = {
    method,
    headers,
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  };
  let r = await raw(path, init);
  if (r.status === 401 && !path.startsWith("/auth/")) {
    await refresh();
    r = await raw(path, init);
  }
  const etag = r.headers.get("ETag");
  return { data: await decode<T>(r), etag };
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  version?: number | string,
  key?: string,
): Promise<T> {
  return (await apiResponse<T>(path, method, body, version, key)).data;
}
export async function privateImage(path: string) {
  let r = await raw(path);
  if (r.status === 401) {
    await refresh();
    r = await raw(path);
  }
  if (!r.ok) await decode(r);
  if (
    !["image/png", "image/jpeg"].includes(
      r.headers.get("Content-Type")?.split(";")[0] || "",
    )
  )
    throw new Error("Не удалось загрузить фотографию.");
  return URL.createObjectURL(await r.blob());
}
export async function logout() {
  await api("/auth/logout", "POST");
  auth.set(null);
  channel?.postMessage("logout");
}
export async function media(id: string) {
  let r = await raw(`/category-icons/${id}`);
  if (r.status === 401) {
    await refresh();
    r = await raw(`/category-icons/${id}`);
  }
  if (!r.ok) throw new ApiError(r.status, "IMAGE_UNAVAILABLE");
  return URL.createObjectURL(await r.blob());
}
export async function upload(file: File, purpose: "ICON" | "GAME" = "ICON") {
  const max = purpose === "ICON" ? 2 : 5;
  if (!file.size || file.size > max * 1024 * 1024)
    throw new Error(`Выберите файл до ${max} МБ.`);
  if (file.type && !["image/png", "image/jpeg"].includes(file.type))
    throw new Error("Нужен JPG или PNG.");
  const form = new FormData();
  form.append("file", file);
  return api<{ mediaId: string }>(
    purpose === "ICON" ? "/category-icons" : "/game-images",
    "POST",
    form,
  );
}
export async function allCategories() {
  const items: Category[] = [];
  for (let page = 0; page < 100; page++) {
    const r = await api<Page<Category>>(`/categories?size=100&page=${page}`);
    items.push(...r.items);
    if (items.length >= r.total) return items;
  }
  throw new Error("Слишком большой справочник категорий.");
}
