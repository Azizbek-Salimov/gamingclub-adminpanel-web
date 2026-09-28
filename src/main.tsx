import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
  Navigate,
} from "react-router";
import {
  api,
  auth,
  refresh,
  logout,
  type Page,
  type Category,
  type Game,
} from "./api";
import { Auth } from "./Auth";
import { Categories, Games } from "./Catalog";
import { Team, Audit } from "./Staff";
import { Asset, Brand, Notice } from "./ui";
import "./styles.css";
const nav: [string, [string, string, string, boolean?][]][] = [
  [
    "РАБОТА",
    [
      ["/", "Главная", ""],
      ["/review", "Клубы на проверке", "1", true],
      ["/access", "Заявки на доступ", "2", true],
      ["/complaints", "Жалобы на отзывы", "3", true],
      ["/disputes", "Споры по броням", "4", true],
    ],
  ],
  [
    "АНАЛИТИКА",
    [
      ["/clubs", "Сеть клубов", "5", true],
      ["/revenue", "Выручка", "6", true],
    ],
  ],
  [
    "ПОДПИСКИ",
    [
      ["/plans", "Тарифы и цены", "7", true],
      ["/subscriptions", "Подписки клубов", "1", true],
    ],
  ],
  [
    "КАТАЛОГ",
    [
      ["/categories", "Категории", "8"],
      ["/games", "Игры", "9"],
    ],
  ],
  [
    "РЕКЛАМА",
    [
      ["/ad-slots", "Рекламные места", "10", true],
      ["/campaigns", "Кампании", "11", true],
    ],
  ],
  [
    "ПЛАТФОРМА",
    [
      ["/users", "Пользователи", "12", true],
      ["/audit", "Журнал действий", "13"],
      ["/team", "Команда и роли", "14"],
      ["/rules", "Правила платформы", "15", true],
    ],
  ],
];
function Dashboard() {
  const [stats, setStats] = useState<{
      categories: number;
      games: number;
      staff: number | null;
    } | null>(null),
    [error, setError] = useState("");
  const owner = auth.get()?.staff.role === "PLATFORM_OWNER";
  async function load() {
    setError("");
    try {
      const [c, g, s] = await Promise.all([
        api<Page<Category>>("/categories?size=1"),
        api<Page<Game>>("/games?size=1"),
        owner ? api<unknown[]>("/staff") : Promise.resolve(null),
      ]);
      setStats({
        categories: c.total,
        games: g.total,
        staff: s?.length ?? null,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Главная</h1>
          <p>
            Обзор платформы ·{" "}
            {new Date().toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <button className="button secondary" onClick={load}>
          Обновить данные
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      <h2 className="section-title">Сейчас</h2>
      <div className="metrics">
        {[
          "Клубы открыты",
          "Места заняты",
          "Ожидаем за час",
          "Брони сегодня",
          "Оборот клубов сегодня",
        ].map((t) => (
          <section className="panel metric" key={t}>
            <span>
              <i />
              {t}
            </span>
            <strong>—</strong>
            <small>Источник данных ещё не подключён</small>
          </section>
        ))}
      </div>
      <div className="chart-grid">
        <section className="panel panel-pad">
          <h3>Занятые места по часам · сегодня</h3>
          <div className="chart-empty">
            <div className="chart-lines" />
            <span>Статистика занятости пока недоступна</span>
          </div>
        </section>
        <section className="panel panel-pad">
          <h3>Занято по категориям</h3>
          <div className="empty">
            Данные появятся после подключения статистики залов.
          </div>
        </section>
      </div>
      <h2 className="section-title">Каталог и команда</h2>
      <div className="catalog-metrics">
        {[
          [
            "Категории",
            stats?.categories,
            "/categories",
            "Справочник и порядок в приложении",
          ],
          ["Игры", stats?.games, "/games", "Обложки, платформы и категории"],
          ...(owner
            ? [
                [
                  "Сотрудники",
                  stats?.staff,
                  "/team",
                  "Приглашения и права доступа",
                ],
              ]
            : []),
        ].map(([label, count, path, description]) => (
          <NavLink
            className="panel metric metric-link"
            to={String(path)}
            key={String(path)}
          >
            <span>{label}</span>
            <strong>{count ?? "—"}</strong>
            <small>{description} →</small>
          </NavLink>
        ))}
      </div>
      <section className="panel panel-pad dashboard-note">
        <h3>Панель владельца платформы</h3>
        <p className="sub">
          Каталог, сотрудники и двухфакторная авторизация подключены к backend.
          Модерация клубов, выручка, подписки и реклама будут доступны после
          подключения соответствующих модулей.
        </p>
      </section>
    </>
  );
}
function App() {
  const session = useSyncExternalStore(auth.subscribe, auth.get);
  const [boot, setBoot] = useState(true),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false);
  const loc = useLocation();
  const authPath = ["/login", "/invite", "/reset"].includes(loc.pathname);
  useEffect(() => {
    if (authPath) {
      setBoot(false);
      return;
    }
    refresh()
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => setMenu(false), [loc.pathname]);
  if (authPath) return <Auth />;
  if (boot)
    return (
      <main className="boot">
        <Brand />
        <p>Проверяем сессию…</p>
      </main>
    );
  if (!session) return <Navigate to="/login" replace />;
  const owner = session.staff.role === "PLATFORM_OWNER";
  const title =
    nav.flatMap((x) => x[1]).find((x) => x[0] === loc.pathname)?.[1] ||
    "Платформа";
  return (
    <div className="shell">
      <a className="skip" href="#content">
        К содержимому
      </a>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Brand />
        <nav>
          {nav.map(([group, links]) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {links
                .filter(
                  ([path]) => owner || !["/audit", "/team"].includes(path),
                )
                .map(([path, label, icon, disabled]) =>
                  disabled ? (
                    <span
                      className="nav-item unavailable"
                      key={path}
                      title="Раздел ещё не подключён"
                      aria-disabled="true"
                    >
                      <Asset name={"imgIconSvg" + icon} />
                      {label}
                    </span>
                  ) : (
                    <NavLink
                      end
                      className={({ isActive }) =>
                        "nav-item " + (isActive ? "active" : "")
                      }
                      key={path}
                      to={path}
                    >
                      <Asset name={"imgIconSvg" + icon} />
                      {label}
                    </NavLink>
                  ),
                )}
            </div>
          ))}
        </nav>
        <div className="profile">
          <span className="avatar">
            {session.staff.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <b>{session.staff.name}</b>
            <small>{owner ? "Владелец платформы" : "Модератор"}</small>
          </div>
          <button
            className="text-button"
            title="Выйти"
            aria-label="Выйти"
            onClick={() => logout().catch((e) => setError(e.message))}
          >
            ↪
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="row">
            <button
              className="mobile-menu button secondary"
              aria-label="Открыть меню"
              onClick={() => setMenu(!menu)}
            >
              ☰
            </button>
            <div>
              <b>{title}</b>
              <small>Управление платформой</small>
            </div>
          </div>
          <span className="workspace-label">
            <i />
            {owner ? "Владелец проекта" : "Модератор"} · Bronuz
          </span>
        </header>
        <main id="content" className="content">
          {error && <Notice error>{error}</Notice>}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/categories"
              element={<Categories canWrite={owner} />}
            />
            <Route path="/games" element={<Games canWrite={owner} />} />
            <Route
              path="/team"
              element={owner ? <Team /> : <Navigate to="/" />}
            />
            <Route
              path="/audit"
              element={owner ? <Audit /> : <Navigate to="/" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
