import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  aside?: ReactNode;
}

export function TextField({ label, error, hint, aside, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input${error ? " invalid" : ""}`}>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
      </div>
      {(error || hint || aside) && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          {error ? (
            <span className="err" id={`${id}-err`} role="alert">
              {error}
            </span>
          ) : (
            <span className="hint" id={`${id}-hint`}>
              {hint}
            </span>
          )}
          {aside}
        </div>
      )}
    </div>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  aside,
  ...input
}: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input${error ? " invalid" : ""}`}>
        <input
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          spellCheck={false}
          autoCapitalize="off"
          {...input}
        />
        <button
          type="button"
          className="adorn"
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          <img src="/assets/login-imgIconS4.svg" alt="" />
        </button>
      </div>
      {(error || hint || aside) && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          {error ? (
            <span className="err" id={`${id}-err`} role="alert">
              {error}
            </span>
          ) : (
            <span className="hint" id={`${id}-hint`}>
              {hint}
            </span>
          )}
          {aside}
        </div>
      )}
    </div>
  );
}
