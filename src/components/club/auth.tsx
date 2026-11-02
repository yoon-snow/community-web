"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useApp, api, Field, Back, PageTitle } from "./core";

type Mode = "signin" | "signup" | "request-reset" | "update-password";
export function AuthPanel({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { boot, link, offline } = useApp();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const update = mode === "update-password";
  const disabled =
    busy ||
    !boot.configured ||
    boot.preview ||
    offline ||
    (update && !boot.user);
  const changeMode = (next: Mode) => {
    setMode(next);
    setError("");
    setMessage("");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || !event.currentTarget.reportValidity()) return;
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    const data = Object.fromEntries(fields.entries());
    if (
      (mode === "signup" || update) &&
      data.password !== data.password_confirm
    ) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      form.reset();
      if (
        result.next &&
        ["/", "/admin", "/join", "/account?password=updated"].includes(
          result.next,
        )
      )
        window.location.assign(result.next);
      else setMessage(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-card card">
      <span className="login-symbol">
        <img
          src="/branding/spotlight-logo-transparent.png"
          alt="SpotLight Volleyball Club 공식 로고"
          width={160}
          height={169}
        />
      </span>
      <h2>
        {mode === "signup"
          ? "SpotLight 계정 만들기"
          : mode === "request-reset"
            ? "비밀번호를 잊으셨나요?"
            : update
              ? "새 비밀번호 설정"
              : "SpotLight 로그인"}
      </h2>
      <p>
        {mode === "signup"
          ? "계정을 만든 뒤 회원가입 신청을 작성해주세요. 회원 기능은 운영진 승인 후 활성화됩니다."
          : mode === "request-reset"
            ? "가입한 이메일 주소로 비밀번호 재설정 안내를 보내드려요."
            : update
              ? "새 비밀번호를 설정한 뒤 다시 로그인해주세요."
              : "이메일과 비밀번호로 로그인하세요. 회원·운영진 권한은 승인된 계정에만 적용됩니다."}
      </p>
      {mode !== "update-password" && mode !== "request-reset" && (
        <div className="button-row" role="group" aria-label="계정 메뉴">
          <button
            type="button"
            className={`button ${mode === "signin" ? "primary" : "secondary"}`}
            disabled={busy}
            onClick={() => changeMode("signin")}
          >
            로그인
          </button>
          <button
            type="button"
            className={`button ${mode === "signup" ? "primary" : "secondary"}`}
            disabled={busy}
            onClick={() => changeMode("signup")}
          >
            계정 만들기
          </button>
        </div>
      )}
      {!boot.configured && (
        <p className="hint">로그인 서비스 연결을 준비 중입니다.</p>
      )}
      {boot.preview && (
        <p className="micro">
          미리보기에서는 계정을 생성하거나 로그인하지 않습니다.
        </p>
      )}
      {update && !boot.user && (
        <p className="form-error">
          재설정 메일의 링크를 다시 열어주세요. 만료되었다면 새 메일을 요청할 수
          있습니다.
        </p>
      )}
      <form className="form" key={mode} onSubmit={submit}>
        {!update && (
          <Field
            label="이메일"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />
        )}
        {mode !== "request-reset" && (
          <Field
            label={update ? "새 비밀번호" : "비밀번호"}
            name="password"
            type="password"
            required
            minLength={mode === "signin" ? 1 : 12}
            maxLength={mode === "signin" ? 1024 : 128}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            hint={mode === "signin" ? undefined : "12자 이상 입력해주세요."}
            disabled={busy}
          />
        )}
        {(mode === "signup" || update) && (
          <Field
            label="비밀번호 확인"
            name="password_confirm"
            type="password"
            required
            maxLength={128}
            autoComplete="new-password"
            disabled={busy}
          />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
        <button className="button primary full" disabled={disabled}>
          <LockKeyhole size={17} />
          {busy
            ? "확인 중…"
            : mode === "signin"
              ? "이메일로 로그인"
              : mode === "signup"
                ? "계정 생성하기"
                : update
                  ? "비밀번호 저장"
                  : "재설정 메일 보내기"}
        </button>
      </form>
      {mode === "signin" && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => changeMode("request-reset")}
        >
          비밀번호 재설정
        </button>
      )}
      {(mode === "request-reset" || update) && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => changeMode("signin")}
        >
          로그인으로 돌아가기
        </button>
      )}
      {update && !boot.user && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => changeMode("request-reset")}
        >
          재설정 메일 다시 요청하기
        </button>
      )}
      <Link href={link("/calendar")} className="text-button">
        로그인 없이 일정 둘러보기
        <ArrowRight size={15} />
      </Link>
    </div>
  );
}

export function ResetPasswordScreen() {
  return (
    <>
      <Back href="/account" label="로그인" />
      <PageTitle title="비밀번호 재설정" />
      <AuthPanel initialMode="update-password" />
    </>
  );
}
