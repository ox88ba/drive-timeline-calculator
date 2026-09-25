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
  if(width===393) await page.screenshot({path:'/tmp/roadbook-mobile-top.png'});
  await page.locator('.stay-editor summary').first().click(); await page.locator('[data-action="toggle-stay"][data-minutes="60"]').first().click(); await page.waitForTimeout(100);
  assert.equal(await page.locator('.stay-editor').first().getAttribute('open'),'');
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
