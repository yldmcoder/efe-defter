var V="efe-v6";
var FILES=["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2", "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2", "fonts/barlow-latin-600-normal.woff2", "fonts/barlow-condensed-latin-ext-600-normal.woff2", "fonts/barlow-condensed-latin-ext-700-normal.woff2", "fonts/barlow-latin-ext-400-normal.woff2", "fonts/barlow-latin-ext-500-normal.woff2", "fonts/barlow-latin-ext-600-normal.woff2", "fonts/ibm-plex-mono-latin-400-normal.woff2", "fonts/ibm-plex-mono-latin-500-normal.woff2"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(V).then(function(c){return c.addAll(FILES)}).then(function(){return self.skipWaiting()}))});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener("fetch",function(e){
  var r=e.request;if(r.method!=="GET")return;
  if(r.mode==="navigate"){
    e.respondWith(fetch(r).then(function(res){var cp=res.clone();caches.open(V).then(function(c){c.put("index.html",cp)});return res}).catch(function(){return caches.match("index.html")}));
    return;
  }
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){return hit||fetch(r)}));
});
