"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic2, Pencil, Play, Plus, Save, Square, Trash2, Volume2, X } from "lucide-react";
import styles from "./Soundboard.module.css";
import { audioCacheKey, getCachedAudio, parseSavedPhrases, putCachedAudio, saveSavedPhrases, type SavedPhrase } from "../../lib/soundboard/storage";
import { validatePhraseText } from "../../lib/soundboard/validation";

const DEFAULT_PHRASES = [
  "غطّني، بدخل عليهم من اليمين.",
  "واحد فوق السطح، انتبهوا له.",
  "لا تستعجلون، خلّونا نمسك الموقع أول.",
  "يا سلام عليك، جبتها في آخر ثانية.",
  "وراكم واحد، لا تخلونه يلف علينا.",
  "خذوا الذخيرة، باقي معنا قيم طويل.",
  "هدّوا شوي، نسمع خطواتهم.",
  "كفو يا وحش، كذا اللعب ولا بلاش.",
  "خلّ السلاح جاهز، شكلهم راجعين.",
  "أنا أغطيكم، تقدّموا أنتم.",
];

function createDefaults(): SavedPhrase[] {
  const now = Date.now();
  return DEFAULT_PHRASES.map((text, index) => ({ id: `default-${index + 1}`, text, createdAt: now + index, updatedAt: now + index }));
}

