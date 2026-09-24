"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AssistantSettings } from "../../lib/settings/model";
import { voiceIdError } from "../../lib/settings/model";

type Desk = {
  settings: AssistantSettings;
  elevenLabs: boolean;
  canSave: boolean;
};

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [desk, setDesk] = useState<Desk | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    if (response.status === 401) {
      setAuthed(false);
      setReady(true);
      return;
    }
    const body = (await response.json()) as Desk & { ok?: boolean; message?: string };
    if (!response.ok || !body.settings) {
      setMessage(body.message || "تعذر فتح اللوحة.");
      setReady(true);
      return;
    }
    setDesk(body);
    setAuthed(true);
    setReady(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = (await response.json()) as { message?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(body.message || "تعذر الدخول.");
      return;
    }
    setPassword("");
    await load();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!desk) return;
    const voiceError = voiceIdError(desk.settings.voiceId);
    if (voiceError) {
      setMessage(voiceError);
      return;
    }
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(desk.settings),
    });
    const body = (await response.json()) as { message?: string };
    setPending(false);
    setMessage(response.ok ? "تم الحفظ، بما فيه رمز الصوت. المكالمة الجاية تستخدمه." : body.message || "تعذر الحفظ.");
  }

  function patch(key: keyof AssistantSettings, value: string) {
    setDesk((current) => (current ? { ...current, settings: { ...current.settings, [key]: value } } : current));
  }

  return (
    <main className="call-shell">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-5 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">إدارة نورة</h1>
          <a className="text-sm text-teal" href="/">
            المكالمة
          </a>
        </div>
        {!ready ? <p className="text-muted">جار التحميل…</p> : null}
        {ready && !authed ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => void login(event)}>
            <label className="text-sm text-muted" htmlFor="password">
              كلمة مرور الإدارة
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-2xl border border-fg/15 bg-fg/5 px-4 py-3 text-fg"
            />
            <button type="submit" disabled={pending} className="rounded-full bg-teal px-4 py-3 text-bg disabled:opacity-50">
              دخول
            </button>
          </form>
        ) : null}
        {desk && authed ? (
          <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
            <label className="flex flex-col gap-2 rounded-3xl border border-teal/40 bg-teal/10 p-4 text-sm text-muted">
              رمز صوت ElevenLabs
              <input
                dir="ltr"
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={desk.settings.voiceId}
                onChange={(event) => patch("voiceId", event.target.value)}
                className="rounded-2xl border border-fg/15 bg-bg px-4 py-3 text-left font-mono text-base tracking-wide text-fg"
              />
              <span>الصوت الحالي للمكالمة: {desk.settings.voiceId.trim() || "غير محدد"}</span>
            </label>
            <Field label="الهوك" value={desk.settings.hook} onChange={(value) => patch("hook", value)} />
            <Field label="اللهجة" value={desk.settings.dialect} onChange={(value) => patch("dialect", value)} />
            <Field label="النظام" value={desk.settings.system} onChange={(value) => patch("system", value)} />
            <p className="text-sm text-muted">
              {desk.elevenLabs
                ? "صوت ElevenLabs مفعّل في هذا النشر."
                : "أضف ELEVENLABS_API_KEY ثم أعد النشر حتى يشتغل هذا الصوت. إلى ذلك الحين المكالمة تبقى بصوت Gemini."}
            </p>
            {!desk.canSave ? (
              <p className="text-sm text-muted">لحفظ التعديلات أضف SETTINGS_GITHUB_TOKEN ثم أعد النشر.</p>
            ) : null}
            <button type="submit" disabled={pending} className="rounded-full bg-teal px-4 py-3 text-bg disabled:opacity-50">
              حفظ
            </button>
            <button
              type="button"
              className="text-sm text-muted"
              onClick={() => void fetch("/api/admin/logout", { method: "POST" }).then(() => {
                setAuthed(false);
                setDesk(null);
              })}
            >
              خروج
            </button>
          </form>
        ) : null}
        {message ? <p className="text-sm text-fg">{message}</p> : null}
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={label === "النظام" ? 8 : 4}
        className="rounded-2xl border border-fg/15 bg-fg/5 px-4 py-3 leading-relaxed text-fg"
      />
    </label>
  );
}
