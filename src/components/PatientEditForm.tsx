import { formatPatientName } from "@/lib/patients/profile";
type PatientFields = {
  guardianName?: string | null;
  guardianConsent?: boolean | null;
  guardianAccompanies?: boolean | null;
  id: string;
  version: number;
  displayName: string;
  age: number | null;
  hasTherapyHistory: boolean | null;
  availabilityNotes: string | null;
  alternativeDaysOkay: boolean | null;
};
const choice = (value: boolean | null) => (value == null ? "" : String(value));

export function PatientEditForm({ patient }: { patient: PatientFields }) {
  return (
    <details className="patient-edit">
      <summary className="admin-secondary-btn">Müşteri bilgilerini düzenle</summary>
      <form
        action={`/api/patients/${patient.id}`}
        method="post"
        className="patient-edit__form"
      >
        <input type="hidden" name="version" value={patient.version} />
        <label>
          Ad ve soyad
          <input
            name="displayName"
            defaultValue={formatPatientName(patient.displayName)}
            minLength={2}
            maxLength={120}
            required
            autoComplete="off"
          />
        </label>
        <label>
          Yaş
          <input
            name="age"
            type="number"
            min={0}
            max={120}
            step={1}
            defaultValue={patient.age ?? ""}
          />
        </label>
        <label>
          Terapi geçmişi
          <select
            name="hasTherapyHistory"
            defaultValue={choice(patient.hasTherapyHistory)}
          >
            <option value="">Belirtilmedi</option>
            <option value="true">Var</option>
            <option value="false">Yok</option>
          </select>
        </label>
        <label>
          Alternatif günler
          <select
            name="alternativeDaysOkay"
            defaultValue={choice(patient.alternativeDaysOkay)}
          >
            <option value="">Belirtilmedi</option>
            <option value="true">Uygun</option>
            <option value="false">Tercih edilmiyor</option>
          </select>
        </label>
        <label className="patient-edit__wide">
          Uygun gün ve saatler
          <textarea
            name="availabilityNotes"
            maxLength={500}
            rows={3}
            defaultValue={patient.availabilityNotes ?? ""}
            placeholder="Örneğin salı ve perşembe 18.00 sonrası"
          />
        </label>
        <fieldset className="patient-edit__wide">
          <legend>Çocuk / ergen başvurusu — çalışan teyidi</legend>
          <label>
            Veli adı ve soyadı
            <input
              name="guardianName"
              maxLength={120}
              defaultValue={patient.guardianName ?? ""}
            />
          </label>
          <label>
            Veli onayı
            <select
              name="guardianConsent"
              defaultValue={choice(patient.guardianConsent ?? null)}
            >
              <option value="">Teyit edilmedi</option>
              <option value="true">Alındı</option>
              <option value="false">Alınmadı</option>
            </select>
          </label>
          <label>
            Veli eşlik edecek
            <select
              name="guardianAccompanies"
              defaultValue={choice(patient.guardianAccompanies ?? null)}
            >
              <option value="">Teyit edilmedi</option>
              <option value="true">Evet</option>
              <option value="false">Hayır</option>
            </select>
          </label>
        </fieldset>
        <p className="desk-muted patient-edit__wide">
          Kaydedilen bilgiler müşteri, konuşma ve randevu ekranlarında kullanılır. Eski
          mesajların metni korunur. Konuşma ekibe devredildiyse kaydetmek asistanı
          otomatik başlatmaz.
        </p>
        <button className="toolbar-apply-btn" type="submit">
          Bilgileri kaydet
        </button>
      </form>
    </details>
  );
}
