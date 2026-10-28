export type DemoPersona = {
  id: "new" | "ayse" | "mehmet";
  label: string;
  hint: string;
  phone: string;
  patientId?: string;
  chips: Array<{ label: string; text: string }>;
};

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "new",
    label: "Yeni danışan",
    hint: "İsimsiz başlangıç · yeni randevu talebi",
    phone: "+905551110003",
    chips: [
      { label: "Merhaba", text: "Merhaba, randevu almak istiyorum." },
      {
        label: "Yeni randevu",
        text: "Önümüzdeki hafta için yeni bir randevu oluşturmak istiyorum.",
      },
      { label: "EMDR nedir?", text: "EMDR seansları nasıl ilerliyor?" },
      { label: "Çalışanla konuş", text: "Bir çalışanla görüşmek istiyorum." },
    ],
  },
  {
    id: "ayse",
    label: "Ayşe Yıldırım",
    hint: "Kayıtlı hasta · saat değişikliği / iptal",
    phone: "+905551110017",
    patientId: "patient_ayse",
    chips: [
      { label: "Teyit", text: "Ayşe Yıldırım, geleceğim teşekkürler." },
      {
        label: "Saat değişsin",
        text: "Ayşe Yıldırım olarak randevumun saatini değiştirebilir miyiz, akşamları daha uygun.",
      },
      { label: "İptal", text: "Ayşe Yıldırım randevumu iptal etmek istiyorum." },
    ],
  },
  {
    id: "mehmet",
    label: "Mehmet Şahin",
    hint: "Bugün randevusu var · aynı gün iptal",
    phone: "+905551110002",
    patientId: "patient_mehmet",
    chips: [
      { label: "Bugün gelemem", text: "Bugünkü randevumu iptal etmek istiyorum." },
      { label: "Yeni randevu", text: "İptalden sonra yeni bir randevu alabilir miyim?" },
    ],
  },
];

export function personaById(id: string | null | undefined) {
  return DEMO_PERSONAS.find((item) => item.id === id) ?? DEMO_PERSONAS[0]!;
}
