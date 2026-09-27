const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:393,height:844}});
  await page.addInitScript(()=>{
   localStorage.setItem('drive-timeline-trip-v1',JSON.stringify({startLocation:{name:'起点',latitude:30,longitude:100},initialDepartureTime:'2030-09-30T10:00:00Z',destinations:[{id:'test',location:{name:'终点',latitude:31,longitude:101},route:{distanceMeters:100000,durationSeconds:7200,strategy:'highway',polyline:[[100,30],[100.4,30.7],[101,31]]},selectedStayButtons:[60],stayMode:'duration'}]}));
   window.AMap={Map:class {
    constructor(el){this.el=el;window.testMap=this;this.zoom=5;}
    remove(){} add(){} setZooms(){} setFitView(){} getZoom(){return this.zoom;}
    getCenter(){return {toString:()=> '100.5,30.5'};} once(name,fn){fn();} destroy(){}
    lngLatToContainer([x,y]){return {getX:()=>30+(x-100)*(this.el.clientWidth-60),getY:()=>30+(31-y)*(this.el.clientHeight-60)};}
   },Polyline:class {},Marker:class {},Pixel:class {}};
  });
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());if(u.hostname!=='local.test')return r.abort();
   if(u.pathname==='/config.js')return r.fulfill({contentType:'application/javascript',body:'window.DRIVE_API_BASE_URL="https://local.test";window.DRIVE_AI_ENABLED=false;'});
   if(u.pathname.startsWith('/api/'))return r.fulfill({json:{elevationMeters:100}});
   const file=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));if(!fs.existsSync(file))return r.abort();
   return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('https://local.test/');await page.waitForFunction(()=>window.testMap);
  const result=await page.evaluate(async()=>{
   // Simulate a successful DOM snapshot with its entire WebGL road layer missing.
   window.html2canvas=async(el,opts)=>{const c=document.createElement('canvas');c.width=opts.width*2;c.height=opts.height*2;const ctx=c.getContext('2d');ctx.fillStyle='#f5f7fb';ctx.fillRect(0,0,c.width,c.height);return c;};
   const blob=await DriveMapSnapshot.capture();const image=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(0,0,c.width,c.height).data;let blue=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]===49&&pixels[i+1]===94&&pixels[i+2]===251)blue++;
   const url=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
   window.html2canvas=()=>{throw new Error('DOM screenshot must not be used');};
   window.testMap.zoom++;await DriveMapSnapshot.capture();
   const fallback=DriveMapSnapshot.caption.includes('底图暂不可用');
   const paths=[[[100,30],[100.4,30.7],[101,31]]],markers=[{coordinate:[100,30],number:'01'},{coordinate:[101,31],number:'02'}];
   const bg=document.createElement('canvas');bg.width=2000;bg.height=880;
   const bctx=bg.getContext('2d');bctx.fillStyle='#ddd';bctx.fillRect(0,0,2000,880);
   const bgBlob=await new Promise(r=>bg.toBlob(r));
   let requests=0;window.fetch=async()=>{requests++;return new Response(bgBlob,{headers:{'content-type':'image/png'}});};
   const success=await RoadbookMapExport.render(paths,markers,'https://test');
   await RoadbookMapExport.render(paths,markers,'https://test');
   const c2=document.createElement('canvas');c2.width=2000;c2.height=880;
   c2.getContext('2d').setTransform(2,0,0,2,-100,-8000);
   RoadbookMapExport.draw(c2,RoadbookMapExport.layout(paths,markers),1000,440);
   const p2=c2.getContext('2d').getImageData(0,0,2000,880).data;
   let restored=0;for(let i=0;i<p2.length;i+=4)if(p2[i]===49&&p2[i+1]===94&&p2[i+2]===251)restored++;
   return {blue,url,fallback,success:!success.fallback,requests,restored};
  });
  assert.ok(result.blue>1000,'export contains roads');assert.ok(result.fallback,'explicit degraded caption');
  assert.ok(result.success,'valid static basemap');assert.equal(result.requests,1,'reuse decoded valid basemap');
  assert.ok(result.restored>1000,'reset nonidentity transform');
  fs.writeFileSync('/tmp/roadbook-map-export.png',Buffer.from(result.url.split(',')[1],'base64'));
  console.log('PASS independent roads, failed-basemap fallback, static image success/cache, transform reset, viewport independence');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
