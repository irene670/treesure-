import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initialContent} from '../content-seed.mjs';

const output='docs';
const modules=readdirSync('public').filter(name=>name.endsWith('.js')).sort();
const hash=createHash('sha256');
for(const name of [...modules,'style.css'])hash.update(readFileSync(`public/${name}`));
hash.update(JSON.stringify(initialContent));
const version=hash.digest('hex').slice(0,12);
if(existsSync(output))rmSync(output,{recursive:true,force:true});
mkdirSync(output);
cpSync('public',output,{recursive:true,filter:source=>!source.includes('/uploads')});
for(const name of modules){const source=readFileSync(`public/${name}`,'utf8').replace(/(['"])(\.\/[^'"]+\.js)\1/g,(_,quote,path)=>`${quote}${path}?v=${version}${quote}`);writeFileSync(`${output}/${name}`,source);}
const index=readFileSync('public/index.html','utf8')
  .replace('<html lang="zh-Hant">','<html lang="zh-Hant" data-static-demo="true" data-base-path="/treesure-">')
  .replace('href="/assets/leaf.svg"','href="./assets/leaf.svg"')
  .replace('href="/style.css"',`href="./style.css?v=${version}"`)
  .replace('src="/app.js"',`src="./app.js?v=${version}"`);
writeFileSync(`${output}/index.html`,index);
writeFileSync(`${output}/.nojekyll`,'');
writeFileSync(`${output}/demo-seed.json`,JSON.stringify(initialContent,null,2));
writeFileSync(`${output}/404.html`,`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/treesure-/"><title>森藏永續文教協會</title></head><body><a href="/treesure-/">返回協會首頁</a></body></html>`);
console.log('GitHub Pages build ready: docs/');
