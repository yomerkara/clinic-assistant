import fs from 'node:fs';
import {scryptSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const file='/tmp/santa-ui-100-auth.json';
if(fs.existsSync(file)){
 const token=JSON.parse(fs.readFileSync(file)).cookies.find(c=>c.name==='santa_session')?.value;
 if(token){
  const hash=scryptSync(token,'session',32).toString('hex');
  const code=`const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.session.deleteMany({where:{tokenHash:'${hash}'}}).then(r=>console.log('Revoked test sessions:',r.count)).finally(()=>p.$disconnect());`;
  process.stdout.write(execFileSync('docker',['compose','exec','-T','app','node','-e',code]));
 }
 fs.unlinkSync(file);
}
