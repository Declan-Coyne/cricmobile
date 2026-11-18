// Build: bundle src/main.js with esbuild and inline into a single offline HTML file.
import * as esbuild from 'esbuild';
import fs from 'fs';
import { execSync } from 'child_process';

const res = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, loader: { '.csv': 'text' }, minify: true, format: 'iife', write: false, target: ['safari16'], legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync('src/index.html', 'utf8');
const version = Date.now().toString(36);
fs.mkdirSync('dist', { recursive: true });

// 1) Standalone single file (works by itself, no network)
const single = tpl.replace('<!--PWA-->', '').replace('<!--SW-->', '').replace('/*BUNDLE*/', () => js);
fs.writeFileSync('dist/cricmobile.html', single);

// 2) PWA version (index.html + manifest + service worker + icons) for "Add to Home Screen" offline install
const pwaHead = `<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png"><link rel="icon" href="icon-192.png">`;
const swReg = `<script>if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}</script>`;
fs.writeFileSync('dist/index.html', tpl.replace('<!--PWA-->', pwaHead).replace('<!--SW-->', swReg).replace('/*BUNDLE*/', () => js));
fs.writeFileSync('dist/manifest.webmanifest', JSON.stringify({
  name: 'CricMobile', short_name: 'CricMobile', start_url: './index.html', scope: './', display: 'standalone', orientation: 'portrait',
  background_color: '#06122b', theme_color: '#06122b',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
}, null, 2));
fs.writeFileSync('dist/sw.js', `const C='cm-${version}';const F=['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(n=>{const cp=n.clone();caches.open(C).then(c=>c.put(e.request,cp));return n;}).catch(()=>caches.match('./index.html'))))});
`);
execSync((process.platform === 'win32' ? 'python' : 'python3') + ' icon.py', { stdio: 'inherit' });
console.log('built', (single.length / 1024).toFixed(0) + ' KB');
