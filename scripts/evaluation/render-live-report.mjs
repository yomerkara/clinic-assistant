import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const dir = 'artifacts/live-demo-2026-10-08';
const rows = [];
const text = [
 'SANTA — GERÇEK MODEL / DEMO AKIŞI DEĞERLENDİRMESİ',
 'Tarih: 8 Ekim 2026',
 '',
 'Kapsam: Gerçek sağlayıcı model çağrıları; demo ile aynı mesaj tamponu, konuşma yöneticisi, PostgreSQL ve onay servisi.',
 'Takvim ve WhatsApp bellek adaptörleriyle izole edildi. Gerçek hasta verisi, takvim yazımı, WhatsApp teslimatı veya tarayıcı arayüzü test edilmedi.',
 'Bütün kişiler ve klinik belgeleri test verisidir. Üretim ayarları değiştirilmedi.',
 'Gecikmeler gözlemdir; paylaşımlı sağlayıcı ve zaman zaman çakışan test süreçleri nedeniyle kontrollü hız benchmarkı değildir.',
 'Pass, yalnızca senaryodaki otomatik kontrollerin geçtiğini belirtir; dil/klinik kalite onayı değildir.',
 'İlk belge sürümünde test açıklamaları kaynak denetimini etkiledi. Klinik/uzman kaynak sonuçlarını v2 kontrol koşusuyla birlikte okuyun.',
 '',
];
for (const name of readdirSync(dir).filter(n => n.endsWith('.json') && !n.includes('partial'))) {
 let report; try { report = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')); } catch { continue; }
 if (!report.results) continue;
 const executed = report.results.filter(r => r.turns?.length);
 const blocked = report.results.filter(r => r.status === 'blocked_by_provider');
 const turns = executed.flatMap(r => r.turns);
 const times = turns.filter(t => t.reply && t.milliseconds > 1000).map(t => t.milliseconds).sort((a,b)=>a-b);
 const row = { file: name, model: report.model, fixture: report.fixtureVersion || '1', requestedThinkingDisabled: report.requestedThinkingDisabled ?? name.includes('no-thinking'), timeoutMs: report.timeoutMs || 30000, scenariosRecorded: report.results.length, executed: executed.length, passedChecks: executed.filter(r=>r.pass).length, failedChecks: executed.filter(r=>!r.pass).length, blocked: blocked.length, turns: turns.length, medianReplyMs: times.length ? (times[Math.floor((times.length-1)/2)] + times[Math.floor(times.length/2)]) / 2 : null };
 rows.push(row);
 text.push(`KOŞU: ${name}`, JSON.stringify(row), '');
 for (const r of report.results) {
  text.push(`SENARYO: ${r.id} — ${r.status || (r.pass ? 'otomatik kontroller geçti' : 'başarısız')}`);
  for (const failure of r.failures || []) text.push(`  Bulgu: ${failure}`);
  for (const [i,t] of (r.turns || []).entries()) {
   text.push(`  ${i+1}. Kullanıcı: ${t.input.join(' / ')}`, `     Asistan: ${t.reply ?? '[yanıt yok]'}`, `     Süre: ${(t.milliseconds/1000).toFixed(1)} sn; durum: ${t.mode}; aşama: ${t.stage}`, `     Profil: ${JSON.stringify(t.profile)}; işlemler: ${JSON.stringify(t.actions)}`);
   if (t.audit?.serviceFailure) text.push(`     Servis hatası: ${JSON.stringify(t.audit.serviceFailure)}`);
   if (t.audit?.grounding?.supported === false) text.push(`     Kaynak reddi: ${t.audit.grounding.reason}`);
   if (t.audit?.contentSafety?.status !== 'passed' && t.audit?.contentSafety) text.push(`     Güvenlik: ${JSON.stringify(t.audit.contentSafety)}`);
  }
  text.push('');
 }
}
writeFileSync(`${dir}/summary.json`, JSON.stringify(rows,null,2));
writeFileSync(`${dir}/transcripts.txt`, text.join('\n'));
console.log(JSON.stringify(rows,null,2));
