const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const width of [393, 900]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const css = ['styles.css', 'timeflow.css', 'voyage.css', 'tripkit.css'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
      for (const destination of [false, true]) {
        await page.setContent(`<html data-skin="voyage" data-engine="timeflow" data-theme="light"><head><style>${css}</style></head><body>
          ${destination ? '<div class="destination-wrap tf-enter">' : ''}
          <section class="${destination ? 'destination-card tf-inview' : 'start-card'}" style="height:130px;margin-top:60px">
            <div class="place-picker"><input value="公园"><div class="poi-results">${'<button class="poi-option">候选地点</button>'.repeat(12)}</div></div>
          </section>${destination ? '</div>' : ''}
          <div class="destination-wrap"><div class="route-connector">导航数据待获取</div><section class="destination-card" style="height:300px">下一个地点</section></div>
          </body></html>`);
        await page.waitForTimeout(650);
        const result = await page.evaluate(() => {
          const list = document.querySelector('.poi-results');
          const r = list.getBoundingClientRect();
          const points = [document.querySelector('.route-connector'), document.querySelectorAll('.destination-card')[document.querySelectorAll('.destination-card').length - 1]];
          return {
            hits: points.map(el => { const b = el.getBoundingClientRect(); const y = Math.max(b.top + 5, r.top + 5); return y < r.bottom && list.contains(document.elementFromPoint(r.left + 20, y)); }),
            scrollable: list.scrollHeight > list.clientHeight,
            overflow: getComputedStyle(list).overflowY
          };
        });
        assert.deepEqual(result.hits, [true, true], `layering at ${width}, destination=${destination}`);
        assert.equal(result.scrollable, true);
        assert.equal(result.overflow, 'auto');
        await page.locator('.poi-results').evaluate(el => { el.hidden = true; });
        assert.equal(await page.locator(destination ? '.destination-wrap' : '.start-card').first().evaluate(el => getComputedStyle(el).zIndex), 'auto');
      }
      await page.close();
    }
    console.log('POI layers: start/destination, mobile/desktop, scrolling and reset passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
