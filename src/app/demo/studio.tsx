"use client";

import { MessageText } from "@/components/MessageText";
import { formatClinicClock } from "@/lib/clinic-clock";

import { actionTypeLabel } from "@/lib/format";
import type { ActionType } from "@prisma/client";

import { ControlIcon } from "@/components/ControlIcon";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DemoPersona } from "@/lib/demo/personas";
import type { QuickReply } from "@/lib/conversation/quick-replies";

export type DemoMessage = {
  id: string;
  role: "patient" | "assistant";
  text: string;
  createdAt: string;
};

type Props = {
  persona: DemoPersona;
  personas: DemoPersona[];
  initialMessages: DemoMessage[];
  initialQuickReplies: QuickReply[];
};

export function DemoStudio({
  persona,
  personas,
  initialMessages,
  initialQuickReplies,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [chips, setChips] = useState(initialQuickReplies);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<Array<{ id: string; type: ActionType }>>([]);
  const sendChain = useRef<Promise<void>>(Promise.resolve());
  const sending = useRef(0);
  const generation = useRef(0);
  async function refreshConversation() {
    const expected = generation.current;
    const response = await fetch(`/api/demo?persona=${encodeURIComponent(persona.id)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    if (expected !== generation.current) return;
    setMessages(
      (data.conversation?.messages ?? []).map(
        (item: { id: string; authorKind: string; text: string; createdAt: string }) => ({
          id: item.id,
          role: item.authorKind === "PATIENT" ? "patient" : "assistant",
          text: item.text,
          createdAt: item.createdAt,
        }),
      ),
    );
    setPending(Boolean(data.processing) || sending.current > 0);
    setChips(data.quickReplies ?? []);
    setActions(data.actions ?? []);
  }
  const poll = useRef(refreshConversation);
  useEffect(() => {
    poll.current = refreshConversation;
  });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "visible")
        await poll.current().catch(() => undefined);
      if (!stopped) timer = setTimeout(tick, 1000);
    }
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [persona.id]);

  async function post(body: unknown) {
    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      actionId?: string | null;
      quickReplies?: QuickReply[];
      conversation?: {
        messages: Array<{
          id: string;
          authorKind: string;
          text: string;
          createdAt: string;
        }>;
      };
    };
    if (!response.ok) {
      throw new Error(payload.message ?? "Yanıt alınamadı");
    }
    return payload;
  }

  async function send(text = draft) {
    const message = text.trim();
    if (!message) return;
    const messageId = crypto.randomUUID();
    setDraft("");
    setError("");
    setPending(true);
    sending.current += 1;
    sendChain.current = sendChain.current.then(async () => {
      try {
        await post({ persona: persona.id, text: message, messageId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mesaj gönderilemedi.");
        setDraft((current) => current || message);
      } finally {
        sending.current -= 1;
        await refreshConversation().catch(() => undefined);
      }
    });
    await sendChain.current;
  }

  async function startNewConversation() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      generation.current += 1;
      await post({ persona: "new", intent: "reset" });
      const newPersona = personas.find((item) => item.id === "new")!;
      setMessages([]);
      setActions([]);
      setChips(newPersona.chips);
      setDraft("");
      router.push("/demo?persona=new");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yeni konuşma başlatılamadı.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="demo-main demo-main--admin">
      <header className="demo-header">
        <div>
          <span className="eyebrow">Klinik walkthrough</span>
          <h2>WhatsApp asistanı</h2>
        </div>
        <div className="demo-header__actions">
          <button
            className="demo-ghost-btn"
            type="button"
            onClick={() => void startNewConversation()}
            disabled={pending}
          >
            <ControlIcon name="plus" /> Yeni konuşma
          </button>
        </div>
      </header>

      <div className="demo-persona-row" role="tablist" aria-label="Hasta kurgusu">
        {personas.map((item) => (
          <a
            key={item.id}
            className={item.id === persona.id ? "demo-persona is-active" : "demo-persona"}
            href={`/demo?persona=${item.id}`}
            onClick={
              item.id === "new"
                ? (event) => {
                    event.preventDefault();
                    void startNewConversation();
                  }
                : undefined
            }
          >
            <span className="demo-persona__avatar">
              {item.id === "new" ? "S" : item.label.slice(0, 1)}
            </span>
            <span className="demo-persona__copy">
              <b>{item.label}</b>
              <small>{item.hint}</small>
            </span>
          </a>
        ))}
      </div>

      <div className="demo-grid">
        <section className="demo-chat-panel">
          <div className="whatsapp-window">
            <div className="whatsapp-topbar">
              <div className="wa-back">‹</div>
              <div className="wa-avatar">S</div>
              <div className="wa-contact">
                <b>Santa Psikoloji</b>
                <span>{persona.label}</span>
              </div>
              <div className="wa-actions">
                <span>⌕</span>
                <span>⋮</span>
              </div>
            </div>
            <div className="whatsapp-notice">
              Bu konuşma kuyruğa ve onay sonrası Google Calendar’a gerçek kayıt yazar.
            </div>
            {error ? (
              <div className="demo-error" role="alert">
                <b>Yanıt alınamadı.</b>
                <span>{error}</span>
              </div>
            ) : null}
            {actions.length ? (
              <div className="whatsapp-notice">
                <strong>Bekleyen talepler ({actions.length})</strong>
                <ul>
                  {actions.map((action) => (
                    <li key={action.id}>
                      <a href={`/queue/${action.id}`}>
                        {actionTypeLabel(action.type)} talebini aç →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="whatsapp-body">
              <div className="wa-date">BUGÜN</div>
              <div className="wa-intro">
                <span className="wa-assistant-avatar">S</span>
                <div className="wa-message wa-message--assistant wa-message--intro">
                  <p>
                    Merhaba, Santa Psikoloji’ye hoş geldiniz. Size nasıl yardımcı
                    olabiliriz?
                  </p>
                </div>
              </div>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "patient"
                      ? "wa-message-row wa-message-row--patient"
                      : "wa-message-row wa-message-row--assistant"
                  }
                >
                  {message.role === "assistant" ? (
                    <span className="wa-assistant-avatar">S</span>
                  ) : null}
                  <div
                    className={
                      message.role === "patient"
                        ? "wa-message wa-message--patient"
                        : "wa-message wa-message--assistant"
                    }
                  >
                    <p>
                      <MessageText text={message.text} />
                    </p>
                    <time>{formatClock(message.createdAt)}</time>
                  </div>
                </div>
              ))}
              {pending ? (
                <div className="wa-typing">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
            <div className="whatsapp-composer">
              <div className="wa-suggestions">
                {(messages.length
                  ? chips.filter((item) => item.label !== "Merhaba")
                  : chips
                ).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => void send(item.text)}
                    disabled={pending}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="wa-input-row">
                <button type="button" className="wa-plus" aria-label="Ek seçenekler">
                  ＋
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void send();
                  }}
                  placeholder="Mesajınızı yazın..."
                  maxLength={4000}
                />
                <button
                  type="button"
                  className="wa-send"
                  onClick={() => void send()}
                  disabled={!draft.trim()}
                  aria-label="Gönder"
                >
                  →
                </button>
              </div>
            </div>
          </div>
          <div className="chat-footnote">
            <span className="shield">✓</span> Onaylanmadan takvim değişmez. Aynı gün
            iptali otomatik uygulanır.
          </div>
        </section>
      </div>
    </div>
  );
}

function formatClock(value: string) {
  return formatClinicClock(value);
}
