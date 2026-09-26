const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const K = 'drive-timeline-trip-v1';
const start = { name:'测试出发点', latitude:29.56, longitude:106.55, poiId:'START' };
function fixture(count) { return { startLocation:start, startSearchText:start.name, initialDepartureTime:'2030-09-30T10:00:00Z', destinations:Array.from({length:count},(_,i)=>({ id:'s'+i, location:{name:i?'目的地'+i:'这是一个超过三十个字的目的地景区南门停车场请完整显示而不要被截断', address:'测试地址', latitude:30+i/10,longitude:106+i/10,poiId:'P'+i},route:{durationSeconds:18000,distanceMeters:300000,strategy:'highway'},elevationMeters:3000+i*100,selectedStayButtons:[120],stayMode:'duration' })) }; }
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try { for(const width of [375,390,393,430,1280]) {
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}); const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(({K,seed})=>{if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem(K,JSON.stringify(seed)); sessionStorage.setItem('qa-seeded','1'); }},{K,seed:fixture(3)});
  await context.route('**/*',async r=>{const u=new URL(r.request().url()); if(u.hostname!=='local.test') return r.abort();
   if(u.pathname==='/config.js') return r.fulfill({contentType:'application/javascript',body:'globalThis.DRIVE_AI_ENABLED=true;'});
   if(u.pathname.startsWith('/api/')) return r.fulfill({json:u.pathname.includes('elevation')?{elevationMeters:100}:{}});
   const file=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1)); if(!file.startsWith(root)||!fs.existsSync(file))return r.abort();
   return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('https://local.test/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(450);
  assert.deepEqual(errors,[],`JS errors ${width}`);
  const measurements=await page.evaluate(()=>({ overflow:document.documentElement.scrollWidth>innerWidth+1, start:document.querySelector('#startCard').getBoundingClientRect().top, date:document.querySelector('#departureDate').getBoundingClientRect().bottom, summary:document.querySelector('.summary').getBoundingClientRect().top, menu:getComputedStyle(document.querySelector('.card-more summary')).minHeight, name:document.querySelector('.place-name').textContent, closed:!document.querySelector('.stay-editor').open, map:document.querySelector('#routeMap').inert }));
  assert.equal(measurements.overflow,false,`overflow ${width}`); assert.ok(measurements.start<measurements.summary); assert.ok(measurements.date<844,`date off first screen ${width}: ${measurements.date}`); assert.equal(measurements.closed,true); assert.equal(measurements.map,true); assert.equal(measurements.menu,'44px');
  const typography=await page.locator('.destination-card').first().evaluate(card=>{
    const style=s=>getComputedStyle(card.querySelector(s));
    const meta=style('.place-meta');
    return {address:style('.place-address').fontSize,label:style('.time-grid > div > span').fontSize,
      hints:[...card.querySelectorAll('.arrival-hints > span')].map(el=>{const s=getComputedStyle(el);return {font:s.fontSize,family:s.fontFamily,color:s.color,border:s.borderTopWidth,bg:s.backgroundColor};}),
      meta:{font:meta.fontSize,family:meta.fontFamily,color:meta.color}};
  });
  assert.equal(typography.address,typography.label);
  const compact=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect();
    const card=document.querySelector('.destination-card');
    const n=getComputedStyle(card.querySelector('.station-number')),s=getComputedStyle(document.querySelector('.start-number'));
    const date=rect('.date-field'),time=rect('.time-field'),slider=rect('#tfWhatif'),quick=rect('.quick-starts');
    const row=card.querySelector('.card-topline'), picker=row.querySelector('.place-picker');
    return {number:[n.font,s.font,n.webkitTextStroke,s.webkitTextStroke,n.textShadow,s.textShadow],dateTop:date.top,timeTop:time.top,fieldsBottom:Math.max(date.bottom,time.bottom),sliderTop:slider.top,sliderBottom:slider.bottom,quickTop:quick.top,
      inRow:!!picker && !!row.querySelector('.card-more'),underline:getComputedStyle(picker.querySelector('.place-name')).borderBottomWidth,
      addressBelow:card.querySelector('.place-address').getBoundingClientRect().top>=row.getBoundingClientRect().bottom,
      blur:getComputedStyle(document.querySelector('.trip-dock')).backdropFilter};
  });
  assert.equal(compact.number[0],compact.number[1]); assert.equal(compact.number[2],compact.number[3]); assert.equal(compact.number[4],compact.number[5]);
  assert.equal(compact.dateTop,compact.timeTop); assert.ok(compact.sliderTop>=compact.fieldsBottom); assert.ok(compact.quickTop>=compact.sliderBottom);
  assert.ok(compact.inRow && compact.addressBelow); assert.equal(compact.underline,'1px'); assert.match(compact.blur,/blur/);
  const flagSizes=await page.locator('.card-flags').evaluateAll(flags=>flags.filter(f=>f.querySelector('.derived-tag')).map(f=>[getComputedStyle(f.querySelector('.derived-tag')).fontSize,getComputedStyle(f.querySelector('.overnight-badge')).fontSize]));
  assert.ok(flagSizes.length>0);
  for(const [derived,night] of flagSizes) assert.equal(derived,night);
  assert.ok(typography.hints.length>=2);
  for(const hint of typography.hints) { assert.equal(hint.font,typography.meta.font); assert.equal(hint.family,typography.meta.family); assert.equal(hint.color,typography.meta.color); assert.equal(hint.border,'0px'); assert.equal(hint.bg,'rgba(0, 0, 0, 0)'); }
  assert.equal(await page.locator('.dock-sort').isVisible(),false);
  assert.equal(await page.locator('#dockToggle').textContent(),'展开行程');
  await page.locator('#dockToggle').click();
  assert.equal(await page.locator('#dockToggle').textContent(),'收起行程');
  assert.equal(await page.locator('.dock-sort').isVisible(),true);
  assert.equal(await page.locator('.dock-title').isVisible(),false);
  assert.ok((await page.locator('.dock-sort').boundingBox()).x < (await page.locator('#dockToggle').boundingBox()).x);
  await page.locator('.dock-sort').click(); await page.locator('#dockToggle').click();
  assert.equal(await page.locator('.dock-sort').getAttribute('aria-pressed'),'false');
  if(width===393) await page.screenshot({path:'/tmp/roadbook-mobile-top.png'});
  await page.locator('.stay-editor summary').first().click(); await page.locator('[data-action="toggle-stay"][data-minutes="60"]').first().click(); await page.waitForTimeout(100);
  assert.equal(await page.locator('.stay-editor').first().getAttribute('open'),'');
  assert.equal(await page.locator('.stay-until-buttons small').count(),0);
  assert.match(await page.locator('.stay-editor summary').first().textContent(),/3小时/);
  await page.locator('.place-name').first().click(); await page.locator('[data-place-input]').first().fill('尚未提交的修改');
  await page.locator('.stay-editor summary').first().click();
  assert.equal(await page.locator('.stay-editor').first().getAttribute('open'),null,'outside action must not be lost while cancelling search');
  await page.locator('.card-more summary').first().click(); assert.equal(await page.locator('[data-action="remove"]').first().isVisible(),true);
  await page.locator('.card-more summary').first().click();
  await page.locator('.map-interaction-toggle').click(); assert.equal(await page.locator('#routeMap').evaluate(el=>el.inert),false); await page.locator('.map-interaction-toggle').click();
  if(width===393) {
    await page.locator('.destination-card').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(700); await page.screenshot({path:'/tmp/roadbook-mobile-card.png'});
    for (const count of [30,60]) {
      await page.evaluate(({K,seed})=>localStorage.setItem(K,JSON.stringify(seed)),{K,seed:fixture(count)});
      const time=Date.now(); await page.reload({waitUntil:'domcontentloaded'}); await page.locator('.place-name').last().waitFor();
      assert.equal(await page.locator('.destination-card').count(),count); assert.deepEqual(errors,[]);
      console.log(`PASS ${count} stops initial render ${Date.now()-time}ms`);
      await page.locator('.place-name').first().click(); await page.locator('[data-place-input]').first().fill('连续输入尚未提交');
      assert.equal(await page.locator('[data-place-input]').first().inputValue(),'连续输入尚未提交'); await page.keyboard.press('Escape');
      assert.match(await page.locator('.place-name').first().innerText(),/三十个字/);
    }
  }
  console.log(`PASS ${width}px mobile/layout/stay/menu/map`); await context.close();
 }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
