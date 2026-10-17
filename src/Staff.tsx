import { Link } from 'react-router';
import { useEffect, useRef, useState } from "react";
import { api, type Staff } from "./api";
import { date, Empty, Notice, Status } from "./ui";
import { TextField } from "./Field";
type Member = Staff & { state: string };
type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};
type Event = {
  id: number | string;
  actor_id: string;
  action: string;
  target_id: string;
  created_at: string;
};
export function Team() {
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("MODERATOR"),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [m, i] = await Promise.all([
      api<Member[]>("/staff"),
      api<Invite[]>("/staff/invitations"),
    ]);
    setMembers(m);
    setInvites(i);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function run(f: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await f();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Команда и роли</h1>
          <p>Сотрудники платформы · доступ по приглашению</p>
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {note && <Notice>{note}</Notice>}
      <div className="team-layout">
        <section className="panel">
          <div className="panel-head">
            <h2>Команда</h2>
            <span className="hint">{members.length} сотрудников</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Доступ</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                      <small>{m.email}</small>
                    </td>
                    <td>
                      <select
                        aria-label={`Роль ${m.name}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (
                            confirm(
                              `Изменить роль сотрудника ${m.name}? Его сессии будут завершены.`,
                            )
                          )
                            run(async () => {
                              await api(`/staff/${m.id}/access`, "PUT", {
                                role: next,
                                blocked: m.state === "BLOCKED",
                              });
                              setNote("Роль обновлена.");
                            });
                        }}
                      >
                        <option value="PLATFORM_OWNER">
                          Владелец платформы
                        </option>
                        <option value="MODERATOR">Модератор</option>
                      </select>
                    </td>
                    <td>
                      <Status value={m.state} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `${m.state === "BLOCKED" ? "Разблокировать" : "Заблокировать"} ${m.name}?`,
                            )
                          )
                            run(async () => {
                              await api(`/staff/${m.id}/access`, "PUT", {
                                role: m.role,
                                blocked: m.state !== "BLOCKED",
                              });
                            });
                        }}
                      >
                        {m.state === "BLOCKED"
                          ? "Разблокировать"
                          : "Заблокировать"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-head">
            <h2>Приглашения</h2>
          </div>
          {!invites.length && <Empty>Приглашений пока нет</Empty>}
          {invites.map((i) => (
            <div className="invite-row" key={i.id}>
              <span>
                <b>{i.email}</b>
                <small>
                  {i.role === "MODERATOR" ? "Модератор" : "Владелец платформы"}{" "}
                  · до {date(i.expires_at)}
                </small>
              </span>
              {i.consumed_at ? (
                <span className="hint">Принято</span>
              ) : i.revoked_at ? (
                <span className="hint">Отозвано</span>
              ) : new Date(i.expires_at) < new Date() ? (
                <span className="hint">Истекло</span>
              ) : (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api(`/staff/invitations/${i.id}`, "DELETE");
                    })
                  }
                >
                  Отозвать
                </button>
              )}
            </div>
          ))}
        </section>
        <aside className="stack">
          <form
            className="panel panel-pad fields"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/staff/invitations", "POST", { email, role });
                setEmail("");
                setNote("Приглашение поставлено в очередь отправки на почту.");
              });
            }}
          >
            <h2>Пригласить сотрудника</h2>
            <TextField
              label="Рабочая почта"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="field">
              Роль
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="MODERATOR">Модератор</option>
                <option value="PLATFORM_OWNER">Владелец платформы</option>
              </select>
            </label>
            <button className="button" disabled={busy}>
              Отправить приглашение
            </button>
          </form>
          <section className="panel panel-pad">
            <h3>Права сотрудников</h3>
            <p>
              <b>Владелец платформы</b>
              <br />
              <span className="sub">
                Управляет каталогом, командой, приглашениями и видит журнал.
              </span>
            </p>
            <p>
              <b>Модератор</b>
              <br />
              <span className="sub">
                Просматривает каталог. Изменения и управление командой
                недоступны.
              </span>
            </p>
            <small className="hint">
              Последнего активного владельца нельзя заблокировать или понизить.
            </small>
          </section>
        </aside>
      </div>
    </>
  );
}
const actions: Record<string, string> = {
  "club.publication.approved": "Заявка одобрена",
  "club.publication.changes_requested": "Заявка возвращена с замечаниями",
  "club.publication.rejected": "Заявка отклонена",
  "club.submission.review_saved": "Проверка заявки сохранена",
  "club.submission.withdrawn": "Заявка отозвана владельцем",
  "club.blocked": "Клуб заблокирован",
  "club.unblocked": "Блокировка клуба снята",
  CREATE: "Добавлена категория",
  UPDATE: "Изменена категория",
  PUBLISH: "Опубликована категория",
  UNPUBLISH: "Скрыта категория",
  ARCHIVE: "Категория перенесена в архив",
  ICON_SET: "Изменена иконка",
  ICON_UPLOAD: "Загружено изображение",
  ORDER: "Изменён порядок категорий",
  GAME_CREATE: "Добавлена игра",
  GAME_UPDATE: "Изменена игра",
  GAME_IMAGE: "Изменена обложка игры",
  GAME_PUBLISH: "Опубликована игра",
  GAME_UNPUBLISH: "Скрыта игра",
  GAME_ARCHIVE: "Игра перенесена в архив",
};
type CatalogEvent = Event & { before_data?: string; after_data?: string; club_id?: string; reason?: string | null; event_id?: string };
export function Audit() {
  const [clubFilter, setClubFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [filters, setFilters] = useState({ clubId: "", actorId: "" });
  const readSequence = useRef(0);
  const [rows, setRows] = useState<CatalogEvent[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(true),
    [source, setSource] = useState("catalog-audit"),
    [selected, setSelected] = useState<CatalogEvent | null>(null);
  async function load(append = false) {
    const sequence=++readSequence.current;
    setBusy(true);setError("");
    try {
      const params=new URLSearchParams();
      if(append&&rows.length)params.set("before",String(rows.at(-1)!.id));
      if(source==="moderation-audit") {
        if(filters.clubId)params.set("clubId",filters.clubId);
        if(filters.actorId)params.set("actorId",filters.actorId);
      }
      const d=await api<CatalogEvent[]>("/"+source+(params.size?"?"+params:""));
      if(sequence!==readSequence.current)return;
      setRows(x=>append?[...x,...d]:d);setMore(d.length===100);
    } catch(error) { if(sequence===readSequence.current)setError((error as Error).message); }
    finally { if(sequence===readSequence.current)setBusy(false); }
  }
  useEffect(()=>{
    setRows([]);setSelected(null);setMore(true);void load();
    return ()=>{++readSequence.current;};
  },[source,filters]);
  const detail = (s?: string) => {
    if (!s) return "—";
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Журнал действий</h1>
          <p>История изменений платформы</p>
        </div>
        <button
          className="button secondary"
          onClick={() => load()}
          disabled={busy}
        >
          Обновить
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="audit-layout">
        <section className="panel">
          <div className="tabs">
            {[
              ["catalog-audit", "Каталог"],
              ["moderation-audit", "Модерация"],
              ["audit", "Сотрудники и вход"],
            ].map(([v, t]) => (
              <button
                key={v}
                className={source === v ? "active" : ""}
                onClick={() => setSource(v)}
              >
                {t}
              </button>
            ))}
          </div>
          {source === "moderation-audit" && <form className="panel-pad audit-filters" onSubmit={e=>{e.preventDefault();setFilters({clubId:clubFilter.trim(),actorId:actorFilter.trim()});}}>
            <label>Клуб (UUID)<input aria-label="Фильтр журнала по клубу" value={clubFilter} pattern="[0-9a-fA-F-]{36}" onChange={e=>setClubFilter(e.target.value)} /></label>
            <label>Сотрудник (UUID)<input aria-label="Фильтр журнала по сотруднику" value={actorFilter} pattern="[0-9a-fA-F-]{36}" onChange={e=>setActorFilter(e.target.value)} /></label>
            <button className="button secondary" disabled={busy}>Применить фильтры</button>
          </form>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Действие</th>
                  <th>Объект</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={selected?.id === r.id ? "selected" : ""}
                  >
                    <td>{date(r.created_at)}</td>
                    <td>
                      <button
                        className="text-button audit-action"
                        onClick={() => setSelected(r)}
                      >
                        {actions[r.action] || r.action}
                      </button>
                    </td>
                    <td>
                      <code>{r.target_id?.slice(0, 8) || "—"}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && !busy && <Empty>Событий пока нет</Empty>}
          {more && (
            <footer className="panel-footer">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => load(true)}
              >
                {busy ? "Загрузка…" : "Ещё события"}
              </button>
            </footer>
          )}
        </section>
        <aside className="panel panel-pad audit-detail">
          {selected ? (
            <>
              <h2>{actions[selected.action] || selected.action}</h2>
              <small>{date(selected.created_at)}</small>
              <p className="sub">Сотрудник</p>
              <code>{selected.actor_id || "Система"}</code>
              <p className="sub">Объект</p>
              <code>{selected.target_id || "—"}</code>
              {source === "moderation-audit" && <>
                <p className="sub">Клуб</p><code>{selected.club_id || "—"}</code>
                {selected.reason && <><p className="sub">Причина решения</p><p style={{whiteSpace:"pre-wrap"}}>{selected.reason}</p></>}
                <p><Link className="text-button" to={`/review?submission=${encodeURIComponent(selected.target_id)}`}>Открыть заявку ›</Link></p>
              </>}
              {source === "catalog-audit" && (
                <>
                  <h3>Было</h3>
                  <pre>{detail(selected.before_data)}</pre>
                  <h3>Стало</h3>
                  <pre>{detail(selected.after_data)}</pre>
                </>
              )}
            </>
          ) : (
            <Empty>Выберите событие, чтобы посмотреть детали.</Empty>
          )}
          <Notice>
            Журнал доступен только для чтения. Изменить или удалить запись через
            панель нельзя.
          </Notice>
        </aside>
      </div>
    </>
  );
}
