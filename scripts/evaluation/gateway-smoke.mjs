import { writeFile, mkdir } from 'node:fs/promises';
const base = process.env.AI_GATEWAY_URL || 'http://127.0.0.1:4001/v1';
const headers = { Authorization: `Bearer ${process.env.AI_GATEWAY_KEY}`, 'Content-Type':'application/json' };
const results = [];
for (const [id, body] of [
 ['missing-task', {model:'qwen-3.6-35b-sovereign', messages:[{role:'user',content:'Merhaba'}], max_tokens:10}],
 ['tools-blocked', {model:'qwen-3.6-35b-sovereign', metadata:{santa_task:'smoke'}, tools:[{type:'function',function:{name:'write_db',parameters:{type:'object'}}}], messages:[{role:'user',content:'Merhaba'}]}],
 ['free-provider', {model:'qwen-3.6-35b-sovereign',metadata:{santa_task:'smoke'},messages:[{role:'user',content:'Yalnızca TAMAM yaz.'}], max_tokens:40,chat_template_kwargs:{enable_thinking:false}}],
]) {
 const start=Date.now();
 try {const r=await fetch(`${base}/chat/completions`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}); const payload=await r.json(); results.push({id,status:r.status,ms:Date.now()-start,reply:payload.choices?.[0]?.message?.content, usage:payload.usage});}
 catch {results.push({id,status:'unavailable'});}
}
await mkdir('artifacts/gateway-2026-10-08',{recursive:true});
await writeFile('artifacts/gateway-2026-10-08/smoke.json',JSON.stringify(results,null,2)); console.log(JSON.stringify(results));
if (results[0].status !==400 || results[1].status!==400 || results[2].status!==200) process.exitCode=1;
