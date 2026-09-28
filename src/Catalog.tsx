import { useEffect, useState } from "react";
import {
  api,
  allCategories,
  upload,
  type Category,
  type Game,
  type Page,
} from "./api";
import {
  useUnsavedChanges,
  Asset,
  Empty,
  FileField,
  ImagePreview,
  Notice,
  Status,
} from "./ui";
import { TextField } from "./Field";
const units: Record<string, string> = {
  SEAT: "Место",
  BOX: "Бокс",
  ZONE: "Зона",
};
const blankCategory = (): Category => ({
  id: "",
  slug: "",
  titles: { ru: "", uz: "", en: "" },
  marketIds: [],
  bookingUnit: "SEAT",
  templateId: "RESOURCE_SLOT",
  templateVersion: 1,
  version: 0,
  state: "DRAFT",
  iconKey: "category",
  iconMediaId: null,
  iconUrl: null,
});
const blankGame = (): Game => ({
  id: "",
  title: "",
  genre: "",
  ageRating: "",
  synonyms: [],
  platforms: ["PC"],
  featured: false,
  categoryIds: [],
  version: 0,
  state: "DRAFT",
  imageId: null,
  clubCount: 0,
});
export function Categories({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<Category[]>([]),
    [selected, setSelected] = useState<Category | null>(null),
    [markets, setMarkets] = useState<{ id: string; code: string }[]>([]),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [icon, setIcon] = useState<string | null>(null),
    [file, setFile] = useState<File | null>(null),
    [q, setQ] = useState(""),
    [archives, setArchives] = useState(false);
  useUnsavedChanges(dirty);
  async function load(id?: string) {
    const [list, first, m] = await Promise.all([
      allCategories(),
      api<Page<Category>>("/categories?size=1"),
      api<{ id: string; code: string }[]>("/markets"),
    ]);
    setItems(list);
    setRevision(first.version || 0);
    setMarkets(m);
    if (id) setSelected(list.find((x) => x.id === id) || null);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  function choose(c: Category) {
    if (dirty && !confirm("Есть несохранённые изменения. Отменить их?")) return;
    setSelected(structuredClone(c));
    setDirty(false);
    setFile(null);
    setIcon(null);
    setError("");
    setNotice("");
  }
  function change(c: Partial<Category>) {
    setSelected((s) => (s ? { ...s, ...c } : null));
    setDirty(true);
  }
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!selected) return;
    await action(async () => {
      const s = selected;
      let result = await api<Category>(
        s.id ? `/categories/${s.id}` : "/categories",
        s.id ? "PUT" : "POST",
        {
          slug: s.slug,
          titles: s.titles,
          marketIds: s.marketIds,
          bookingUnit: s.bookingUnit,
          templateId: s.templateId,
          templateVersion: s.templateVersion,
        },
        s.id ? s.version : undefined,
      );
      setSelected(result);
      setDirty(false);
      if (file || icon) {
        const body = file
          ? { mediaId: (await upload(file)).mediaId }
          : { iconKey: icon };
        result = await api<Category>(
          `/categories/${result.id}/icon`,
          "PUT",
          body,
          result.version,
        );
        setSelected(result);
        setFile(null);
        setIcon(null);
      }
      await load(result.id);
      setNotice("Категория сохранена.");
    });
  }
  async function state(op: string) {
    if (!selected?.id) return;
    if (dirty) {
      setError("Сначала сохраните изменения.");
      return;
    }
    if (
      op === "archive" &&
      !confirm(`Перенести «${selected.titles.ru}» в архив?`)
    )
      return;
    await action(async () => {
      const c = await api<Category>(
        `/categories/${selected.id}${op === "archive" ? "" : "/" + op}`,
        op === "archive" ? "DELETE" : "POST",
        undefined,
        selected.version,
      );
      await load(c.id);
      setNotice("Статус обновлён.");
    });
  }
  async function move(c: Category, delta: number) {
    if (dirty) {
      setError("Сначала сохраните изменения.");
      return;
    }
    await action(async () => {
      const live = items.filter((x) => x.state !== "ARCHIVED");
      const i = live.findIndex((x) => x.id === c.id),
        j = i + delta;
      if (j < 0 || j >= live.length) return;
      [live[i], live[j]] = [live[j], live[i]];
      await api(
        "/categories/order",
        "PUT",
        { ids: live.map((x) => x.id) },
        revision,
      );
      await load(selected?.id);
    });
  }
  const visible = items.filter(
    (c) =>
      (archives || c.state !== "ARCHIVED") &&
      `${c.titles.ru} ${c.slug}`.toLowerCase().includes(q.toLowerCase()),
  );
  const locked = busy || !canWrite || selected?.state === "ARCHIVED";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Категории</h1>
          <p>
            Справочник платформы ·{" "}
            {items.filter((x) => x.state !== "ARCHIVED").length} категорий
          </p>
        </div>
        {canWrite && (
          <button className="button" onClick={() => choose(blankCategory())}>
            <Asset name="imgIconS2" />
            Новая категория
          </button>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <div className="category-layout">
        <section className="panel category-list">
          <div className="panel-head">
            <h2>Порядок в приложении</h2>
          </div>
          <div className="panel-pad">
            <TextField
              label="Поиск категорий"
              placeholder="Название или slug"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={archives}
                onChange={(e) => setArchives(e.target.checked)}
              />
              Показать архив
            </label>
          </div>
          {loading ? (
            <Empty>Загрузка…</Empty>
          ) : !visible.length ? (
            <Empty>Категорий пока нет</Empty>
          ) : (
            visible.map((c) => (
              <div
                className={`category-row ${selected?.id === c.id ? "selected" : ""}`}
                key={c.id}
              >
                <button className="category-pick" onClick={() => choose(c)}>
                  <span className="category-icon">
                    <CategoryImage c={c} />
                  </span>
                  <span>
                    <b>{c.titles.ru || c.slug}</b>
                    <small>
                      {units[c.bookingUnit]} · <Status value={c.state} />
                    </small>
                  </span>
                </button>
                {canWrite && c.state !== "ARCHIVED" && (
                  <span className="order-buttons">
                    <button
                      aria-label={`Поднять ${c.titles.ru}`}
                      disabled={
                        busy ||
                        items.filter((x) => x.state !== "ARCHIVED")[0]?.id ===
                          c.id
                      }
                      onClick={() => move(c, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Опустить ${c.titles.ru}`}
                      disabled={
                        busy ||
                        items.filter((x) => x.state !== "ARCHIVED").at(-1)
                          ?.id === c.id
                      }
                      onClick={() => move(c, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </div>
            ))
          )}
          <p className="hint panel-pad">
            Порядок применяется к ленте категорий в приложении.
          </p>
        </section>
        {selected ? (
          <>
            <section className="panel editor">
              <div className="panel-head">
                <h2>
                  {selected.id
                    ? selected.titles.ru || "Категория"
                    : "Новая категория"}
                </h2>
                <Status value={selected.state} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <fieldset disabled={locked}>
                  <div className="panel-pad fields">
                    {["ru", "uz", "en"].map((lang) => (
                      <TextField
                        key={lang}
                        label={`Название · ${lang.toUpperCase()}`}
                        value={selected.titles[lang] || ""}
                        onChange={(e) =>
                          change({
                            titles: {
                              ...selected.titles,
                              [lang]: e.target.value,
                            },
                          })
                        }
                        required
                        maxLength={100}
                      />
                    ))}
                    <TextField
                      label="Slug"
                      hint="Латиница, цифры и дефисы. Например: sim-racing"
                      value={selected.slug}
                      onChange={(e) => change({ slug: e.target.value })}
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      maxLength={80}
                      required
                    />
                    <div className="field">
                      <label>Иконка категории</label>
                      <div className="icon-choices">
                        {["category", "monitor", "game", "vr", "wheel"].map(
                          (k, i) => (
                            <button
                              type="button"
                              key={k}
                              aria-label={`Иконка ${k}`}
                              aria-pressed={
                                (icon || selected.iconKey) === k && !file
                              }
                              className={
                                (icon || selected.iconKey) === k && !file
                                  ? "selected"
                                  : ""
                              }
                              onClick={() => {
                                setIcon(k);
                                setFile(null);
                                setDirty(true);
                              }}
                            >
                              <Asset
                                name={
                                  [
                                    "imgIconSvg8",
                                    "imgIconSvg17",
                                    "imgIconSvg9",
                                    "imgIconSvg18",
                                    "imgIconSvg19",
                                  ][i]
                                }
                              />
                            </button>
                          ),
                        )}
                      </div>
                      <FileField
                        disabled={locked}
                        onFile={(f) => {
                          setFile(f);
                          setIcon(null);
                          setDirty(true);
                        }}
                      />
                      <small className="hint">
                        {file?.name || "PNG до 512 КБ, не больше 512 × 512."}
                      </small>
                    </div>
                    <div className="field">
                      <label>Единица брони</label>
                      <div className="seg">
                        {Object.entries(units).map(([v, t]) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={selected.bookingUnit === v}
                            className={
                              selected.bookingUnit === v ? "active" : ""
                            }
                            onClick={() => change({ bookingUnit: v })}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <small className="hint">
                        После добавления залов единицу брони меняет только
                        отдельная миграция.
                      </small>
                    </div>
                    <div className="field">
                      <label>Рынки</label>
                      {markets.map((m) => (
                        <label className="check" key={m.id}>
                          <input
                            type="checkbox"
                            checked={selected.marketIds.includes(m.id)}
                            onChange={(e) =>
                              change({
                                marketIds: e.target.checked
                                  ? [...selected.marketIds, m.id]
                                  : selected.marketIds.filter(
                                      (x) => x !== m.id,
                                    ),
                              })
                            }
                          />
                          {m.code}
                        </label>
                      ))}
                    </div>
                  </div>
                  <footer className="panel-footer">
                    <span className="hint">
                      {dirty ? "Есть изменения" : "Изменения сохранены"}
                    </span>
                    <button
                      className="button"
                      disabled={
                        (!dirty && !file && !icon) || !selected.marketIds.length
                      }
                    >
                      {busy ? "Сохранение…" : "Сохранить"}
                    </button>
                  </footer>
                </fieldset>
              </form>
            </section>
            <aside className="preview-column">
              <section className="panel panel-pad">
                <div className="eyebrow">КАК УВИДЯТ ИГРОКИ</div>
                <div className="category-preview">
                  <span className="category-icon">
                    <CategoryImage c={selected} />
                  </span>
                  <b>{selected.titles.ru || "Название категории"}</b>
                  <small>{units[selected.bookingUnit]}</small>
                </div>
                <h3>Публикация категории</h3>
                <p className="sub">
                  Категория появится в приложении, когда в выбранном рынке будет
                  опубликован хотя бы один клуб.
                </p>
                <Status value={selected.state} />
              </section>
              {canWrite && selected.id && selected.state !== "ARCHIVED" && (
                <section className="panel panel-pad stack">
                  <button
                    className="button"
                    disabled={busy || dirty}
                    onClick={() =>
                      state(
                        selected.state === "PUBLISHED"
                          ? "unpublish"
                          : "publish",
                      )
                    }
                  >
                    {selected.state === "PUBLISHED"
                      ? "Скрыть категорию"
                      : "Опубликовать"}
                  </button>
                  <button
                    className="button danger"
                    disabled={busy || dirty}
                    onClick={() => state("archive")}
                  >
                    Перенести в архив
                  </button>
                </section>
              )}
            </aside>
          </>
        ) : (
          <section className="panel editor">
            <Empty>Выберите категорию слева или создайте новую.</Empty>
          </section>
        )}
      </div>
    </>
  );
}
function CategoryImage({ c }: { c: Category }) {
  return c.iconMediaId ? (
    <ImagePreview id={c.iconMediaId} />
  ) : (
    <Asset
      name={
        {
          category: "imgIconSvg8",
          monitor: "imgIconSvg17",
          game: "imgIconSvg9",
          vr: "imgIconSvg18",
          wheel: "imgIconSvg19",
        }[c.iconKey || "category"] || "imgIconSvg8"
      }
    />
  );
}
export function Games({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<Page<Game>>({
      items: [],
      total: 0,
      page: 0,
      size: 25,
    }),
    [cats, setCats] = useState<Category[]>([]),
    [selected, setSelected] = useState<Game | null>(null),
    [q, setQ] = useState(""),
    [state, setState] = useState(""),
    [page, setPage] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [synonyms, setSynonyms] = useState("");
  useUnsavedChanges(dirty);
  async function load() {
    setData(
      await api<Page<Game>>(
        `/games?size=25&page=${page}&q=${encodeURIComponent(q)}&state=${state}`,
      ),
    );
  }
  useEffect(() => {
    allCategories()
      .then(setCats)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api<Page<Game>>(
        `/games?size=25&page=${page}&q=${encodeURIComponent(q)}&state=${state}`,
      )
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, state, page]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  function choose(g: Game) {
    if (dirty && !confirm("Отменить несохранённые изменения?")) return;
    setSelected(structuredClone(g));
    setSynonyms(g.synonyms.join(", "));
    setDirty(false);
    setFile(null);
    setError("");
    setNote("");
  }
  function change(v: Partial<Game>) {
    setSelected((s) => (s ? { ...s, ...v } : null));
    setDirty(true);
  }
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!selected) return;
    await action(async () => {
      const s = selected;
      const body = {
        title: s.title,
        genre: s.genre,
        ageRating: s.ageRating,
        synonyms: synonyms
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        platforms: s.platforms,
        categoryIds: s.categoryIds,
        featured: s.featured,
      };
      let r = await api<Game>(
        s.id ? `/games/${s.id}` : "/games",
        s.id ? "PUT" : "POST",
        body,
        s.id ? s.version : undefined,
      );
      setSelected(r);
      setDirty(false);
      if (file) {
        const media = await upload(file);
        r = await api<Game>(
          `/games/${r.id}/image`,
          "PUT",
          { mediaId: media.mediaId },
          r.version,
        );
        setSelected(r);
        setFile(null);
      }
      await load();
      setNote("Игра сохранена.");
    });
  }
  async function transition(op: string) {
    if (!selected?.id || dirty) return;
    if (op === "archive" && !confirm(`Перенести «${selected.title}» в архив?`))
      return;
    await action(async () => {
      const r = await api<Game>(
        `/games/${selected.id}${op === "archive" ? "" : "/" + op}`,
        op === "archive" ? "DELETE" : "POST",
        undefined,
        selected.version,
      );
      choose(r);
      await load();
      setNote("Статус обновлён.");
    });
  }
  const locked = busy || !canWrite || selected?.state === "ARCHIVED";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Игры</h1>
          <p>Справочник платформы · {data.total} игр</p>
        </div>
        {canWrite && (
          <button className="button" onClick={() => choose(blankGame())}>
            <Asset name="imgIconS2" />
            Новая игра
          </button>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {note && <Notice>{note}</Notice>}
      <div className="games-layout">
        <section className="panel games-table">
          <div className="tabs">
            {[
              ["", "Все"],
              ["PUBLISHED", "Опубликованные"],
              ["DRAFT", "Черновики"],
              ["UNPUBLISHED", "Скрытые"],
              ["ARCHIVED", "Архив"],
            ].map(([v, t]) => (
              <button
                key={v}
                className={state === v ? "active" : ""}
                onClick={() => {
                  setState(v);
                  setPage(0);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="table-search">
            <Asset screen="games" name="imgIconS3" />
            <input
              aria-label="Поиск игр"
              placeholder="Название или синоним"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Игра</th>
                  <th>Платформы</th>
                  <th>Возраст</th>
                  <th>Клубы</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr
                    key={g.id}
                    className={selected?.id === g.id ? "selected" : ""}
                  >
                    <td>
                      <button className="game-pick" onClick={() => choose(g)}>
                        <span className="game-thumb">
                          <ImagePreview
                            id={g.imageId}
                            label={g.title}
                            fallback={g.title.slice(0, 2).toUpperCase()}
                          />
                        </span>
                        <span>
                          <b>{g.title}</b>
                          <small>{g.genre || "Без жанра"}</small>
                        </span>
                      </button>
                    </td>
                    <td>{g.platforms.join(" · ")}</td>
                    <td>{g.ageRating || "—"}</td>
                    <td>{g.clubCount}</td>
                    <td>
                      <Status value={g.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading && <Empty>Загрузка…</Empty>}
          {!loading && !data.items.length && <Empty>Игры не найдены</Empty>}
          <footer className="panel-footer">
            <span className="hint">Найдено: {data.total}</span>
            <div className="row">
              <button
                className="button secondary"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Назад
              </button>
              <span>{page + 1}</span>
              <button
                className="button secondary"
                disabled={(page + 1) * 25 >= data.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Далее
              </button>
            </div>
          </footer>
        </section>
        <aside className="panel game-editor">
          {selected ? (
            <>
              <div className="panel-head">
                <h2>{selected.id ? "Редактирование" : "Новая игра"}</h2>
                <Status value={selected.state} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <fieldset disabled={locked}>
                  <div className="panel-pad fields">
                    <div className="cover-upload">
                      <span className="game-cover">
                        <ImagePreview
                          id={selected.imageId}
                          label={selected.title}
                          fallback={
                            selected.title.slice(0, 2).toUpperCase() || "IMG"
                          }
                        />
                      </span>
                      <div>
                        <FileField
                          disabled={locked}
                          label="Добавить обложку"
                          onFile={(f) => {
                            setFile(f);
                            setDirty(true);
                          }}
                        />
                        <small className="hint">
                          {file?.name || "PNG · до 512 КБ · 512 × 512"}
                        </small>
                        {selected.imageId && (
                          <button
                            className="text-button"
                            type="button"
                            disabled={dirty}
                            onClick={() =>
                              action(async () => {
                                const r = await api<Game>(
                                  `/games/${selected.id}/image`,
                                  "DELETE",
                                  undefined,
                                  selected.version,
                                );
                                setSelected(r);
                                await load();
                              })
                            }
                          >
                            Удалить обложку
                          </button>
                        )}
                      </div>
                    </div>
                    <TextField
                      label="Название"
                      required
                      maxLength={120}
                      value={selected.title}
                      onChange={(e) => change({ title: e.target.value })}
                    />
                    <TextField
                      label="Синонимы для поиска"
                      hint="Через запятую, не больше 20."
                      value={synonyms}
                      onChange={(e) => {
                        setSynonyms(e.target.value);
                        setDirty(true);
                      }}
                    />
                    <div className="field">
                      <label>Платформы</label>
                      <div className="chips">
                        {[
                          "PC",
                          "PS5",
                          "PS4",
                          "XBOX",
                          "SWITCH",
                          "VR",
                          "MOBILE",
                        ].map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={
                              selected.platforms.includes(p) ? "selected" : ""
                            }
                            aria-pressed={selected.platforms.includes(p)}
                            onClick={() =>
                              change({
                                platforms: selected.platforms.includes(p)
                                  ? selected.platforms.filter((x) => x !== p)
                                  : [...selected.platforms, p],
                              })
                            }
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <TextField
                      label="Жанр"
                      maxLength={80}
                      value={selected.genre}
                      onChange={(e) => change({ genre: e.target.value })}
                    />
                    <div className="field">
                      <label htmlFor="game-age-rating">Возраст</label>
                      <select
                        id="game-age-rating"
                        required
                        value={selected.ageRating}
                        onChange={(e) => change({ ageRating: e.target.value })}
                      >
                        <option value="" disabled>
                          Не указан
                        </option>
                        {["0+", "6+", "12+", "16+", "18+"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Категории</label>
                      {cats
                        .filter((c) => c.state !== "ARCHIVED")
                        .map((c) => (
                          <label className="check" key={c.id}>
                            <input
                              type="checkbox"
                              checked={selected.categoryIds.includes(c.id)}
                              onChange={(e) =>
                                change({
                                  categoryIds: e.target.checked
                                    ? [...selected.categoryIds, c.id]
                                    : selected.categoryIds.filter(
                                        (x) => x !== c.id,
                                      ),
                                })
                              }
                            />
                            {c.titles.ru}
                          </label>
                        ))}
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={selected.featured}
                        onChange={(e) => change({ featured: e.target.checked })}
                      />
                      В подборке «Популярное»
                    </label>
                  </div>
                  <footer className="panel-footer">
                    <span className="hint">
                      {dirty ? "Есть изменения" : "Сохранено"}
                    </span>
                    <button
                      className="button"
                      disabled={
                        (!dirty && !file) ||
                        !selected.platforms.length ||
                        !selected.categoryIds.length
                      }
                    >
                      {busy ? "Сохранение…" : "Сохранить"}
                    </button>
                  </footer>
                </fieldset>
              </form>
              {canWrite && selected.id && selected.state !== "ARCHIVED" && (
                <div className="panel-pad stack">
                  <button
                    className="button secondary"
                    disabled={busy || dirty}
                    onClick={() =>
                      transition(
                        selected.state === "PUBLISHED"
                          ? "unpublish"
                          : "publish",
                      )
                    }
                  >
                    {selected.state === "PUBLISHED"
                      ? "Скрыть игру"
                      : "Опубликовать"}
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={busy || dirty}
                    onClick={() => transition("archive")}
                  >
                    В архив
                  </button>
                </div>
              )}
            </>
          ) : (
            <Empty>Выберите игру из каталога или создайте новую.</Empty>
          )}
        </aside>
      </div>
    </>
  );
}
