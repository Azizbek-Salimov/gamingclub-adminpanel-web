import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import { api, ApiError, privateImage, type Page } from "./api";
import { date, Empty, Notice, Status, useUnsavedChanges } from "./ui";
import {
  moderation,
  sections,
  submissionPath,
  reviewSignature,
  money,
  type Card,
  type Counts,
  type Decision,
  type Feedback,
  type Hall,
  type Review,
  type ReviewState,
  type Section,
  type Submission,
} from "./moderation-api";

const states: [ReviewState, string][] = [
  ["IN_REVIEW", "На проверке"],
  ["CHANGES_REQUESTED", "На исправлении"],
  ["APPROVED", "Одобрено"],
  ["WITHDRAWN", "Отозвано"],
  ["REJECTED", "Отклонено"],
];
const stateHint: Record<ReviewState, string> = {
  IN_REVIEW: "Ожидают решения",
  CHANGES_REQUESTED: "Возвращены владельцу",
  APPROVED: "Проверка завершена",
  WITHDRAWN: "Отозваны владельцем",
  REJECTED: "Отказ модератора",
};
const rejectReasons = [
  "Дубликат клуба, который уже есть на платформе",
  "Клуб не существует или адрес не найден",
  "Это не компьютерный или игровой клуб",
  "Недостоверные данные или чужие фотографии",
  "Владелец не подтвердил право управлять клубом",
  "Другое",
];
/** Reason line and owner comment are sent as one text: «Причина\n\nКомментарий». */
const rejectionTitle = (reason: string | null) =>
  reason?.split("\n")[0].trim() || "";
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось загрузить данные.";
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export function Moderation() {
  const [params, setParams] = useSearchParams();
  const id = params.get("submission");
  const [state, setState] = useState<ReviewState>("IN_REVIEW");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [sort, setSort] = useState("OLDEST"),
    [market, setMarket] = useState("");
  const [markets, setMarkets] = useState<{ id: string; code: string }[]>([]);
  const [page, setPage] = useState(0),
    [generation, setGeneration] = useState(0);
  const [queue, setQueue] = useState<Page<Card> | null>(null),
    [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    api<{ id: string; code: string }[]>("/markets")
      .then(setMarkets)
      .catch(() => {});
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    const common = new URLSearchParams({ q: query });
    if (market) common.set("marketId", market);
    const filter = new URLSearchParams(common);
    filter.set("state", state);
    filter.set("page", String(page));
    filter.set("size", "12");
    filter.set("sort", sort);
    Promise.all([moderation.queue(filter), moderation.counts(common)])
      .then(([q, c]) => {
        if (current) {
          if (!q.items.length && page > 0)
            setPage(Math.max(0, Math.ceil(q.total / 12) - 1));
          setQueue(q);
          setCounts(c);
        }
      })
      .catch((e) => {
        if (current) {
          setError(errorMessage(e));
          setQueue(null);
          setCounts(null);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [state, query, page, sort, market, generation]);
  const reload = useCallback(() => setGeneration((v) => v + 1), []);
  const open = (submission?: string) =>
    setParams(submission ? { submission } : {});
  if (id)
    return (
      <ReviewDetail
        key={id}
        id={id}
        onBack={() => open()}
        onOpen={open}
        onChanged={reload}
      />
    );
  return (
    <div className="moderation">
      <div className="page-heading">
        <div>
          <h1>Клубы на проверке</h1>
          <p>Проверяйте данные клуба и залов перед публикацией</p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={reload}
        >
          Обновить
        </button>
      </div>
      <div className="review-counts">
        {states.map(([value, label]) => (
          <button
            key={value}
            aria-pressed={state === value}
            className={`panel review-count ${state === value ? "selected" : ""}`}
            onClick={() => {
              setState(value);
              setPage(0);
            }}
          >
            <span>{label}</span>
            <strong>{loading ? "…" : (counts?.states[value] ?? "—")}</strong>
            <small>{stateHint[value]}</small>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="review-filters">
          <label className="review-search">
            <span>Поиск</span>
            <input
              aria-label="Поиск по клубу или залу"
              placeholder="Название клуба или зала"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span>Город / рынок</span>
            <select
              aria-label="Город / рынок"
              value={market}
              onChange={(e) => {
                setMarket(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Все города</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Порядок</span>
            <select
              aria-label="Порядок заявок"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="OLDEST">Сначала старые</option>
              <option value="NEWEST">Сначала новые</option>
            </select>
          </label>
        </div>
        {error ? (
          <div className="panel-pad">
            <Notice error>{error}</Notice>
            <button className="button secondary" onClick={reload}>
              Повторить загрузку
            </button>
          </div>
        ) : loading ? (
          <Empty>Загружаем заявки…</Empty>
        ) : queue?.items.length ? (
          <>
            <div className="review-queue">
              {queue.items.map((c) => (
                <article className="review-card" key={c.submissionId}>
                  <div className="review-cover">
                    {c.coverUrl ? (
                      <Photo
                        submission={c.submissionId}
                        mediaId={c.coverUrl.split("/").at(-1)!}
                        alt={`Обложка ${c.clubName}`}
                      />
                    ) : (
                      <span className="review-initial">
                        {c.clubName.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="review-card-copy">
                    <div className="review-card-title">
                      <h3>
                        <button
                          className="review-card-open"
                          onClick={() => open(c.submissionId)}
                        >
                          {c.clubName}
                        </button>
                      </h3>
                      <Status value={c.state} />
                    </div>
                    <p>{c.address.addressLine}</p>
                    <div className="review-card-meta">
                      <span>{c.hallCount} зал(а)</span>
                      <span>Отправлено {date(c.submittedAt)}</span>
                      <span>#{shortId(c.submissionId)}</span>
                    </div>
                    {c.state === "REJECTED" && (
                      <p className="review-card-reason">
                        Причина:{" "}
                        {rejectionTitle(c.rejectionReason) || "не указана"}
                        {c.reviewedAt && ` · решение ${date(c.reviewedAt)}`}
                        {c.reviewerAudience && ` · ${c.reviewerAudience}`}
                      </p>
                    )}
                  </div>
                  <button
                    className="text-button review-arrow"
                    aria-label={`Открыть заявку ${c.clubName}`}
                    onClick={() => open(c.submissionId)}
                  >
                    →
                  </button>
                </article>
              ))}
            </div>
            <Pager page={page} total={queue.total} size={12} onPage={setPage} />
          </>
        ) : (
          <Empty>
            <b>
              {query || market
                ? "Ничего не найдено"
                : state === "IN_REVIEW"
                  ? "Новых заявок пока нет"
                  : "Заявок с этим статусом нет"}
            </b>
            <br />
            {query || market
              ? "Попробуйте изменить поиск или фильтры."
              : "Здесь появятся клубы и залы, которые владельцы отправили на проверку."}
          </Empty>
        )}
      </section>
    </div>
  );
}

function Pager({
  page,
  total,
  size,
  onPage,
}: {
  page: number;
  total: number;
  size: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="panel-footer">
      <small>
        {total
          ? `${page * size + 1}–${Math.min((page + 1) * size, total)} из ${total}`
          : "0 заявок"}
      </small>
      <div className="row">
        <button
          className="button secondary"
          disabled={!page}
          onClick={() => onPage(page - 1)}
        >
          Назад
        </button>
        <button
          className="button secondary"
          disabled={(page + 1) * size >= total}
          onClick={() => onPage(page + 1)}
        >
          Далее
        </button>
      </div>
    </div>
  );
}

function Photo({
  submission,
  mediaId,
  alt,
  onOpen,
}: {
  submission: string;
  mediaId: string;
  alt: string;
  onOpen?: () => void;
}) {
  const [src, setSrc] = useState(""),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true,
      url = "";
    setSrc("");
    setError(false);
    privateImage(
      `${submissionPath(submission)}/media/${encodeURIComponent(mediaId)}`,
    )
      .then((v) => {
        url = v;
        if (alive) setSrc(v);
        else URL.revokeObjectURL(v);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [submission, mediaId, attempt]);
  if (error)
    return (
      <span className="review-photo-error">
        Фото недоступно{" "}
        <button
          className="text-button"
          onClick={(e) => {
            e.stopPropagation();
            setAttempt((v) => v + 1);
          }}
        >
          Повторить
        </button>
      </span>
    );
  if (!src) return <span className="review-photo-loading">Загрузка фото…</span>;
  return onOpen ? (
    <button className="review-photo-button" onClick={onOpen}>
      <img src={src} alt={alt} />
    </button>
  ) : (
    <img src={src} alt={alt} />
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="review-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="panel-head">
        <h2>{title}</h2>
        <button
          className="text-button"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}

type Pending = {
  kind: "SAVE" | Decision;
  etag: string;
  key: string;
  body: Pick<Review, "checkedSections" | "feedback">;
  reason?: string;
};
function ReviewDetail({
  id,
  onBack,
  onOpen,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Submission | null>(null),
    [etag, setEtag] = useState("");
  const [tab, setTab] = useState<Section>("club"),
    [hallId, setHallId] = useState("");
  const [checked, setChecked] = useState<Section[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [confirm, setConfirm] = useState<Decision | null>(null),
    [history, setHistory] = useState(false);
  const [reject, setReject] = useState({ reason: "", comment: "" });
  const [note, setNote] = useState<{
      index: number | null;
      field: string;
      message: string;
    } | null>(null),
    [photo, setPhoto] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const [discard, setDiscard] = useState<{ action: () => void } | null>(null);
  const active = data?.state === "IN_REVIEW";
  const dirty =
    !!data &&
    reviewSignature(checked, feedback) !==
      reviewSignature(data.review.checkedSections, data.review.feedback);
  const locked = busy || conflict || uncertain;
  useUnsavedChanges(dirty || uncertain);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || uncertain) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, uncertain]);
  const apply = (s: Submission, tag: string | null) => {
    if (!tag)
      throw new Error("Сервер не передал версию заявки. Обновите данные.");
    setData(s);
    setEtag(tag);
    setChecked(s.review.checkedSections);
    setFeedback(s.review.feedback);
    setHallId((previous) =>
      s.snapshot.halls.some((h) => h.hallId === previous)
        ? previous
        : s.snapshot.halls[0]?.hallId || "",
    );
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await moderation.get(id);
      apply(r.data, r.etag);
      setConflict(false);
      setUncertain(false);
      pending.current = null;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  function leave(action: () => void) {
    if (busy) return;
    if (dirty || uncertain) {
      setDiscard({ action });
      return;
    }
    action();
  }
  async function mutate(kind: Pending["kind"]) {
    if (!data || busy || conflict) return;
    const request = pending.current || {
      kind,
      etag,
      key: crypto.randomUUID(),
      body: {
        checkedSections: [...checked],
        feedback: kind === "REJECT" ? [] : feedback.map((f) => ({ ...f })),
      },
      reason:
        kind === "REJECT"
          ? [reject.reason, reject.comment.trim()].filter(Boolean).join("\n\n")
          : undefined,
    };
    pending.current = request;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (request.kind === "SAVE") {
        const r = await moderation.save(
          id,
          request.etag,
          request.body,
          request.key,
        );
        if (!r.etag) throw new Error("Сервер не передал новую версию заявки.");
        setEtag(r.etag);
        setData((s) =>
          s ? { ...s, revision: r.data.revision, review: r.data } : s,
        );
        setChecked(r.data.checkedSections);
        setFeedback(r.data.feedback);
        setMessage("Проверка сохранена");
      } else {
        const r = await moderation.decide(
          id,
          request.etag,
          request.kind,
          request.body.feedback,
          request.key,
          request.reason,
        );
        apply(r.data, r.etag);
        setConfirm(null);
        setMessage(
          request.kind === "APPROVE"
            ? "Клуб и выбранные залы одобрены"
            : request.kind === "REJECT"
              ? "Заявка отклонена. Владелец увидит причину отклонения"
              : "Заявка возвращена владельцу с замечаниями",
        );
      }
      pending.current = null;
      setUncertain(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      if (
        e instanceof ApiError &&
        e.status < 500 &&
        e.status !== 408 &&
        e.code !== "IDEMPOTENCY_IN_PROGRESS"
      ) {
        pending.current = null;
        setUncertain(false);
        if (e.status === 412 || e.code === "REVIEW_NOT_PENDING")
          setConflict(true);
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Empty>Загружаем заявку…</Empty>;
  if (!data)
    return (
      <>
        <button className="text-button" onClick={onBack}>
          ← Все заявки
        </button>
        <Notice error>{error}</Notice>
        <button className="button secondary" onClick={load}>
          Повторить загрузку
        </button>
      </>
    );
  const halls = data.snapshot.halls,
    hall = halls.find((h) => h.hallId === hallId) || halls[0];
  const targets: [string, string][] = [
    ...sections.map(
      ([value, label]) => [value, `Раздел: ${label}`] as [string, string],
    ),
    ["profile.name", "Название клуба"],
    ["profile.description", "Описание клуба"],
    ["address", "Адрес и часы работы"],
    ["profile.phone", "Телефон клуба"],
    ["policies.visitingRules", "Правила посещения"],
    ...halls.flatMap(
      (h) =>
        [
          [
            `halls.${h.hallId}.details.equipment`,
            `${h.details.name} · Оборудование`,
          ],
          [`halls.${h.hallId}.layout`, `${h.details.name} · План зала`],
          [`halls.${h.hallId}.tariffs`, `${h.details.name} · Тарифы`],
        ] as [string, string][],
    ),
    ...data.media.map(
      (m, i) =>
        [`photos.${m.mediaId}`, `Фотография ${i + 1}`] as [string, string],
    ),
  ];
  const fieldName = (field: string) =>
    targets.find((t) => t[0] === field)?.[1] || field;
  const canApprove = active && !locked && !dirty && data.review.readyToApprove;
  const canReturn = active && !locked && !dirty && feedback.length > 0;
  const canReject = active && !locked;
  const rejectReady = !!reject.reason &&
    (reject.reason !== "Другое" || !!reject.comment.trim());
  const remark = (field: string) =>
    setNote({ index: null, field, message: "" });
  return (
    <div className="moderation">
      <button className="text-button review-back" onClick={() => leave(onBack)}>
        ← Все заявки
      </button>
      <div className="review-detail-heading">
        <span className="review-logo">{data.clubName.slice(0, 2)}</span>
        <div className="grow">
          <h1>{data.clubName}</h1>
          <p className="sub">{data.address.addressLine}</p>
          <small>
            Заявка #{shortId(id)} · Отправлено {date(data.submittedAt)}
          </small>
        </div>
        <Status value={data.state} />
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setHistory(true)}
        >
          История
        </button>
      </div>
      {error && (
        <Notice error>
          {error}
          {conflict && (
            <p>
              Локальные изменения сохранены на экране. Перечитайте заявку, чтобы
              получить актуальную проверку.
            </p>
          )}
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {(conflict || uncertain) && (
        <div className="review-recovery">
          {uncertain && (
            <>
              <span>
                Ответ не получен. Повтор отправит тот же запрос без двойной
                записи.
              </span>
              <button
                className="button"
                disabled={busy}
                onClick={() => mutate(pending.current!.kind)}
              >
                Повторить запрос
              </button>
            </>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              leave(() => void load());
            }}
          >
            Перечитать заявку
          </button>
        </div>
      )}
      <div className="review-detail-grid">
        <div className="review-body panel">
          <div className="tabs" role="tablist" aria-label="Разделы заявки">
            {sections.map(([value, label]) => (
              <button
                key={value}
                id={`tab-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls="review-tab-content"
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
                {checked.includes(value) && (
                  <span className="review-tab-check"> ✓</span>
                )}
              </button>
            ))}
          </div>
          <div
            className="review-section"
            id="review-tab-content"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            <div className="review-section-heading">
              <h2>{sections.find((s) => s[0] === tab)?.[1]}</h2>
              {active && (
                <button
                  className="text-button"
                  disabled={locked || feedback.length >= 20}
                  onClick={() => remark(tab)}
                >
                  + Замечание к разделу
                </button>
              )}
            </div>
            <SubmissionContent
              data={data}
              tab={tab}
              hall={hall}
              onHall={setHallId}
              onPhoto={setPhoto}
              onRemark={
                active && !locked && feedback.length < 20 ? remark : undefined
              }
            />
          </div>
          {active && (
            <div className="panel-footer review-checked">
              <label className="check">
                <input
                  type="checkbox"
                  checked={checked.includes(tab)}
                  disabled={locked}
                  onChange={(e) => {
                    const isChecked = e.currentTarget.checked;
                    setChecked((c) =>
                      isChecked
                        ? [...c.filter((v) => v !== tab), tab]
                        : c.filter((v) => v !== tab),
                    );
                    setMessage("");
                  }}
                />
                Раздел проверен
              </label>
              <small>Отметка сохранится вместе с проверкой</small>
            </div>
          )}
        </div>
        <aside className="review-inspector">
          <section className="panel panel-pad">
            <h3>{active ? "Проверка заявки" : "Решение по заявке"}</h3>
            {active ? (
              <>
                <div className="review-progress-title">
                  <span>Разделы просмотрены</span>
                  <b>{checked.length} из 6</b>
                </div>
                <progress
                  max={6}
                  value={checked.length}
                  aria-label="Просмотрено разделов"
                />
                <div className="review-checklist">
                  {sections.map(([value, label]) => (
                    <button
                      key={value}
                      className={checked.includes(value) ? "done" : ""}
                      onClick={() => setTab(value)}
                    >
                      <span>{checked.includes(value) ? "✓" : "○"}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="review-result">
                <Status value={data.state} />
                <p>
                  {data.state === "APPROVED"
                    ? "Проверенный снимок клуба и выбранные залы одобрены."
                    : data.state === "CHANGES_REQUESTED"
                      ? "Владелец получил замечания и может отправить новую заявку."
                      : data.state === "REJECTED"
                        ? "Отказ окончательный: заявку нельзя исправить и отправить снова."
                        : "Владелец отозвал заявку."}
                </p>
                {data.state === "REJECTED" && data.rejectionReason && (
                  <div className="review-note review-rejection">
                    <b>{rejectionTitle(data.rejectionReason)}</b>
                    <p>
                      {data.rejectionReason
                        .split("\n")
                        .slice(1)
                        .join("\n")
                        .trim() || "Комментарий не указан"}
                    </p>
                  </div>
                )}
                {data.reviewedAt && (
                  <small>Решение: {date(data.reviewedAt)}</small>
                )}
              </div>
            )}
            <div className="review-notes-heading">
              <h3>
                Замечания · {active ? feedback.length : data.feedback.length}
              </h3>
              {active && (
                <button
                  className="text-button"
                  aria-label="Добавить замечание"
                  disabled={locked || feedback.length >= 20}
                  onClick={() => remark(tab)}
                >
                  ＋
                </button>
              )}
            </div>
            {(active ? feedback : data.feedback).length ? (
              (active ? feedback : data.feedback).map((f, i) => (
                <article className="review-note" key={i}>
                  <b>{fieldName(f.field)}</b>
                  <p>{f.message}</p>
                  {active && (
                    <div className="row">
                      <button
                        className="text-button"
                        aria-label={`Изменить замечание ${i + 1}`}
                        disabled={locked}
                        onClick={() => setNote({ index: i, ...f })}
                      >
                        Изменить
                      </button>
                      <button
                        className="text-button danger-text"
                        aria-label={`Удалить замечание ${i + 1}`}
                        disabled={locked}
                        onClick={() =>
                          setFeedback((v) => v.filter((_, n) => n !== i))
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <div className="review-no-notes">
                <span>✓</span>
                <b>Пока нет замечаний</b>
                <small>
                  Комментарии можно привязать к разделу, залу или фотографии.
                </small>
              </div>
            )}
            {active && (
              <div className="review-actions">
                <button
                  className="button secondary"
                  disabled={!dirty || locked || !etag}
                  onClick={() => mutate("SAVE")}
                >
                  {busy && pending.current?.kind === "SAVE"
                    ? "Сохраняем…"
                    : "Сохранить проверку"}
                </button>
                <small role="status">
                  {dirty
                    ? "Есть несохранённые изменения"
                    : data.review.updatedAt
                      ? `Сохранено ${date(data.review.updatedAt)}`
                      : "Проверка ещё не сохранена"}
                </small>
                <button
                  className="button"
                  disabled={!canApprove}
                  onClick={() => setConfirm("APPROVE")}
                >
                  Одобрить заявку
                </button>
                <button
                  className="button secondary"
                  disabled={!canReturn}
                  onClick={() => setConfirm("REQUEST_CHANGES")}
                >
                  Вернуть на исправление
                </button>
                <small>
                  {dirty
                    ? "Сначала сохраните отметки и замечания."
                    : feedback.length
                      ? "Для одобрения устраните замечания."
                      : checked.length < 6
                        ? "Отметьте все шесть разделов после просмотра."
                        : "Все разделы проверены. Можно принять решение."}
                </small>
                <div className="review-reject">
                  <button
                    className="button danger"
                    disabled={!canReject}
                    onClick={() => {
                      setError("");
                      setReject({ reason: "", comment: "" });
                      setConfirm("REJECT");
                    }}
                  >
                    Отклонить заявку
                  </button>
                  <small>
                    Для дубликатов, недостоверных данных и клубов, которых нет.
                    Отказ окончательный.
                  </small>
                </div>
              </div>
            )}
          </section>
          <p className="review-footnote">
            Решение относится ко всему клубу и {halls.length} выбранным залам.
            Данные зафиксированы на момент отправки. Одобрение само по себе не
            включает приём бронирований.
          </p>
        </aside>
      </div>
      {discard && (
        <Modal title="Несохранённые изменения" onClose={() => setDiscard(null)}>
          <div className="review-modal-body">
            <p>
              Локальные отметки и замечания будут заменены серверными данными.
              Если ответ на запрос не получен, он уже мог сохраниться на
              сервере.
            </p>
            <div className="review-dialog-actions">
              <button
                className="button secondary"
                onClick={() => setDiscard(null)}
              >
                Остаться в заявке
              </button>
              <button
                className="button"
                onClick={() => {
                  const action = discard.action;
                  setDiscard(null);
                  action();
                }}
              >
                Продолжить без сохранения
              </button>
            </div>
          </div>
        </Modal>
      )}
      {note && (
        <Modal
          title={
            note.index === null ? "Добавить замечание" : "Изменить замечание"
          }
          onClose={() => setNote(null)}
        >
          <form
            className="review-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const value = { field: note.field, message: note.message.trim() };
              if (!value.message) return;
              setFeedback((v) =>
                note.index === null
                  ? [...v, value]
                  : v.map((f, i) => (i === note.index ? value : f)),
              );
              setNote(null);
              setMessage("");
            }}
          >
            <label className="field">
              <span>К чему относится замечание</span>
              <select
                aria-label="К чему относится замечание"
                value={note.field}
                onChange={(e) => setNote({ ...note, field: e.target.value })}
              >
                {!targets.some((t) => t[0] === note.field) && (
                  <option value={note.field}>{note.field}</option>
                )}
                {targets.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Что нужно исправить</span>
              <textarea
                aria-label="Что нужно исправить"
                autoFocus
                rows={5}
                maxLength={2000}
                required
                value={note.message}
                onChange={(e) => setNote({ ...note, message: e.target.value })}
                placeholder="Опишите, что владельцу нужно уточнить или исправить"
              />
            </label>
            <small>
              {note.message.length} / 2000 · До отправки решения замечание видно
              только сотрудникам
            </small>
            <div className="review-dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setNote(null)}
              >
                Отмена
              </button>
              <button className="button" disabled={!note.message.trim()}>
                {note.index === null
                  ? "Добавить в проверку"
                  : "Сохранить изменения"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm === "APPROVE"
              ? "Одобрить заявку?"
              : confirm === "REJECT"
                ? "Отклонить заявку?"
                : "Вернуть на исправление?"
          }
          onClose={() => {
            if (!busy && !uncertain) setConfirm(null);
          }}
        >
          <div className="review-modal-body">
            <p>
              <b>{data.clubName}</b> · {halls.length} зал(а)
              {confirm === "REJECT" && data.address.district
                ? ` · ${data.address.district}`
                : ""}
            </p>
            {confirm === "REJECT" ? (
              <>
                <fieldset
                  className="review-reasons"
                  disabled={busy || uncertain}
                >
                  <legend>Причина отказа</legend>
                  {rejectReasons.map((r) => (
                    <label className="check" key={r}>
                      <input
                        type="radio"
                        name="reject-reason"
                        checked={reject.reason === r}
                        onChange={() => setReject({ ...reject, reason: r })}
                      />
                      {r}
                    </label>
                  ))}
                </fieldset>
                <label className="field">
                  <span>Комментарий для владельца · {reject.reason === "Другое" ? "обязательно" : "необязательно"}</span>
                  <textarea
                    aria-label="Комментарий для владельца"
                    rows={4}
                    maxLength={1000}
                    required={reject.reason === "Другое"}
                    disabled={busy || uncertain}
                    value={reject.comment}
                    onChange={(e) =>
                      setReject({ ...reject, comment: e.target.value })
                    }
                    placeholder="Объясните владельцу, почему заявка отклонена"
                  />
                </label>
                <small>
                  {reject.comment.length} / 1000 · Владелец увидит причину и
                  комментарий дословно
                </small>
                <div className="review-warning">
                  <b>Отказ окончательный</b>
                  <p>
                    Эту заявку нельзя исправить и отправить снова — для ошибок,
                    которые можно поправить, используйте «Вернуть на
                    исправление». Клуб и залы не публикуются; решение попадёт в
                    журнал действий.
                  </p>
                </div>
              </>
            ) : (
              <p>
                {confirm === "APPROVE"
                  ? "Будет опубликован проверенный снимок клуба и выбранных залов. Видимость зависит от категорий и рынка. Приём бронирований настраивается отдельно."
                  : `Владелец получит замечания (${feedback.length}) и сможет исправить данные, затем отправить новую заявку.`}
              </p>
            )}
            {confirm === "REQUEST_CHANGES" &&
              feedback.map((f, i) => (
                <div className="review-note" key={i}>
                  <b>{fieldName(f.field)}</b>
                  <p>{f.message}</p>
                </div>
              ))}
            {error && <Notice error>{error}</Notice>}
            <div className="review-dialog-actions">
              <button
                className="button secondary"
                disabled={busy || uncertain}
                onClick={() => setConfirm(null)}
              >
                Отмена
              </button>
              <button
                className={confirm === "REJECT" ? "button danger" : "button"}
                disabled={
                  busy ||
                  conflict ||
                  (confirm === "REJECT" && !uncertain && !rejectReady)
                }
                onClick={() => mutate(confirm)}
              >
                {busy
                  ? "Отправляем…"
                  : uncertain
                    ? "Повторить тот же запрос"
                    : confirm === "APPROVE"
                      ? "Подтвердить одобрение"
                      : confirm === "REJECT"
                        ? "Отклонить заявку"
                        : "Отправить замечания"}
              </button>
            </div>
            {conflict && (
              <button
                className="text-button"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                Вернуться к заявке
              </button>
            )}
          </div>
        </Modal>
      )}
      {history && (
        <History
          id={id}
          onClose={() => setHistory(false)}
          onOpen={(next) => {
            setHistory(false);
            if (next !== id) leave(() => onOpen(next));
          }}
        />
      )}
      {photo && (
        <Modal title="Фотография заявки" onClose={() => setPhoto(null)}>
          <div className="review-lightbox">
            <Photo
              submission={id}
              mediaId={photo}
              alt="Фотография из отправленной заявки"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function History({
  id,
  onClose,
  onOpen,
}: {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(0),
    [data, setData] = useState<Page<Card> | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    moderation
      .history(id, page)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [id, page, attempt]);
  return (
    <Modal title="История отправок" onClose={onClose}>
      <div className="review-modal-body">
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <button
              className="button secondary"
              onClick={() => setAttempt((v) => v + 1)}
            >
              Повторить
            </button>
          </>
        ) : !data ? (
          <Empty>Загружаем историю…</Empty>
        ) : (
          data.items.map((s) => (
            <article className="review-history-item" key={s.submissionId}>
              <div className="review-card-title">
                <b>
                  Заявка #{shortId(s.submissionId)}{" "}
                  {id === s.submissionId && "· Текущая"}
                </b>
                <Status value={s.state} />
              </div>
              <small>Отправлена {date(s.submittedAt)}</small>
              {s.reviewedAt && <small>Решение {date(s.reviewedAt)}</small>}
              {s.feedback.map((f, i) => (
                <p key={i}>{f.message}</p>
              ))}
              <button
                className="text-button"
                onClick={() => onOpen(s.submissionId)}
              >
                Открыть заявку →
              </button>
            </article>
          ))
        )}
      </div>
      {data && (
        <Pager page={page} total={data.total} size={10} onPage={setPage} />
      )}
    </Modal>
  );
}

function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="review-kv">
      <dt>{label}</dt>
      <dd>{children ?? "Не указано"}</dd>
    </div>
  );
}
function Block({
  title,
  children,
  onRemark,
}: {
  title: string;
  children: ReactNode;
  onRemark?: () => void;
}) {
  return (
    <section className="review-block">
      <div className="review-section-heading">
        <h3>{title}</h3>
        {onRemark && (
          <button className="text-button" onClick={onRemark}>
            + Замечание
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
function SubmissionContent({
  data,
  tab,
  hall,
  onHall,
  onPhoto,
  onRemark,
}: {
  data: Submission;
  tab: Section;
  hall?: Hall;
  onHall: (id: string) => void;
  onPhoto: (id: string) => void;
  onRemark?: (field: string) => void;
}) {
  const { profile, address, policies, halls, menu } = data.snapshot;
  const remark = (field: string) =>
    onRemark ? () => onRemark(field) : undefined;
  const photoGrid = (ids: string[]) => (
    <div className="review-photo-grid">
      {ids.map((id, i) => (
        <figure key={id}>
          <div className="review-photo">
            <Photo
              submission={data.submissionId}
              mediaId={id}
              alt={`Фото ${i + 1}`}
              onOpen={() => onPhoto(id)}
            />
          </div>
          <figcaption>
            <span>Фото {i + 1}</span>
            {onRemark && (
              <button
                className="text-button"
                onClick={() => onRemark(`photos.${id}`)}
              >
                + Замечание
              </button>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
  const hallSwitch = (
    <div className="chips review-hall-switch">
      {halls.map((h) => (
        <button
          key={h.hallId}
          className={hall?.hallId === h.hallId ? "selected" : ""}
          onClick={() => onHall(h.hallId)}
        >
          {h.details.name}
        </button>
      ))}
    </div>
  );
  if (tab === "club")
    return (
      <>
        <Block title="О клубе" onRemark={remark("profile.description")}>
          <dl>
            <KV label="Название">{profile.name}</KV>
            <KV label="Описание">
              <span className="review-prose">{profile.description}</span>
            </KV>
            <KV label="Телефон">{profile.phone}</KV>
            <KV label="Email">{profile.email}</KV>
          </dl>
        </Block>
        <Block title="Адрес и часы работы" onRemark={remark("address")}>
          <dl>
            <KV label="Адрес">{address.addressLine}</KV>
            <KV label="Район">{address.district}</KV>
            <KV label="Координаты">
              {address.latitude != null && address.longitude != null
                ? `${address.latitude}, ${address.longitude}`
                : null}
            </KV>
            <KV label="Часовой пояс">{address.timezone}</KV>
          </dl>
          <div className="review-hours">
            {days.map((day, i) => {
              const hours = address.weeklyHours.filter(
                (v) => v.dayOfWeek === i + 1,
              );
              return (
                <div key={day}>
                  <span>{day}</span>
                  <b>
                    {hours.length
                      ? hours
                          .map(
                            (h) =>
                              `${h.opens.slice(0, 5)}–${h.closes.slice(0, 5)}${h.endDayOffset ? " (+1 день)" : ""}`,
                          )
                          .join(", ")
                      : "Выходной"}
                  </b>
                </div>
              );
            })}
          </div>
        </Block>
        <Block title={`Отправлено залов · ${halls.length}`}>
          <div className="review-hall-list">
            {halls.map((h) => (
              <div key={h.hallId}>
                <b>{h.details.name}</b>
                <small>
                  {h.categoryTitle} · {h.layout.placements.length} единиц
                  бронирования
                </small>
              </div>
            ))}
          </div>
        </Block>
      </>
    );
  if (tab === "photos") {
    const groups: [string, string[]][] = [
      ["Логотип", profile.logoMediaId ? [profile.logoMediaId] : []],
      ["Обложка", profile.coverMediaId ? [profile.coverMediaId] : []],
      ["Галерея клуба", profile.galleryMediaIds || []],
      ...halls.map(
        (h) =>
          [`Зал · ${h.details.name}`, h.details.photoMediaIds || []] as [
            string,
            string[],
          ],
      ),
      [
        "Меню",
        menu.catalog.items.flatMap((i) => (i.mediaId ? [i.mediaId] : [])),
      ],
    ];
    return (
      <>
        {groups
          .filter(([, ids]) => ids.length)
          .map(([name, ids]) => (
            <Block key={name} title={name}>
              {photoGrid([...new Set(ids)])}
            </Block>
          ))}
        {!data.media.length && (
          <Empty>В отправленной заявке нет фотографий.</Empty>
        )}
      </>
    );
  }
  if (tab === "halls")
    return (
      <>
        {hallSwitch}
        {hall ? (
          <>
            <Block
              title={hall.details.name}
              onRemark={remark(`halls.${hall.hallId}.details.equipment`)}
            >
              <dl>
                <KV label="Категория">{hall.categoryTitle}</KV>
                <KV label="Тип бронирования">
                  {{ SEAT: "Место", BOX: "Бокс", ZONE: "Зона" }[
                    hall.bookingUnit
                  ] || hall.bookingUnit}
                </KV>
                <KV label="Описание">{hall.details.description}</KV>
                <KV label="Оборудование">
                  <span className="review-prose">{hall.details.equipment}</span>
                </KV>
                <KV label="Человек на единицу">
                  {hall.details.capacityPerUnit}
                </KV>
              </dl>
              {photoGrid(hall.details.photoMediaIds || [])}
            </Block>
            <Block
              title="План зала"
              onRemark={remark(`halls.${hall.hallId}.layout`)}
            >
              <small>
                {hall.layout.columns} колонок × {hall.layout.rows} рядов ·{" "}
                {hall.layout.placements.length} мест · Вход:{" "}
                {{
                  TOP: "сверху",
                  BOTTOM: "снизу",
                  LEFT: "слева",
                  RIGHT: "справа",
                }[hall.layout.entranceSide || ""] || "не указан"}
              </small>
              <div className="review-floor-scroll">
                <div
                  className="review-floor"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, hall.layout.columns)}, 48px)`,
                    minHeight: Math.max(1, hall.layout.rows) * 54,
                  }}
                >
                  {hall.layout.placements.map((p) => (
                    <div
                      className="review-seat"
                      title={`${p.code}: ряд ${p.row + 1}, колонка ${p.column + 1}, направление ${p.facing}`}
                      key={p.resourceId}
                      style={{ gridColumn: p.column + 1, gridRow: p.row + 1 }}
                    >
                      <span>
                        {
                          { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→" }[
                            p.facing
                          ]
                        }
                      </span>
                      <b>{p.code}</b>
                    </div>
                  ))}
                </div>
              </div>
            </Block>
            <Block title="Игры">
              <div className="review-games">
                {hall.games.map((g) => (
                  <span key={g.gameId}>{g.title}</span>
                ))}
              </div>
              {!hall.games.length && <small>Игры не указаны</small>}
            </Block>
          </>
        ) : (
          <Empty>В заявке нет залов.</Empty>
        )}
      </>
    );
  if (tab === "tariffs")
    return (
      <>
        {hallSwitch}
        {hall?.tariffs.length ? (
          hall.tariffs.map((t) => (
            <Block
              key={t.versionId}
              title={`Версия ${t.revision} · с ${t.effectiveFrom}`}
              onRemark={remark(`halls.${hall.hallId}.tariffs`)}
            >
              <dl>
                <KV label="Базовая цена в час">
                  {money(t.plan.baseHourlyMinor, t.plan.currency)}
                </KV>
                <KV label="Часовой пояс">{t.timezone}</KV>
              </dl>
              {[...t.plan.rates, ...t.plan.offers].map((r) => (
                <article className="review-tariff" key={r.id}>
                  <div className="review-card-title">
                    <b>{r.name}</b>
                    <b>{money(r.amountMinor, t.plan.currency)}</b>
                  </div>
                  <small>
                    {r.date ||
                      r.days?.map((d) => days[d - 1]).join(", ") ||
                      "Все дни"}{" "}
                    · {minute(r.startMinute)}–{minute(r.endMinute)}
                    {r.endMinute <= r.startMinute ? " (+1 день)" : ""}
                  </small>
                  {r.kind && (
                    <small>
                      {{
                        DURATION_PACK: "Пакет часов",
                        NIGHT_PACK: "Ночной пакет",
                        SESSION: "Сеанс",
                      }[r.kind] || r.kind}{" "}
                      ·{" "}
                      {r.basis === "PER_PERSON"
                        ? "за человека"
                        : "за единицу бронирования"}
                      {r.durationMinutes ? ` · ${r.durationMinutes} мин.` : ""}
                    </small>
                  )}
                </article>
              ))}
              {!t.plan.rates.length && !t.plan.offers.length && (
                <small>Дополнительных правил и пакетов нет</small>
              )}
            </Block>
          ))
        ) : (
          <Empty>Тарифы в заявке не указаны.</Empty>
        )}
      </>
    );
  if (tab === "menu")
    return menu.catalog.items.length ? (
      <div className="review-menu-list">
        {menu.catalog.items.map((item) => (
          <article className="review-menu-item" key={item.id}>
            {item.mediaId && (
              <div className="review-photo">
                <Photo
                  submission={data.submissionId}
                  mediaId={item.mediaId}
                  alt={item.name}
                  onOpen={() => onPhoto(item.mediaId!)}
                />
              </div>
            )}
            <div>
              <div className="review-card-title">
                <h3>{item.name}</h3>
                <b>
                  {item.pricing === "INCLUDED"
                    ? "Включено"
                    : money(item.amountMinor, menu.catalog.currency)}
                </b>
              </div>
              <p>{item.description}</p>
              <small>
                {{
                  FOOD: "Еда",
                  DRINK: "Напитки",
                  EQUIPMENT: "Оборудование",
                  SERVICE: "Услуга",
                  OTHER: "Другое",
                }[item.kind] || item.kind}{" "}
                · {item.unit} · Макс. {item.maxQuantity}
                {item.state === "UNAVAILABLE" ? " · Недоступно" : " · Доступно"}
              </small>
              <small>
                {item.categoryIds.length
                  ? halls
                      .filter((h) =>
                        item.categoryIds.includes(h.details.categoryId),
                      )
                      .map((h) => h.details.name)
                      .join(", ") || "Для выбранных категорий"
                  : "Для всех категорий клуба"}
              </small>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty>Владелец не добавил позиции меню.</Empty>
    );
  return (
    <>
      <Block
        title="Правила посещения"
        onRemark={remark("policies.visitingRules")}
      >
        <p className="review-prose">{policies.visitingRules || "Не указаны"}</p>
      </Block>
      <Block title="Способы оплаты" onRemark={remark("policies")}>
        <dl>
          <KV label="Оплата на месте">{policies.payOnSite ? "Да" : "Нет"}</KV>
          <KV label="Онлайн-оплата">{policies.onlinePayment ? "Да" : "Нет"}</KV>
        </dl>
      </Block>
    </>
  );
}
function minute(value: number) {
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
