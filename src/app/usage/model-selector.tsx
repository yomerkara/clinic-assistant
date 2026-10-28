"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { MODEL_CATALOG, catalogModel } from "@/lib/usage/catalog";
import { tierLabels, type AiTier } from "@/lib/usage/tiers";

const defaults: Record<AiTier, string> = {
  ECONOMY: "qwen-3.6-35b-sovereign",
  BALANCED: "claude-sonnet-5-5",
  ADVANCED: "claude-opus-5-5",
};
const labels = { ...tierLabels, ADVANCED: "Üst segment" };
const price = (value: number) => (value === 0 ? "Ücretsiz" : `$${value.toFixed(2)}`);

function SaveModelButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="toolbar-apply-btn" type="submit" disabled={active || pending}>
      {pending ? "Model deneniyor…" : active ? "Kullanılıyor" : "Test et ve kullan"}
    </button>
  );
}

function ModelOption({ tier, currentModel }: { tier: AiTier; currentModel: string }) {
  const options = MODEL_CATALOG.filter((m) => m.tier === tier);
  const [selected, setSelected] = useState(
    options.some((m) => m.id === currentModel) ? currentModel : defaults[tier],
  );
  const model = catalogModel(selected)!;
  const active = currentModel === selected;
  return (
    <form
      action="/api/usage/model"
      method="post"
      className={`model-option${active ? " model-option--active" : ""}`}
    >
      <div className="model-option__heading">
        <h3>{labels[tier]}</h3>
        {active && <span>Aktif</span>}
      </div>
      <div className="model-option__field">
        <label htmlFor={`model-${tier}`}>Model</label>
        <select
          id={`model-${tier}`}
          name="modelId"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {options.map((m) => (
            <option value={m.id} key={m.id}>
              {m.id}
            </option>
          ))}
        </select>
        <p className="desk-muted">{model.provider}</p>
      </div>
      <dl className="model-prices">
        <div>
          <dt>Giriş / 1M token</dt>
          <dd>{price(model.input)}</dd>
        </div>
        <div>
          <dt>Çıkış / 1M token</dt>
          <dd>{price(model.output)}</dd>
        </div>
      </dl>
      <SaveModelButton active={active} />
    </form>
  );
}

export function ModelSelector({
  currentModel,
  status,
}: {
  currentModel: string;
  status?: string;
}) {
  return (
    <section
      className="usage-panel model-selector"
      aria-labelledby="model-selector-title"
    >
      <header>
        <div>
          <span className="admin-kicker">Asistan modeli</span>
          <h2 id="model-selector-title">Bütçene göre seç</h2>
        </div>
      </header>
      <p className="model-current">
        Varsayılan model: <strong>{currentModel}</strong>
      </p>
      {status === "saved" && (
        <p role="status">Model kaydedildi. Yeniden başlatma gerekmez.</p>
      )}
      {status === "invalid" && (
        <p role="alert">Model kaydedilemedi. Listeden bir model seçin.</p>
      )}
      {status === "failed" && (
        <p role="alert">
          Model denemesi tamamlanamadı. API erişimini, model uyumluluğunu ve aylık bütçeyi
          kontrol edin. Mevcut model korundu.
        </p>
      )}
      <div className="model-options">
        {(Object.keys(defaults) as AiTier[]).map((tier) => (
          <ModelOption
            key={`${tier}-${currentModel}`}
            tier={tier}
            currentModel={currentModel}
          />
        ))}
      </div>

      <details className="model-explanation">
        <summary>Model seçimi hakkında</summary>
        <p className="desk-muted">
          Seçimden önce bağlantı, bilgi toplama, çalışana devir ve hassas mesajlar için
          dört kısa konuşma testi yapılır; testlerin token maliyeti kullanıma eklenir.
          Başarısız denemeleri sağlayıcı ayrıca ücretlendirebilir. Klinik yanıt kalitesini
          demoda ayrıca değerlendirin. Görsel ve embedding modelleri sohbet listesine
          dahil edilmez.
        </p>
      </details>
    </section>
  );
}
