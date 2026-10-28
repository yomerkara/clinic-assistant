import {readFileSync,writeFileSync} from 'node:fs';
const dir='artifacts/simple-flow-2026-10-08';
const read=p=>JSON.parse(readFileSync(`${dir}/${p}`,'utf8'));
const old=read('legacy/qwen-3_6-35b-sovereign-no-thinking-fixture-v2.json');
const q=read('final-rerun/qwen-3_6-35b-sovereign-no-thinking-fixture-v2.json');
const d=read('final/deepseek-v4-flash-sovereign-fixture-v2.json');
const ids=new Set(old.results.map(r=>r.id));
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null};
const stats=r=>({
 scenarios:r.results.length,passed:r.results.filter(c=>c.pass).length,
 turns:r.results.reduce((n,c)=>n+c.turns.length,0),calls:r.calls.length,
 inputTokens:r.results.reduce((n,c)=>n+(c.usage?.inputTokens||0),0),
 outputTokens:r.results.reduce((n,c)=>n+(c.usage?.outputTokens||0),0),
 replyMedianMs:median(r.results.flatMap(c=>c.turns).filter(t=>t.reply).map(t=>t.milliseconds))
});
const rows={legacyQwen:stats(old),simpleCommon:stats({...q,calls:[],results:q.results.filter(c=>ids.has(c.id))}),simpleQwen:stats(q),simpleDeepSeek:stats(d)};
writeFileSync(`${dir}/comparison.json`,JSON.stringify(rows,null,2));
console.log(rows);
const lines=['SANTA — ESKİ / SADE AKIŞ KARŞILAŞTIRMASI','8 Ekim 2026','',
'Aynı 14 senaryo, aynı temiz sentetik klinik belgeleri, aynı test altyapısı. Gerçek PostgreSQL ve konuşma tamponu; takvim/WhatsApp bellek adaptörleri. Gerçek hastalara/takvime yazılmadı. Gecikmeler kontrollü benchmark değildir. Mesaj tamponunun bekleme süresi testte saat ilerletilerek atlandı; milisaniye değerleri kullanıcı deneyiminin toplam gecikmesi değildir.',
'Geçti sonucu açık otomatik kontrolleri ifade eder; her ifade biçiminde klinik doğruluk garantisi değildir. Ana 14 senaryo statik yoldan işlendi, AI kullanılmadı. Genişletilmiş son iki senaryoda her model için iki gerçek açıklama üretimi, iki güvenlik ve iki kaynak doğrulama çağrısı yapıldı. Test belgelerine bu iki vaka için onaylı sentetik ilk görüşme açıklaması eklendi; uygulamanın gerçek bilgi havuzuna eklenmedi.',
'',JSON.stringify(rows,null,2),'','ORTAK SENARYOLAR'];
for(const c of old.results){const n=q.results.find(x=>x.id===c.id);lines.push(`${c.id}: eski ${c.pass?'GEÇTİ':'KALDI'} → yeni ${n.pass?'GEÇTİ':'KALDI'}`,...c.failures.map(f=>`  Eski: ${f}`));}
lines.push('','BÜTÜN YENİ KONUŞMALAR');
for(const r of [q,d]){lines.push('',`MODEL: ${r.model}`);for(const c of r.results){lines.push('',`${c.id}: ${c.pass?'GEÇTİ':'KALDI'}`);for(const t of c.turns)lines.push(`Müşteri: ${t.input.join(' / ')}`,`Asistan: ${t.reply??'[Çalışan devraldığı için bot sustu]'}`,`Profil: ${JSON.stringify(t.profile)}; aşama: ${t.stage}; süre: ${t.milliseconds} ms`);}}
writeFileSync(`${dir}/comparison.txt`,lines.join('\n'));
