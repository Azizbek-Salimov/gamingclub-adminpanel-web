import { useEffect, useState, type ReactNode } from "react";
import { media } from "./api";
export function Asset({
  name,
  screen = "categories",
}: {
  name: string;
  screen?: string;
}) {
  return <img className="asset" src={`/assets/${screen}-${name}.svg`} alt="" />;
}
export function Brand({ auth = false }: { auth?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">B</span>
      <div>
        <b>Bronuz Admin</b>
        <small>
          {auth ? "Для сотрудников платформы" : "Платформа · модерация"}
        </small>
      </div>
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function ImagePreview({
  id,
  label = "Изображение",
  fallback,
}: {
  id?: string | null;
  label?: string;
  fallback?: ReactNode;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    setSrc("");
    if (!id) return;
    let alive = true,
      url = "";
    media(id)
      .then((v) => {
        url = v;
        if (alive) setSrc(v);
        else URL.revokeObjectURL(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return src ? (
    <img className="media" alt={label} src={src} />
  ) : (
    <span className="media-placeholder">{fallback || "—"}</span>
  );
}
export const stateName: Record<string, string> = {
  IN_REVIEW: "На проверке",
  APPROVED: "Одобрено",
  CHANGES_REQUESTED: "На исправлении",
  WITHDRAWN: "Отозвано",
  REJECTED: "Отклонено",
  DRAFT: "Черновик",
  PUBLISHED: "Опубликовано",
  UNPUBLISHED: "Скрыто",
  ARCHIVED: "В архиве",
  ACTIVE: "Активен",
  BLOCKED: "Заблокирован",
  PENDING_MFA: "Ожидает 2FA",
};
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      {stateName[value] || value}
    </span>
  );
}
export function FileField({
  onFile,
  disabled,
  label = "Загрузить изображение",
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className={`button secondary upload ${disabled ? "disabled" : ""}`}>
      {label}
      <input
        aria-label={label}
        disabled={disabled}
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function date(v: unknown) {
  return typeof v === "string" ? new Date(v).toLocaleString("ru-RU") : "—";
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a[href]");
      if (
        dirty &&
        link &&
        !link.getAttribute("href")?.startsWith("#") &&
        !confirm("Есть несохранённые изменения. Покинуть страницу?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", listener, true);
    return () => document.removeEventListener("click", listener, true);
  }, [dirty]);
}
