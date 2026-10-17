import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the production renderer with a small DOM adapter; no browser dependency in CI.
class Element {
  constructor(tag, text = '') { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.value = text; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
  set textContent(value) { this.children = []; this.value = String(value); }
  get textContent() { return this.value + this.children.map(n => n.textContent).join(''); }
}
const document = {
  createElement: tag => new Element(tag),
  createTextNode: text => new Element('#text', String(text)),
};
const source = readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8');
const elSource = source.slice(source.indexOf('  function el('), source.indexOf('  // Reuse the dashboard'));
const renderer = source.slice(source.indexOf('  function markdown('), source.indexOf('  // ---- chat apps'));
const { markdown } = runInNewContext(elSource + renderer + '\n({ markdown });', { document });
function nodes(root, tag) { return [root, ...root.children.flatMap(n => nodes(n, tag))].filter(n => n.tagName === tag.toUpperCase()); }

test('bare URLs render once without recursive autolinking', () => {
  const root = markdown('See https://example.com/settings for the details.');
  const links = nodes(root, 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].attributes.href, 'https://example.com/settings');
  assert.equal(links[0].textContent, 'https://example.com/settings');
  assert.equal(root.textContent, 'See https://example.com/settings for the details.');
});

test('URL labels and formatted URL labels never create nested links', () => {
  for (const text of ['[https://example.com](https://example.com)', '[**https://example.com**](https://example.com)']) {
    const root = markdown(text);
    assert.equal(nodes(root, 'a').length, 1);
    assert.equal(root.textContent, 'https://example.com');
  }
  assert.equal(nodes(markdown('[**Read docs**](https://example.com)'), 'strong').length, 1);
});

test('links retain scheme restrictions and render HTML as text', () => {
  const root = markdown('[unsafe](javascript:alert) <img src=x onerror=alert>');
  assert.equal(nodes(root, 'a').length, 0);
  assert.equal(nodes(root, 'img').length, 0);
  assert.match(root.textContent, /<img src=x onerror=alert>/);
  const mail = nodes(markdown('[https://example.com](mailto:help@example.com)'), 'a');
  assert.equal(mail.length, 1);
  assert.equal(mail[0].attributes.href, 'mailto:help@example.com');
});
