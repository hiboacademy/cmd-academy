const fs=require('fs');eval(fs.readFileSync('src/engine/vfs.js','utf8')+fs.readFileSync('src/engine/shell.js','utf8')+fs.readFileSync('src/engine/checker.js','utf8')+';global.VFS=VFS;global.Shell=Shell;global.Checker=Checker;');
Shell.setLessonIndex({copy:21,del:24});
const sh=Shell.create();
const go=(c)=>{const r=Shell.run(sh,c);console.log(Shell.prompt(sh).padEnd(34),'| '+c);(r.lines||[]).forEach(l=>console.log('   ['+l.t+'] '+l.text));};
['dir','cd Documents','dir /w','cd..','cd \\','cd Users\\Student\\Pictures','cd ..\\Music','cd','D:','cd C:\\Windows','cd','cd /d C:\\Windows\\System32','cd \\Users\\Student','mkdir Restaurant','md Restaurant','mkdir "My Folder"','dir /b','type Documents\\todo.txt','type Pictures','type Pictures\\cat.jpg','dri','Documents','copy a b','format c:','Z:','e','E:','dir','cd Photos','echo Hello %USERNAME%','echo.','dir *.txt','C:','dir Documents\\*.txt','cd notexist','cd Documents\\todo.txt','dir /q','ver','echo hi > a.txt','دیر'].forEach(go);
console.log(sh.log.slice(-3));
