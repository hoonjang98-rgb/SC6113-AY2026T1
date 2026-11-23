// Read-only local evidence collection. Never prints candidate secret values.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname,'..');
const gitDir = path.join(root,'evidence/repository-audit.git');
const git = args => cp.execFileSync('git',['--git-dir='+gitDir,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
const rules = [
  ['private-key-pem', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['provider-token', /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[0-9A-Za-z-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})/g],
  ['credential-assignment', /(?:private[_ -]?key|secret[_ -]?key|mnemonic|seed[_ -]?phrase|api[_ -]?key|password)\s*["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi],
  ['rpc-project-credential', /(?:infura\.io\/v3\/|alchemy\.com\/v2\/)[A-Za-z0-9_-]{16,}/g],
  ['credential-in-url', /https?:\/\/[^\s/:]+:[^\s/@]+@[^\s/]+/g]
];
const candidates = [], emails = [], personalPaths = [];
function scan(text, location) {
  for (const [rule,regex] of rules) {
    regex.lastIndex=0;
    for (const match of text.matchAll(regex)) {
      const value=match[1]||match[0];
      if (/YOUR_|REPLACE|example|placeholder|not-a-key|process\.env|os\.getenv/i.test(value)) continue;
      candidates.push({location,rule,line:text.slice(0,match.index).split('\n').length});
    }
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) emails.push(location);
  if (/(?:C:[\\/]Users[\\/]|\/Users\/|\/home\/)[a-z0-9_-]+/i.test(text)) personalPaths.push(location);
}
const objects=git(['rev-list','--objects','--all']).trim().split('\n');
let blobCount=0, scannedBytes=0;
const binary=[];
for(const object of objects) {
  const [sha,...parts]=object.split(' '), filename=parts.join(' ');
  if (git(['cat-file','-t',sha]).trim() !== 'blob') continue;
  const content=git(['cat-file','blob',sha]);
  if(content.includes('\u0000')) {binary.push({sha,path:filename}); continue;}
  blobCount++; scannedBytes+=Buffer.byteLength(content);
  scan(content,`${filename}@${sha.slice(0,12)}`);
}
const commits=git(['log','--all','--format=%H%n%B']).trim(); scan(commits,'commit-messages');
const packages=[];
function manifests(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (entry.isSymbolicLink()) continue;
    const filename=path.join(dir,entry.name);
    if(entry.isDirectory()) manifests(filename);
    else if(entry.name==='package.json') {
      try {const p=JSON.parse(fs.readFileSync(filename,'utf8'));
        if(p.name&&p.version) packages.push({name:p.name,version:p.version,path:path.relative(root,filename),scripts:Object.fromEntries(Object.entries(p.scripts||{}).filter(([k])=>/^(preinstall|install|postinstall|prepare)$/.test(k))),repository:p.repository});
      } catch {}
    }
  }
}
manifests(path.join(root,'node_modules'));
const currentPaths=git(['ls-tree','-r','--name-only','refs/heads/codex/sc6106-native-store']).trim().split('\n');
const report={date:'2026-11-23',head:git(['rev-parse','refs/heads/codex/sc6106-native-store']).trim(),commits:Number(git(['rev-list','--all','--count']).trim()),blobCount,scannedBytes,binary,candidates,emailContainingBlobs:emails,personalPathContainingBlobs:personalPaths,sensitiveFilenames:currentPaths.filter(p=>/(^|\/)(\.env(?:\.|$)|.*\.(?:pem|key|p12|sqlite|db)$|id_rsa|wallet\.json)/i.test(p)),packages};
fs.writeFileSync(path.join(root,'evidence/source-security-scan.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,packages:undefined,emailContainingBlobs:emails.length,personalPathContainingBlobs:personalPaths.length,packagesScanned:packages.length,lifecycleScripts:packages.filter(p=>Object.keys(p.scripts).length)},null,2));