export function Soundboard() {
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeText, setActiveText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [manualPlay, setManualPlay] = useState(false);
  const [message, setMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [cacheVersion, setCacheVersion] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let loaded: SavedPhrase[];
    try {
      const parsed = parseSavedPhrases(localStorage.getItem("noora.soundboard.phrases.v1"));
      if (parsed === null) {
        setStorageWarning("تعذر قراءة العبارات المحفوظة؛ بدأنا بقائمة جديدة.");
        loaded = createDefaults();
      } else if (localStorage.getItem("noora.soundboard.phrases.v1") === null) {
        loaded = createDefaults();
        saveSavedPhrases(loaded);
      } else loaded = parsed;
    } catch {
      setStorageWarning("التخزين المحلي غير متاح؛ التغييرات الحالية مؤقتة.");
      loaded = createDefaults();
    }
    setPhrases(loaded);
    void fetch("/api/elevenlabs/speak", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("cache settings unavailable");
      const body = (await response.json()) as { cacheVersion?: string };
      if (body.cacheVersion) setCacheVersion(body.cacheVersion);
    }).catch(() => setStorageWarning((current) => current || "التخزين الصوتي غير متاح؛ ستعمل الأصوات بدون حفظ مؤقت."));
  }, []);

  const stopAudio = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setAudioUrl(null);
    setGenerating(false);
    setPlaying(false);
    setManualPlay(false);
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const playText = useCallback(async (raw: string) => {
    const valid = validatePhraseText(raw);
    if (valid.error) { setMessage(valid.error); return; }
    stopAudio();
    const generation = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveText(valid.text);
    setMessage("");
    setGenerating(true);
    let blob: Blob | null = null;
    const key = cacheVersion ? audioCacheKey(cacheVersion, valid.text) : "";
    if (key) {
      try { blob = await getCachedAudio(key); }
      catch { setStorageWarning("تعذر الوصول إلى التخزين الصوتي؛ جارٍ توليد الصوت مباشرة."); }
      if (generation !== generationRef.current) return;
    }
    if (!blob) {
      try {
        const response = await fetch("/api/elevenlabs/speak", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: valid.text }), signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { message?: string } | null;
          if (generation !== generationRef.current) return;
          throw new Error(body?.message || "تعذر توليد الصوت. حاول مرة ثانية.");
        }
        blob = await response.blob();
        if (generation !== generationRef.current) return;
        if (blob.size === 0) throw new Error("وصل ملف صوت فارغ؛ جرّب العبارة مرة ثانية.");
        if (key) {
          try { await putCachedAudio(key, blob); }
          catch { setStorageWarning("تعذر حفظ الصوت مؤقتًا؛ تقدر تسمعه الآن."); }
          if (generation !== generationRef.current) return;
        }
      } catch (error) {
        if (generation !== generationRef.current || controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "تعذر توليد الصوت. حاول مرة ثانية.");
        setGenerating(false);
        return;
      }
    }
    if (generation !== generationRef.current || !blob) return;
    if (blob.size === 0) {
      setGenerating(false);
      setMessage("وصل ملف صوت فارغ؛ جرّب العبارة مرة ثانية.");
      return;
    }
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    setAudioUrl(url);
    setGenerating(false);
  }, [cacheVersion, stopAudio]);

  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;
    void audioRef.current.play().catch(() => {
      if (objectUrlRef.current === audioUrl) setManualPlay(true);
    });
  }, [audioUrl]);

  const commitPhrases = (next: SavedPhrase[]) => {
    setPhrases(next);
    try { saveSavedPhrases(next); }
    catch { setStorageWarning("تعذر حفظ العبارات على هذا الجهاز؛ التغييرات الحالية مؤقتة."); }
  };

  const persistPhrase = () => {
    const valid = validatePhraseText(text);
    if (valid.error) { setMessage(valid.error); return; }
    const now = Date.now();
    if (editing) commitPhrases(phrases.map((phrase) => phrase.id === editing ? { ...phrase, text: valid.text, updatedAt: now } : phrase));
    else {
      if (phrases.length >= 100) { setMessage("وصلت للحد الأعلى؛ احذف عبارة قبل إضافة غيرها."); return; }
      commitPhrases([{ id: crypto.randomUUID(), text: valid.text, createdAt: now, updatedAt: now }, ...phrases]);
    }
    setText(""); setEditing(null); setMessage("");
  };

  const editPhrase = (phrase: SavedPhrase) => { setEditing(phrase.id); setText(phrase.text); setMessage(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditing(null); setText(""); setMessage(""); };

  return (
    <main className={styles.shell}>
      <div className={styles.page}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="بو نايف، الصفحة الرئيسية"><span className={styles.brandMark}>BN</span><span>بو نايف</span></a>
          <span className={styles.voiceTag}><span className={styles.liveDot} /> صوت Vibi</span>
        </header>

        <section className={styles.hero}>
          <div className={styles.eyebrow}><Volume2 size={16} /> صوتك حاضر بالقيم</div>
          <h1>كلامك، <span>بصوته.</span></h1>
          <p>اكتب عبارة أو اختر من المحفوظة، وبو نايف يقولها لك بصوته.</p>
        </section>

        <section className={styles.composer} aria-labelledby="composer-title">
          <div className={styles.sectionHead}><div><span className={styles.step}>١</span><div><h2 id="composer-title">وش تبي يقول؟</h2><p>عبارتك الخاصة أو جملة تحفظها للقيم الجاي</p></div></div><span className={styles.counter}>{text.trim().length} / ٢٨٠</span></div>
          <label className={styles.srOnly} htmlFor="phrase-text">اكتب العبارة</label>
          <textarea id="phrase-text" className={styles.textarea} maxLength={280} rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="مثال: غطّني، بدخل عليهم من اليمين." />
          {message ? <p className={styles.error} role="alert">{message}</p> : null}
          <div className={styles.composerActions}>
            <button className={styles.primaryButton} type="button" disabled={generating || text.trim().length < 2} onClick={() => void playText(text)}><Play size={17} fill="currentColor" /> شغّل بصوت بو نايف</button>
            <button className={styles.secondaryButton} type="button" disabled={text.trim().length < 2} onClick={persistPhrase}>{editing ? <><Check size={16} /> حفظ التعديل</> : <><Save size={16} /> احفظ العبارة</>}</button>
            {editing ? <button className={styles.iconButton} type="button" onClick={cancelEdit} aria-label="إلغاء التعديل"><X size={18} /></button> : null}
            {generating ? <button className={styles.stopButton} type="button" onClick={stopAudio}><Square size={14} fill="currentColor" /> إيقاف</button> : null}
          </div>
          {storageWarning ? <p className={styles.warning} role="status">{storageWarning}</p> : null}
        </section>

        <section className={styles.library} aria-labelledby="saved-title">
          <div className={styles.sectionHead}><div><span className={styles.step}>٢</span><div><h2 id="saved-title">عباراتك المحفوظة</h2><p>جاهزة بضغطة، وتقدر تعدّلها بأي وقت</p></div></div><span className={styles.countPill}>{phrases.length} عبارة</span></div>
          <div className={styles.cards}>
            {phrases.map((phrase, index) => (
              <article className={styles.card} key={phrase.id}>
                <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                <p>{phrase.text}</p>
                <div className={styles.cardActions}>
                  <button className={styles.cardPlay} type="button" disabled={generating} onClick={() => void playText(phrase.text)} aria-label={`تشغيل: ${phrase.text}`}><Play size={15} fill="currentColor" /> تشغيل</button>
                  <button className={styles.cardIcon} type="button" onClick={() => editPhrase(phrase)} aria-label={`تعديل: ${phrase.text}`}><Pencil size={15} /></button>
                  <button className={styles.cardIcon} type="button" onClick={() => commitPhrases(phrases.filter((item) => item.id !== phrase.id))} aria-label={`حذف: ${phrase.text}`}><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
            <button className={styles.addCard} type="button" onClick={() => { setEditing(null); setText(""); document.getElementById("phrase-text")?.focus(); }}><span><Plus size={20} /></span><strong>عبارة جديدة</strong><small>اكتبها واحفظها فوق</small></button>
          </div>
        </section>

        <section className={styles.player} aria-label="مشغل الصوت">
          <div className={styles.playerIcon}><Mic2 size={20} /></div>
          <div className={styles.playerInfo}><span className={styles.playerLabel}>{generating ? "بو نايف يجهّز صوته" : playing ? "بو نايف يتكلم" : audioUrl ? "الصوت جاهز" : "مشغل الصوت"}</span><strong>{activeText || "اختر عبارة وخلّ الباقي عليه"}</strong>{manualPlay ? <span className={styles.playerHint}>الصوت جاهز؛ اضغط تشغيل من المشغل</span> : null}</div>
          {generating ? <span className={styles.loading}><i /><i /><i /></span> : null}
          {audioUrl ? <button className={styles.playerStop} type="button" onClick={stopAudio} aria-label="إيقاف الصوت"><Square size={15} fill="currentColor" /></button> : null}
          <audio ref={audioRef} className={audioUrl ? styles.audio : styles.hiddenAudio} src={audioUrl ?? undefined} controls preload="none" onPlaying={() => { setPlaying(true); setManualPlay(false); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { if (audioUrl) setMessage("تعذر تشغيل ملف الصوت؛ جرّب تشغيل العبارة مرة ثانية."); }} />
        </section>
        <footer className={styles.footer}>بو نايف <span>·</span> داخل القيم معك</footer>
      </div>
    </main>
  );
}
