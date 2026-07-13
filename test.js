const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 850 } });
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));

  await page.goto('http://localhost:8791/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // --- Recetas: quick add ---
  await page.fill('#qTitulo', 'Tortilla de patatas');
  await page.fill('#qCat', 'Comida');
  await page.fill('#qRaciones', '4');
  await page.fill('#qTiempo', '45 min');
  await page.click('#qAdd');
  await page.waitForTimeout(200);

  // should now be in edit form (panel open)
  const panelShown = await page.$eval('#panel', el => el.classList.contains('show'));
  console.log('EDIT PANEL OPEN AFTER QUICK ADD:', panelShown);

  // add ingredient rows
  await page.click('#addIngRow');
  const rows = await page.$$('.ingrow');
  console.log('INGREDIENT ROWS:', rows.length);
  const nameInputs = await page.$$('.ingName');
  const qtyInputs = await page.$$('.ingQty');
  const unitInputs = await page.$$('.ingUnit');
  await nameInputs[0].fill('Patatas');
  await qtyInputs[0].fill('1');
  await unitInputs[0].fill('kg');
  await nameInputs[1].fill('Huevos');
  await qtyInputs[1].fill('6');
  await unitInputs[1].fill('ud');
  await page.fill('#eSteps', 'Pelar y cortar las patatas.\nFreír a fuego medio.\nBatir los huevos y mezclar.\nCuajar la tortilla.');
  await page.click('#saveR');
  await page.waitForTimeout(200);

  const detailHtml = await page.$eval('#panelBody', el => el.innerHTML);
  console.log('HAS PATATAS:', detailHtml.includes('Patatas'));
  console.log('HAS STEP 4:', detailHtml.includes('Cuajar la tortilla'));

  await page.click('#panelClose');
  await page.waitForTimeout(150);

  // list shows the row
  const listText = await page.$eval('#listHost', el => el.innerText);
  console.log('LIST HAS RECIPE:', listText.includes('Tortilla de patatas'));

  // --- add a second recipe for variety ---
  await page.fill('#qTitulo', 'Ensalada César');
  await page.fill('#qCat', 'Ensalada');
  await page.click('#qAdd');
  await page.waitForTimeout(200);
  await page.click('#panelClose');
  await page.waitForTimeout(150);

  // --- Calendario tab ---
  await page.click('#tabCalendario');
  await page.waitForTimeout(200);
  const yearVisible = await page.$eval('#calHost', el => el.innerText.includes('Año'));
  console.log('YEAR VIEW VISIBLE:', yearVisible);

  // go into current month
  const now = new Date();
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const curMonthName = monthNames[now.getMonth()];
  await page.click(`.mini-head:has-text("${curMonthName}")`);
  await page.waitForTimeout(200);
  const monthTitle = await page.$eval('.calnav h2', el => el.textContent);
  console.log('MONTH VIEW TITLE:', monthTitle);

  // open drawer via FAB
  await page.click('#fabDrawer');
  await page.waitForTimeout(200);
  const drawerOpen = await page.$eval('#rdrawer', el => el.classList.contains('show'));
  console.log('DRAWER OPEN:', drawerOpen);

  // tap (click, no drag) a recipe node to arm it
  await page.click('.rnode:has-text("Tortilla de patatas")');
  await page.waitForTimeout(150);
  const armedBarVisible = await page.$eval('#armedBar', el => el.classList.contains('show'));
  console.log('ARMED BAR VISIBLE:', armedBarVisible);

  // click today's day cell to place it
  const todayIso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  await page.click(`.daycell[data-drop-date="${todayIso}"]`);
  await page.waitForTimeout(250);
  const toastText = await page.$eval('#toast', el => el.textContent);
  console.log('TOAST AFTER PLACE:', toastText);

  const cellHtml = await page.$eval(`.daycell[data-drop-date="${todayIso}"]`, el => el.innerHTML);
  console.log('CELL HAS CHIP:', cellHtml.includes('Tortilla de patatas'));

  // navigate to day view for today (click day number area again, now not armed)
  await page.click(`.daycell[data-drop-date="${todayIso}"] .daynum`);
  await page.waitForTimeout(200);
  const dayViewText = await page.$eval('#calHost', el => el.innerText);
  console.log('DAY VIEW HAS RECIPE:', dayViewText.includes('Tortilla de patatas'));

  // remove entry via x button in day view
  const removeBtn = await page.$('.dayview-row [data-rment]');
  if (removeBtn) { await removeBtn.click(); await page.waitForTimeout(200); }
  const dayViewText2 = await page.$eval('#calHost', el => el.innerText);
  console.log('DAY VIEW AFTER REMOVE STILL HAS RECIPE:', dayViewText2.includes('Tortilla de patatas'));

  // week view via breadcrumb / weeklab: go back to month then click a weeklab
  await page.click('.crumbs button:has-text("' + curMonthName + '")').catch(()=>{});
  await page.waitForTimeout(150);
  const weeklab = await page.$('.weeklab');
  if (weeklab) { await weeklab.click(); await page.waitForTimeout(200); }
  const weekViewTitle = await page.$eval('.calnav h2', el => el.textContent).catch(()=> 'N/A');
  console.log('WEEK VIEW TITLE:', weekViewTitle);

  // export backup
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btnExport')
  ]);
  const path = await download.path();
  console.log('EXPORT FILE EXISTS:', !!path);

  console.log('CONSOLE/PAGE ERRORS:', JSON.stringify(errors));

  await browser.close();
})().catch(e => { console.error('TEST SCRIPT FAILED:', e); process.exit(1); });
