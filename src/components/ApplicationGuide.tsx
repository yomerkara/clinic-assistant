"use client";

import { useEffect, useRef, useState, useId } from "react";
import {
  BookOpen,
  X,
  ArrowRight,
  UserCircle,
  CheckCircle,
  CalendarBlank,
  ChatCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import "./application-guide.css";

export function GuidePreview({
  kind,
}: {
  kind: "chat" | "queue" | "calendar" | "account";
}) {
  return (
    <div
      className={`guide-preview guide-preview--${kind}`}
      aria-label="Örnek ekran; gerçek danışan bilgisi içermez"
    >
      <div className="guide-preview-top">
        <span className="guide-monogram">S</span>
        <b>Santa</b>
        <small>ÖRNEK EKRAN</small>
      </div>
      {kind === "chat" ? (
        <div className="guide-chat">
          <span className="guide-label">KONUŞMALAR / YENİ MESAJ</span>
          <p className="guide-bubble">
            Merhaba, randevumun saatini değiştirebilir miyim?
          </p>
          <p className="guide-bubble is-answer">
            Elbette. Sizin için uygun olan günü ve saati paylaşır mısınız?
          </p>
          <div className="guide-note">
            <ChatCircle size={18} /> Gerektiğinde konuşmayı devralın
          </div>
        </div>
      ) : kind === "queue" ? (
        <div className="guide-request">
          <span className="guide-label">ONAY KUYRUĞU</span>
          <span className="guide-badge">Onay bekliyor</span>
          <h4>Randevu saati değişikliği</h4>
          <div className="guide-time">
            <span>
              Mevcut saat<b>10.00</b>
            </span>
            <ArrowRight size={22} />
            <span>
              Önerilen saat<b>14.00</b>
            </span>
          </div>
          <div className="guide-example-actions">
            <span>Talebi incele</span>
            <span>
              <CheckCircle size={17} /> Yetkili onayı
            </span>
          </div>
        </div>
      ) : kind === "calendar" ? (
        <div className="guide-calendar">
          <span className="guide-label">HAFTALIK TAKVİM</span>
          <div className="guide-week">
            {["Pzt", "Sal", "Çar", "Per", "Cum"].map((day, i) => (
              <div key={day}>
                <b>{day}</b>
                <span className={i === 1 || i === 3 ? "has-appointment" : ""}>
                  {i === 1 || i === 3 ? "Seans" : ""}
                </span>
                <span className={i === 2 ? "has-appointment" : ""}>
                  {i === 2 ? "Seans" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="guide-note">
            <CalendarBlank size={18} /> Randevular ve uygun saatler bir arada
          </div>
        </div>
      ) : (
        <div className="guide-account">
          <span className="guide-label">PROFİL VE HESAP</span>
          <UserCircle size={44} weight="light" />
          <h4>Hesabınız, sizin kontrolünüzde.</h4>
          <div>
            <span>Profil bilgileri</span>
            <span>E-posta</span>
            <span>Şifre ve güvenlik</span>
          </div>
          <p>Sol alttaki baş harflerinize dokunun.</p>
        </div>
      )}
    </div>
  );
}

export function ApplicationGuide({
  role,
  autoOpen = false,
  showTrigger = !autoOpen,
  once = false,
}: {
  role: string;
  autoOpen?: boolean;
  showTrigger?: boolean;
  once?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const claim = useRef<Promise<boolean> | null>(null);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const slides = [
    {
      title: "Konuşmanın tamamını görün.",
      name: "Konuşmalar",
      kind: "chat" as const,
      href: "/conversations",
      text: "Danışan mesajlarını ve asistanın yanıtlarını birlikte takip edin. İnsan desteği gerektiğinde konuşmayı devralın.",
    },
    {
      title: "Her talebi bağlamıyla değerlendirin.",
      name: "Onay kuyruğu",
      kind: "queue" as const,
      href: "/queue",
      text:
        role === "INTERN"
          ? "Randevu taleplerini takip edin. Onay işlemleri yönetici veya ilgili terapist tarafından tamamlanır."
          : "Önerilen değişikliği ve danışanın mesajını inceleyin. Yetkiniz olan taleplerde onay veya ret kararı verin.",
    },
    ...(role !== "INTERN"
      ? [
          {
            title: "Gününüzü önceden planlayın.",
            name: "Takvim",
            kind: "calendar" as const,
            href: "/calendar",
            text: "Randevularınızı takvimden takip edin. Google Calendar bağlantınızı Ayarlar bölümünden yönetebilirsiniz.",
          },
        ]
      : []),
    {
      title: "Hesabınıza tek dokunuşla ulaşın.",
      name: "Profil ve ayarlar",
      kind: "account" as const,
      href: "/settings/account",
      text: "Sol alttaki avatarınızdan profilinize ulaşın. Mobilde üstteki Profilim bağlantısını kullanın. Adınızı, e-postanızı ve şifrenizi buradan güncelleyebilirsiniz.",
    },
  ];
  const slide = slides[index];
  useEffect(() => {
    if (!autoOpen) return;
    let cancelled = false;
    if (!claim.current)
      claim.current = once
        ? fetch("/api/account/guide", { method: "POST" })
            .then(
              async (response) => response.ok && (await response.json()).show === true,
            )
            .catch(() => false)
        : Promise.resolve(true);
    void claim.current.then((show) => {
      if (show && !cancelled) dialog.current?.showModal();
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("guide");
    window.history.replaceState(window.history.state, "", url);
    return () => {
      cancelled = true;
    };
  }, [autoOpen, once]);
  function move(next: number) {
    setIndex(next);
    heading.current?.focus();
  }
  return (
    <>
      {showTrigger && (
        <button
          type="button"
          className="settings-guide-link"
          onClick={() => {
            setIndex(0);
            dialog.current?.showModal();
          }}
        >
          <BookOpen size={28} weight="light" aria-hidden="true" />
          <span>
            <b>Kurulum rehberi</b>
            <small>Ekranları adım adım keşfedin</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      )}
      <dialog
        ref={dialog}
        className="application-guide"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="guide-dialog-inner">
          <header className="guide-header">
            <span>
              <BookOpen size={20} aria-hidden="true" /> SANTA / KURULUM REHBERİ
            </span>
            <button
              type="button"
              aria-label="Rehberi kapat"
              onClick={() => dialog.current?.close()}
            >
              <X size={22} />
            </button>
          </header>
          <div className="guide-content">
            <GuidePreview kind={slide.kind} />
            <section className="guide-copy" aria-live="polite" aria-atomic="true">
              <span className="guide-label">
                {String(index + 1).padStart(2, "0")} / {slide.name}
              </span>
              <h2 id={titleId} ref={heading} tabIndex={-1}>
                {slide.title}
              </h2>
              <p>{slide.text}</p>
              <Link href={slide.href} onClick={() => dialog.current?.close()}>
                Bu ekrana git <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          </div>
          <footer className="guide-footer">
            <button type="button" disabled={index === 0} onClick={() => move(index - 1)}>
              ← Önceki
            </button>
            <span aria-label={`${slides.length} adımın ${index + 1}. adımı`}>
              {slides.map((s, i) => (
                <i key={s.name} className={index === i ? "is-active" : ""} />
              ))}
            </span>
            <button
              type="button"
              className="guide-next"
              onClick={() =>
                index === slides.length - 1 ? dialog.current?.close() : move(index + 1)
              }
            >
              {index === slides.length - 1 ? "Tamamla" : "Sonraki →"}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
