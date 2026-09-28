import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router";
import { api, auth, type Session } from "./api";
import { Brand, Asset, Notice } from "./ui";
import { TextField, PasswordField } from "./Field";
type Challenge = {
  challengeToken: string;
  nextStep: string;
  secret?: string;
  otpAuthUri?: string;
};
export function Auth() {
  const navigate = useNavigate();
  const [minimumPasswordLength, setMinimumPasswordLength] = useState(12);
  useEffect(() => {
    api<{ minimumPasswordLength: number }>("/auth/policy")
      .then((p) => setMinimumPasswordLength(p.minimumPasswordLength))
      .catch(() => {});
  }, []);
  const [token] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const [step, setStep] = useState(
    location.pathname.includes("invite")
      ? "invite"
      : location.pathname.includes("reset")
        ? "reset"
        : "login",
  );
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState<Challenge | null>(null),
    [qr, setQr] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [readySession, setReadySession] = useState<Session | null>(null),
    [saved, setSaved] = useState(false),
    [recovery, setRecovery] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  useEffect(() => {
    if (location.hash) history.replaceState(null, "", location.pathname);
  }, []);
  useEffect(() => {
    let live = true;
    if (challenge?.otpAuthUri)
      QRCode.toDataURL(challenge.otpAuthUri, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: "M",
      }).then((x) => {
        if (live) setQr(x);
      });
    return () => {
      live = false;
    };
  }, [challenge]);
  const enter = (s: Session) => {
    auth.set(s);
    navigate("/", { replace: true });
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    setBusy(true);
    try {
      if (step === "login" || step === "invite") {
        if (
          step === "invite" &&
          (!token || new TextEncoder().encode(password).length > 72)
        )
          throw new Error(
            !token
              ? "Ссылка приглашения недействительна."
              : "Пароль должен занимать не более 72 байт.",
          );
        const c = await api<Challenge>(
          step === "login" ? "/auth/login" : "/auth/invitations/accept",
          "POST",
          step === "login" ? { email, password } : { token, password, name },
        );
        setChallenge(c);
        setPassword("");
        setStep(c.nextStep === "ENROLL" ? "enroll" : "verify");
      } else if (step === "verify")
        enter(
          await api<Session>("/auth/mfa/verify", "POST", {
            challengeToken: challenge?.challengeToken,
            code,
          }),
        );
      else if (step === "enroll") {
        const r = await api<{ session: Session; recoveryCodes: string[] }>(
          "/auth/mfa/enroll",
          "POST",
          { challengeToken: challenge?.challengeToken, code },
        );
        setReadySession(r.session);
        setCodes(r.recoveryCodes);
        setChallenge(null);
        setQr("");
        setCode("");
        setStep("codes");
      } else if (step === "forgot") {
        await api("/auth/password/reset-request", "POST", { email });
        setNote(
          "Если такой сотрудник зарегистрирован, мы отправили письмо для восстановления.",
        );
      } else if (step === "reset") {
        await api("/auth/password/reset", "POST", { token, password, code });
        setPassword("");
        setCode("");
        setStep("login");
        setNote("Пароль изменён. Войдите с новым паролем.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    login: "Вход",
    invite: "Присоединиться к команде",
    verify: recovery ? "Резервный код" : "Код из приложения",
    enroll: "Подключите приложение",
    codes: "Сохраните резервные коды",
    forgot: "Восстановить пароль",
    reset: "Новый пароль",
  };
  return (
    <main className="auth">
      <section className="auth-hero">
        <img className="hero-photo" src="/assets/login-imgImg.png" alt="" />
        <div className="hero-shade" />
        <Brand auth />
        <div className="hero-copy">
          <h1>
            Модерация, каталог и бизнес
            <br />
            платформы — в одном окне
          </h1>
          <p>
            Проверяйте клубы до публикации, ведите справочники, согласуйте
            рекламу и следите за подписками. Каждое действие сотрудника попадает
            в журнал.
          </p>
          <div className="pills">
            {[
              "Вход только с 2FA",
              "Доступ по приглашению",
              "Журнал всех решений",
            ].map((v, i) => (
              <span key={v}>
                <Asset screen="login" name={"imgIconS" + (i || "")} />
                {v}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="auth-side">
        <div className="auth-top">
          <button
            className="text-button"
            onClick={() => {
              setStep("login");
              setError("");
              setCode("");
              setChallenge(null);
            }}
          >
            ‹ {step === "login" ? "Панель платформы" : "Вернуться ко входу"}
          </button>
          <span>
            <Asset screen="login" name="imgIconS3" /> Русский
          </span>
        </div>
        <form onSubmit={submit} className="auth-form">
          <div className="eyebrow">
            {["verify", "enroll"].includes(step)
              ? "ШАГ 2 ИЗ 3"
              : "ПАНЕЛЬ ПЛАТФОРМЫ"}
          </div>
          <h2>{titles[step]}</h2>
          <p className="sub">
            {step === "login"
              ? "Войдите с рабочей почтой. Доступ только для сотрудников платформы."
              : step === "enroll"
                ? "Отсканируйте QR-код в Google Authenticator, 1Password или другом приложении с кодами TOTP."
                : step === "verify"
                  ? "Откройте приложение, где подключён Bronuz Admin."
                  : step === "codes"
                    ? "Каждый код можно использовать один раз. Храните их в надёжном месте."
                    : "Доступ к панели выдаёт владелец платформы."}
          </p>
          {error && <Notice error>{error}</Notice>}
          {note && <Notice>{note}</Notice>}
          {["login", "forgot"].includes(step) && (
            <TextField
              label="Рабочая почта"
              type="email"
              autoComplete="username"
              placeholder="name@bronuz.uz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          )}
          {step === "invite" && (
            <TextField
              label="Ваше имя"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          )}
          {["login", "invite", "reset"].includes(step) && (
            <PasswordField
              label="Пароль"
              autoComplete={
                step === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={step === "login" ? 1 : minimumPasswordLength}
              hint={
                step === "login"
                  ? undefined
                  : `От ${minimumPasswordLength} символов, максимум 72 байта.`
              }
              aside={
                step === "login" ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep("forgot")}
                  >
                    Забыли пароль?
                  </button>
                ) : undefined
              }
            />
          )}
          {step === "enroll" && (
            <div className="enrollment">
              {qr && (
                <img
                  src={qr}
                  alt="QR-код для подключения двухфакторной проверки"
                />
              )}
              <div>
                <b>НЕ СКАНИРУЕТСЯ?</b>
                <p>Введите ключ вручную:</p>
                <code>{challenge?.secret}</code>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(challenge?.secret || "")
                      .then(() => setNote("Ключ скопирован."))
                      .catch(() => setError("Скопируйте ключ вручную."))
                  }
                >
                  Скопировать ключ
                </button>
              </div>
            </div>
          )}
          {["enroll", "verify", "reset"].includes(step) && (
            <TextField
              label={recovery ? "Резервный код" : "Код из приложения"}
              className={recovery ? "" : "otp"}
              inputMode={recovery ? "text" : "numeric"}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              maxLength={recovery ? 100 : 6}
              pattern={recovery ? undefined : "[0-9]{6}"}
              required
            />
          )}
          {step === "codes" ? (
            <>
              <div className="recovery-codes">
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([codes.join("\n")], { type: "text/plain" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "bronuz-recovery-codes.txt";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Скачать коды
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                />
                Я сохранил резервные коды
              </label>
              <button
                className="button"
                type="button"
                disabled={!saved}
                onClick={() => readySession && enter(readySession)}
              >
                Перейти в панель
              </button>
            </>
          ) : (
            <button className="button" disabled={busy}>
              {busy
                ? "Подождите…"
                : step === "verify"
                  ? "Войти"
                  : step === "enroll"
                    ? "Подтвердить"
                    : step === "forgot"
                      ? "Отправить письмо"
                      : "Продолжить"}
            </button>
          )}
          {["verify", "reset"].includes(step) && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRecovery(!recovery);
                setCode("");
              }}
            >
              {recovery
                ? "Использовать код приложения"
                : "Ввести резервный код"}
            </button>
          )}
          {step === "login" && (
            <Notice>
              Нет доступа? Попросите владельца платформы отправить приглашение
              на вашу рабочую почту.
            </Notice>
          )}
        </form>
        <small className="auth-foot">
          Без 2FA вход в панель закрыт для всех ролей
        </small>
      </section>
    </main>
  );
}
