// Local component evidence only; no provider or deployed-canvas claim.
import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const bundle = await build({
  stdin: {
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import EquationGenerator from './EquationGenerator.jsx';function App(){const[scope,setScope]=useState('board-a'),[readOnly,setReadOnly]=useState(false);window.fixture={setScope,setReadOnly};return <EquationGenerator scopeKey={scope} readOnly={readOnly} onGenerate={request=>{(window.calls||=[]).push(request.prompt);return new Promise((resolve,reject)=>(window.pending||=[]).push({resolve,reject}));}} onAccept={result=>{(window.accepted||=[]).push(result);return window.refuse?{ok:false,error:'The equation changed.'}:{ok:true}}}/>;}createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: fileURLToPath(new URL("../src", import.meta.url)),
    loader: "jsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"' },
});
const browser = await chromium.launch({ headless: true });
let passed = 0;
try {
  const page = await browser.newPage(),
    requests = [],
    errors = [];
  await page.route("**/*", (route) => {
    if (route.request().url() === "https://equation-fixture.test/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    requests.push(route.request().url());
    return route.abort();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("https://equation-fixture.test/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const prompt = page.getByLabel("Equation description"),
    generate = page.getByRole("button", { name: "Generate", exact: true });
  await prompt.waitFor();
  assert.equal(await generate.isDisabled(), true);
  await prompt.fill("A quadratic formula");
  assert.equal(await page.evaluate(() => (window.calls || []).length), 0);
  passed++;
  await generate.click();
  assert.equal(
    await page.getByRole("button", { name: "Generating" }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() =>
    window.pending[0].resolve({ result: { kind: "equation", latex: "x" } }),
  );
  await page.waitForTimeout(30);
  assert.equal(await page.locator("[data-equation-proposal]").count(), 0);
  passed++;
  await generate.click();
  await page.evaluate(() =>
    window.pending[1].resolve({
      result: { kind: "equation", latex: "x^2", assumptions: ["x is real."] },
    }),
  );
  await page.locator("[data-equation-rendered] .katex").waitFor();
  assert.equal(await page.getByLabel("Generated LaTeX").inputValue(), "x^2");
  assert.equal(await page.evaluate(() => (window.accepted || []).length), 0);
  passed++;
  await page.getByLabel("Generated LaTeX").fill("x^3");
  assert.equal(await page.evaluate(() => window.calls.length), 2);
  assert.equal(
    await page.getByRole("button", { name: "Insert", exact: true }).isEnabled(),
    true,
  );
  passed++;
  await page.getByLabel("Generated LaTeX").fill("\\frac{");
  assert.equal(
    await page
      .getByRole("button", { name: "Insert", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Generated LaTeX").fill("x^3");
  passed++;
  await generate.click();
  await page.evaluate(() =>
    window.pending[2].reject(new Error("Spend limit reached")),
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Spend limit reached" })
    .waitFor();
  assert.equal(await page.getByLabel("Generated LaTeX").inputValue(), "x^3");
  assert.equal(await prompt.inputValue(), "A quadratic formula");
  passed++;
  await page.evaluate(() => (window.refuse = true));
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "The equation changed." })
    .waitFor();
  passed++;
  await page.evaluate(() => (window.refuse = false));
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Applied", exact: true })
      .isDisabled(),
    true,
  );
  passed++;
  await generate.click();
  await page.evaluate(() => window.fixture.setScope("board-b"));
  await page.evaluate(() =>
    window.pending[3].resolve({ result: { kind: "equation", latex: "LATE" } }),
  );
  await page.waitForTimeout(30);
  assert.equal(await page.locator("[data-equation-proposal]").count(), 0);
  passed++;
  await prompt.fill("Ambiguous equation");
  await generate.click();
  await page.evaluate(() =>
    window.pending[4].resolve({
      result: { kind: "clarify", question: "Which variable?" },
    }),
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Which variable?" })
    .waitFor();
  passed++;
  await page.evaluate(() => window.fixture.setReadOnly(true));
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await prompt.isDisabled(), true);
  passed++;
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  passed++;
  console.log(
    JSON.stringify({
      passed,
      failed: 0,
      skipped: 0,
      networkRequests: 0,
      scope:
        "deterministic equation component, no math/model or canvas-persistence verification",
    }),
  );
} finally {
  await browser.close();
}
