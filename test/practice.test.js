const fs=require('fs');const c=JSON.parse(fs.readFileSync('dist/content.fa.json','utf8'));
eval(['src/engine/vfs.js','src/engine/shell.js','src/engine/checker.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+';global.VFS=VFS;global.Shell=Shell;global.Checker=Checker;');
Shell.setMessages(c.shell);
let fail=0;
c.lessons.forEach(l=>l.practice.forEach(p=>{const sh=Shell.create({start:p.start});const a=[];let ok=false;
 [].concat(p.answer).forEach(cmd=>{const r=Shell.run(sh,cmd);a.push(r.rec);ok=Checker.evaluate(p.checks,sh,a);});
 if(!ok){fail++;console.log('FAIL',p.id,p.answer,Shell.cwdPath(sh));}
 // a wrong answer must not pass
 const sh2=Shell.create({start:p.start});const r2=Shell.run(sh2,'dir Music');if(Checker.evaluate(p.checks,sh2,[r2.rec]))console.log('TOO LOOSE',p.id);
}));
// alternative valid answers
const alt=[['P8a','chdir Documents'],['P9a','cd \\Users\\Student\\Pictures'],['P10a','cd .\\Work'],['P6a','d:']];
alt.forEach(([id,cmd])=>{const p=c.lessons.flatMap(l=>l.practice).find(x=>x.id===id);const sh=Shell.create({start:p.start});const r=Shell.run(sh,cmd);console.log(id,cmd,Checker.evaluate(p.checks,sh,[r.rec]));});
// relative task must reject absolute
{const p=c.lessons.flatMap(l=>l.practice).find(x=>x.id==='P10a');const sh=Shell.create({start:p.start});const r=Shell.run(sh,'cd C:\\Users\\Student\\Documents\\Work');console.log('P10a absolute rejected:',!Checker.evaluate(p.checks,sh,[r.rec]));}
console.log('failures',fail);
