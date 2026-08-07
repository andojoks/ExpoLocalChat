import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(90000);
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const body = await page.locator('body').innerText();
if (
  /Could not download|Model server unavailable|Download .*MB/i.test(body) &&
  !/Welcome to QuestionBank/i.test(body)
) {
  console.log('STATUS=model_gate');
  console.log(body.slice(0, 300));
  await browser.close();
  process.exit(2);
}

const input = page.getByPlaceholder('Ask about a paper, topic, question, or explanation...');
await input.waitFor({ state: 'visible', timeout: 45000 });

const titleBox = await page.locator('text=QuestionBank AI').first().boundingBox();
if (titleBox) {
  await page.mouse.click(Math.max(12, titleBox.x - 36), titleBox.y + titleBox.height / 2);
}
await page.waitForTimeout(800);
if (await page.getByText('Start new chat').count()) {
  await page.getByText('Start new chat').click();
  await page.waitForTimeout(1000);
} else if (await page.getByText('Study chats').count()) {
  await page.keyboard.press('Escape');
}

await input.click();
await input.fill('Explain the osmosis question from Biology 2024');
await input.press('Enter');
await page.waitForTimeout(25000);

if (titleBox) {
  await page.mouse.click(Math.max(12, titleBox.x - 36), titleBox.y + titleBox.height / 2);
}
await page.waitForTimeout(1200);

const drawer = await page.locator('body').innerText();
const snippetStart = drawer.indexOf('Study chats');
const snippet = (
  snippetStart >= 0 ? drawer.slice(snippetStart, snippetStart + 600) : drawer.slice(0, 600)
).replace(/\s+/g, ' ');

console.log('STATUS=ok');
console.log('SNIPPET=' + snippet);
console.log('HAS_DEFAULT=' + /New study chat/i.test(drawer));
console.log('HAS_NAMED=' + /(Osmosis|Biology|Explain)/i.test(drawer));

await browser.close();
