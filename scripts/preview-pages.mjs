import http from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';

const root=resolve('docs');
const server=http.createServer((req,res)=>{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith('/treesure-/')){res.writeHead(302,{Location:'/treesure-/'});res.end();return;}
  path=path.slice('/treesure-/'.length)||'index.html';
  const file=resolve(root,path);
  if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});createReadStream(file).pipe(res);
});
server.listen(4311,'127.0.0.1',()=>console.log('Pages preview: http://127.0.0.1:4311/treesure-/'));
