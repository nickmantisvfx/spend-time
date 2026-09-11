/* Only the two engine assets use this transport. Saves and Telegram traffic
   keep their original storage and fetch paths. No service worker is required. */
window.installSpendTimeTransport = function(config, archives) {
  const originalFetch = window.fetch.bind(window);
  const paths = new Map(Object.entries(archives).map(([file, info]) => [new URL(file, location.href).href, info]));
  const progress = new Map();
  let lastActivity = Date.now(), stopped = false;
  const controllers = new Set();
  const update = (key, bytes) => {
    lastActivity = Date.now(); progress.set(key, bytes);
    const loaded = [...progress.values()].reduce((a,b)=>a+b,0);
    const total = Object.values(archives).reduce((a,b)=>a+b.size,0);
    const bar = document.getElementById('load-progress'); bar.max=total;bar.value=loaded;
    document.getElementById('load-bytes').textContent=(loaded/1e6).toFixed(1)+' / '+(total/1e6).toFixed(1)+' MB';
  };
  const cachePromise = ('caches' in window ? caches.open('spend-time-assets-v1').catch(()=>null) : Promise.resolve(null));
  async function download(url, key) {
    const controller = new AbortController();controllers.add(controller);
    let timer;
    const heartbeat=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),20000);};
    heartbeat();
    try {
      const response = await originalFetch(url,{signal:controller.signal});
      if(!response.ok) throw Error('HTTP '+response.status);
      const reader=response.body.getReader(),chunks=[];let length=0;
      while(true){const {value,done}=await reader.read();if(done)break;heartbeat();chunks.push(value);length+=value.length;update(key,length);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return bytes;
    } finally {clearTimeout(timer);controllers.delete(controller);}
  }
  window.fetch=async function(input, options) {
    const url=new URL(typeof input==='string'?input:input.url,location.href).href;
    const info=paths.get(url);
    if(!info || !('DecompressionStream' in window))return originalFetch(input,options);
    const cache=await cachePromise, archiveURL=new URL(info.file,location.href).href;
    let lastError;
    for(let attempt=0;attempt<2;attempt++) {
      if(stopped)throw Error('Loading stopped');
      try {
        const saved=attempt===0&&cache?await cache.match(archiveURL):null;
        const bytes=saved?new Uint8Array(await saved.arrayBuffer()):await download(archiveURL,url);
        update(url,info.size);
        // Some hosts decode Content-Encoding themselves; detect gzip by its bytes.
        const compressed=bytes[0]===0x1f&&bytes[1]===0x8b;
        const decoded=compressed?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():bytes.buffer;
        if(decoded.byteLength!==info.rawSize)throw Error('Incomplete game asset');
        if(cache&&!saved)await cache.put(archiveURL,new Response(bytes)).catch(()=>{});
        return new Response(decoded,{headers:{'Content-Type':url.endsWith('.wasm')?'application/wasm':'application/octet-stream'}});
      } catch(error) {lastError=error;if(cache)await cache.delete(archiveURL).catch(()=>{});}
    }
    window.dispatchEvent(new CustomEvent('spend-time-load-error',{detail:lastError}));
    throw lastError;
  };
  return {
    touch:()=>{lastActivity=Date.now();},
    stalled:()=>Date.now()-lastActivity>35000,
    stop(){stopped=true;controllers.forEach(c=>c.abort());},
    async done(){this.stop();window.fetch=originalFetch;const cache=await cachePromise;if(!cache)return;try{const keep=new Set(Object.values(archives).map(a=>new URL(a.file,location.href).href));for(const entry of await cache.keys()){if(!keep.has(entry.url))await cache.delete(entry);}}catch(_){/* Cache cleanup must never prevent play. */}}
  };
};
