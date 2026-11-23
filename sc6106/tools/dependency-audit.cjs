// Queries public package names/versions only; never uploads source or credentials.
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const packages=[];
function walk(dir) {
  for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    if(item.isSymbolicLink()) continue;
    const filename=path.join(dir,item.name);
    if(item.isDirectory()) walk(filename);
    else if(item.name==='package.json') {
      try {const p=JSON.parse(fs.readFileSync(filename,'utf8'));
        if(p.name&&p.version) packages.push({name:p.name,version:p.version,path:path.relative(root,filename)});
      }catch{}
    }
  }
}
walk(path.join(root,'node_modules'));
(async()=>{
  const body={};
  for(const p of packages) {body[p.name]??=[]; if(!body[p.name].includes(p.version))body[p.name].push(p.version);}
  const response=await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok) throw Error('Registry audit failed: '+response.status);
  const advisories=await response.json();
  const result={date:'2026-11-23',packagesScanned:packages.length,packages,advisories};
  fs.writeFileSync(path.join(root,'evidence/installed-package-audit.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({packagesScanned:packages.length,advisories},null,2));
})();
