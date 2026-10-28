import fs from 'node:fs';
import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
const out='artifacts/ui-review-20261014';
const row=JSON.parse(fs.readFileSync(out+'/results.json')).find(r=>r.id==='074');
const browser=await chromium.launch();
try {
 const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:'/tmp/santa-ui-100-auth.json',viewport:{width:1440,height:1100}});
 const page=await context.newPage();
 await page.goto(`https://localhost/calendar?date=2026-10-21&therapist=${row.finalState.preferredTherapistId}&view=week`);
 await page.getByText('Deneme Deniz',{exact:false}).first().waitFor();
 await page.getByRole('button').filter({hasText:'Deneme Deniz'}).filter({hasText:'14:00–14:50'}).click();
 const start=await page.getByLabel('Başlangıç',{exact:true}).inputValue();
 if(start!=='2026-10-21T14:00')throw Error('Unexpected appointment start: '+start);
 await page.screenshot({path:out+'/074-calendar-verified.png',fullPage:true});
 const text=await page.locator('body').innerText();
 fs.writeFileSync(out+'/calendar-proof.json',JSON.stringify({url:page.url(),start,patientVisible:text.includes('Deneme Deniz'),text},null,2));
 console.log('Calendar patient visible:',text.includes('Deneme Deniz'));
} finally {await browser.close()}
