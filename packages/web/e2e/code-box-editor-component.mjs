// Isolated component checks. Application canvas/persistence integration is separate.
import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const bundle = await build({
  stdin: {
    contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import CodeBoxEditor from './CodeBoxEditor.jsx';function App(){const[value,setValue]=useState(''),[readOnly,setReadOnly]=useState(false);window.codeFixture={setReadOnly};return <CodeBoxEditor value={value} language="python" readOnly={readOnly} onChange={text=>{window.source=text;setValue(text)}} onApi={api=>window.codeApi=api} onExit={value=>(window.exits||=[]).push(value)} onInlineAI={value=>(window.inlineCalls||=[]).push(value)}/>;}createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: fileURLToPath(new URL("../src", import.meta.url)),
    loader: "jsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  jsx: "automatic",
});
const browser = await chromium.launch({ headless: true });
let passed = 0;
try {
  const page = await browser.newPage({
      viewport: { width: 1000, height: 700 },
    }),
    requests = [],
    errors = [];
  await page.route("**/*", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    '<div id="root" style="width:500px;height:300px"></div>',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const input = page.locator(".cm-content");
  await input.waitFor();
  await page.waitForTimeout(200);
  const type = async (text) => {
    await input.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText(text);
  };
  const source = () => page.evaluate(() => window.codeApi.getText());
  await type("customValue = 1\ncust");
  await page.keyboard.press("Control+Space");
  await page.getByRole("option").filter({ hasText: "customValue" }).waitFor();
  await page.waitForTimeout(100);
  await page.keyboard.press("Tab");
  assert.equal(await source(), "customValue = 1\ncustomValue");
  passed++;
  await page.keyboard.press("Control+z");
  assert.equal(await source(), "customValue = 1\ncust");
  await page.keyboard.press("Control+y");
  assert.equal(await source(), "customValue = 1\ncustomValue");
  passed++;
  await type("ret");
  await page.keyboard.press("Control+Space");
  await page.getByRole("listbox").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await source(), "ret");
  assert.equal(await page.evaluate(() => (window.exits || []).length), 0);
  passed++;
  await type("");
  await page.keyboard.press("Tab");
  assert.match(await source(), /^\s+$/);
  passed++;
  await type("if True:");
  await page.keyboard.press("Enter");
  assert.match(await source(), /^if True:\n\s+$/);
  passed++;
  await type("");
  await page.keyboard.type("(");
  assert.equal(await source(), "()");
  passed++;
  const literal = '\tα = "hello"\n\n';
  await type(literal);
  assert.equal(await source(), literal);
  passed++;
  await page.keyboard.press("Control+k");
  assert.equal(await page.evaluate(() => (window.inlineCalls || []).length), 1);
  passed++;
  await input.dispatchEvent("compositionstart");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Control+k");
  assert.equal(await source(), literal);
  assert.equal(await page.evaluate(() => (window.inlineCalls || []).length), 1);
  await input.dispatchEvent("compositionend");
  passed++;
  await type("ret");
  await page.keyboard.press("Control+Space");
  await page.getByRole("listbox").waitFor();
  const popup = page.locator(".cm-tooltip-autocomplete");
  assert.equal(
    await popup.evaluate(
      (element) => !document.querySelector("#root").contains(element),
    ),
    true,
  );
  const rect = await popup.boundingBox();
  assert.ok(
    rect.x >= 0 &&
      rect.x + rect.width <= 1000 &&
      rect.y >= 0 &&
      rect.y + rect.height <= 700,
  );
  passed++;
  await page.keyboard.press("Escape");
  await type(literal);
  await page.evaluate(() => window.codeFixture.setReadOnly(true));
  await page.waitForTimeout(50);
  assert.equal(await input.getAttribute("contenteditable"), "false");
  assert.equal(await source(), literal);
  passed++;
  await page.evaluate(() => window.codeFixture.setReadOnly(false));
  await input.click();
  await page.keyboard.press("Control+Enter");
  assert.equal(await page.evaluate(() => (window.exits || []).length), 1);
  passed++;
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  passed++;
  console.log(
    JSON.stringify({
      passed,
      failed: 0,
      skipped: 0,
      networkRequests: requests.length,
      scope: "isolated CodeBoxEditor component; not canvas persistence",
    }),
  );
} finally {
  await browser.close();
}
