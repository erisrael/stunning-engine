const CACHE="myseed-kiosk-v1";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET"||event.request.mode!=="navigate")return;
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||url.pathname!=="/kiosk"||url.search)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>await caches.match(event.request)||new Response("The kiosk is offline. Reconnect to load attendance.",{headers:{"Content-Type":"text/plain"}})));
});
