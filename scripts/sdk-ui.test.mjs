// Offline UI regression checks: real browser, SDK source served through intercepted requests.
// Run: npm run test:widget (requires `npx playwright install chromium`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../public/sdk.js', import.meta.url), 'utf8');
const prompts = {
  en: ['Choose a category above to send.', 'Write a short report to send.'],
  fr: ['Choisissez une catégorie ci-dessus pour envoyer.', 'Écrivez un court signalement pour envoyer.'],
  ta: ['அனுப்ப மேலே ஒரு வகையைத் தேர்ந்தெடுக்கவும்.', 'அனுப்ப ஒரு சிறு புகாரை எழுதவும்.'],
  hi: ['भेजने के लिए ऊपर एक श्रेणी चुनें।', 'भेजने के लिए एक छोटी रिपोर्ट लिखें।'],
};

for (const lang of Object.keys(prompts)) {
  test(`composer requirements and choice affordances in ${lang}`, { timeout: 120000 }, async () => {
    const browser = await chromium.launch();
    try {
      for (const width of [375, 900]) {
        for (const theme of ['light', 'dark']) {
          const page = await browser.newPage({ viewport: { width, height: 800 } });
          await page.route('https://widget.test/**', route => route.fulfill({
            contentType: 'text/javascript; charset=utf-8', body: source,
          }));
          await page.route('https://app.test/', route => route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: `<html lang="${lang}"><meta charset="utf-8"><script src="https://widget.test/sdk.js" data-key="pk_test" data-theme="${theme}" data-preview="true"></script></html>`,
          }));
          // No real service or credentials are used; requests outside the fixture fail closed.
          await page.route('**/*', route => {
            const url = route.request().url();
            return url.startsWith('https://app.test/') || url.startsWith('https://widget.test/')
              ? route.fallback() : route.abort();
          });
          await page.goto('https://app.test/');
          await page.getByRole('button', { name: /./ }).first().click();
          const text = page.getByRole('textbox');
          const send = page.locator('button.send');
          const radios = page.getByRole('radio');
          const hint = page.locator('#report-requirement');
          await hint.waitFor();
          assert.equal(await hint.textContent(), prompts[lang][0]);
          assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
          await text.fill('I typed before choosing a category.');
          assert(await send.isDisabled());
          assert.equal(await hint.textContent(), prompts[lang][0]);
          assert.equal(await send.getAttribute('aria-describedby'), await hint.getAttribute('id'));
          const first = radios.first();
          const before = await first.evaluate(button => {
            const style = getComputedStyle(button);
            return { border: style.borderTopStyle, width: parseFloat(style.borderTopWidth), background: style.backgroundColor };
          });
          assert.equal(before.border, 'solid');
          assert(before.width >= 1, 'unselected options have visible individual borders');
          await first.focus();
          await first.press('ArrowRight');
          const second = radios.nth(1);
          assert.equal(await second.getAttribute('aria-checked'), 'true');
          assert(await send.isEnabled());
          assert.equal(await hint.textContent(), '');
          assert.notEqual(await second.evaluate(b => getComputedStyle(b).backgroundColor), before.background);
          await second.click();
          assert(await text.evaluate(t => t.getRootNode().activeElement === t), 'choosing a category focuses writing');
          await text.fill('   ');
          assert(await send.isDisabled());
          assert.equal(await hint.textContent(), prompts[lang][1]);
          const panel = await page.getByRole('dialog').boundingBox();
          assert(panel && panel.x >= 0 && panel.x + panel.width <= width + 1, 'panel stays within viewport');
          for (const radio of await radios.all()) {
            const box = await radio.boundingBox();
            assert(box && box.x >= panel.x && box.x + box.width <= panel.x + panel.width + 1, 'category choices wrap without clipping');
          }
          await text.fill('A report that is ready to send.');
          await send.scrollIntoViewIfNeeded();
          const sendBox = await send.boundingBox();
          assert(sendBox && sendBox.y >= panel.y && sendBox.y + sendBox.height <= panel.y + panel.height + 1, 'Send remains reachable inside the panel');
          await send.click();
          await page.locator('.view.sent[role="status"]').waitFor();
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}
