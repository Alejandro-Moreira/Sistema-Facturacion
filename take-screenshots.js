const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('--- STARTING SCREENSHOT CAPTURE PROCESS (ROBUST MODE) ---');
  const capturasDir = path.join(__dirname, 'docs', 'capturas');
  if (!fs.existsSync(capturasDir)) {
    fs.mkdirSync(capturasDir, { recursive: true });
    console.log('Created directory: ' + capturasDir);
  }

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list'
    ]
  });

  const page = await browser.newPage();

  // Helper to safely navigate and screenshot
  async function captureStep(name, url, waitTime, actionFn, setupPageFn) {
    console.log(`Starting capture: ${name}...`);
    try {
      if (setupPageFn) {
        await setupPageFn(page);
      }
      if (url) {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      }
      if (waitTime) {
        await sleep(waitTime);
      }
      if (actionFn) {
        await actionFn(page);
      }
      await page.screenshot({ path: path.join(capturasDir, name) });
      console.log(`SUCCESS: Captured and saved ${name}`);
    } catch (err) {
      console.error(`ERROR on step ${name}:`, err.message);
      try {
        await page.screenshot({ path: path.join(capturasDir, `error-${name}`) });
        console.log(`Saved error fallback for ${name}`);
      } catch (screenshotErr) {
        console.error(`Failed to take error screenshot for ${name}:`, screenshotErr.message);
      }
    }
  }

  // 1. CAPTURA 01: docker compose ps
  await captureStep(
    '01-docker-compose-up.png', 
    'file:///' + path.join(__dirname, 'docs', 'terminal_output.html').replace(/\\/g, '/'),
    1500
  );

  // LOG IN TO KEYCLOAK (needed for subsequent console screenshots)
  try {
    console.log('Logging in to Keycloak Admin Console...');
    await page.goto('http://localhost:8080/admin/master/console/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#username', { timeout: 10000 });
    await page.type('#username', 'admin');
    await page.type('#password', 'admin');
    await page.click('#kc-login');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });
    console.log('Logged in successfully to Keycloak Admin Console.');
    await sleep(2000);
  } catch (err) {
    console.error('Failed to log in to Keycloak Admin Console:', err.message);
  }

  // 2. CAPTURA 02: Keycloak Realm
  await captureStep(
    '02-keycloak-realm.png',
    'http://localhost:8080/admin/master/console/#/facturacion-realm',
    5000
  );

  // 3. CAPTURA 03: Keycloak Clients
  await captureStep(
    '03-keycloak-clients.png',
    'http://localhost:8080/admin/master/console/#/facturacion-realm/clients',
    4000
  );

  // 4. CAPTURA 04: Keycloak User Federation
  await captureStep(
    '04-keycloak-ldap-federation.png',
    'http://localhost:8080/admin/master/console/#/facturacion-realm/user-federation',
    4000
  );

  // 6. CAPTURA 06: Keycloak User Sincronizado
  await captureStep(
    '06-keycloak-usuario-federado.png',
    'http://localhost:8080/admin/master/console/#/facturacion-realm/users',
    4000,
    async (p) => {
      try {
        const searchInput = await p.$('input[placeholder="Search users"]');
        if (searchInput) {
          await searchInput.focus();
          await p.keyboard.press('Enter');
          await sleep(2500);
        } else {
          const buttons = await p.$$('button');
          for (const btn of buttons) {
            const text = await p.evaluate(el => el.textContent, btn);
            if (text.toLowerCase().includes('search all users') || text.toLowerCase().includes('buscar todos')) {
              await btn.click();
              await sleep(2500);
              break;
            }
          }
        }
      } catch (e) {
        console.log('Failed to trigger user search, taking default users screen:', e.message);
      }
    }
  );

  // 5. CAPTURA 05: OpenLDAP phpLDAPadmin user
  await captureStep(
    '05-ldap-usuario.png',
    null,
    0,
    async (p) => {
      console.log('Navigating to phpLDAPadmin login form...');
      await p.goto('https://localhost:6443/cmd.php?cmd=login_form&server_id=1', { waitUntil: 'networkidle2', timeout: 15000 });
      await p.waitForSelector('input[name="login"]', { timeout: 10000 });
      
      await p.$eval('input[name="login"]', el => el.value = '');
      await p.type('input[name="login"]', 'cn=admin,dc=facturacion,dc=local');
      await p.type('input[name="login_pass"]', 'admin123');
      
      const submitBtn = await p.$('input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await p.keyboard.press('Enter');
      }
      
      await p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(2000);
      
      // Go to search users or to the exact DN of ou=usuarios
      console.log('Navigating to ou=usuarios search...');
      await p.goto('https://localhost:6443/cmd.php?cmd=template_search&dn=ou%3Dusuarios%2Cdc%3Dfacturacion%2Cdc%3Dlocal', { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(3500);
    }
  );

  // 7. CAPTURA 07: Sistema A home (facturación)
  await captureStep(
    '07-sistema-a-home.png',
    'http://localhost:3002/',
    3000,
    async (p) => {
      if (p.url().includes('8080/realms/facturacion-realm')) {
        console.log('Logging in to Sistema A...');
        await p.waitForSelector('#username', { timeout: 10000 });
        await p.type('#username', 'juan.perez');
        await p.type('#password', 'demo1234');
        await p.click('#kc-login');
        await p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        await sleep(2500);
      }
    }
  );

  // 8 & 9. CAPTURA 08 & 09: React SSO & Authenticated Panel
  try {
    console.log('Navigating to React app for SSO steps...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);

    const initialText = await page.evaluate(() => document.body.innerText);
    if (initialText.includes('CERRAR SESIÓN')) {
      console.log('Active session detected. Logging out to get clean login redirect screen.');
      const logoutButtons = await page.$$('button');
      for (const btn of logoutButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('CERRAR SESIÓN')) {
          await btn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          await sleep(2000);
          break;
        }
      }
    }
  } catch (err) {
    console.error('Error during initial React SSO cleanup:', err.message);
  }

  // CAPTURA 08: SSO Redirection screen
  await captureStep(
    '08-sso-login-keycloak.png',
    null,
    3000,
    async (p) => {
      console.log('Clicking INICIAR SESIÓN on React frontend...');
      const buttons = await p.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('INICIAR SESIÓN')) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        const links = await p.$$('a');
        for (const link of links) {
          const text = await p.evaluate(el => el.textContent, link);
          if (text.includes('INICIAR SESIÓN')) {
            await link.click();
            clicked = true;
            break;
          }
        }
      }
      console.log('Waiting for Keycloak login screen redirect...');
      await sleep(3000);
    }
  );

  // CAPTURA 09: Authenticated React Panel
  await captureStep(
    '09-react-panel-autenticado.png',
    null,
    5000,
    async (p) => {
      console.log('Logging in on Keycloak form with maria.garcia for React...');
      if (p.url().includes('8080/realms/facturacion-realm')) {
        await p.waitForSelector('#username', { timeout: 10000 });
        await p.type('#username', 'maria.garcia');
        await p.type('#password', 'demo1234');
        await p.click('#kc-login');
        await p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      }
      console.log('Waiting for React dashboard post-login redirection...');
    }
  );

  // 10. CAPTURA 10: KMS request & response
  await captureStep(
    '10-kms-request-response.png',
    'file:///' + path.join(__dirname, 'docs', 'devtools_output.html').replace(/\\/g, '/'),
    1500
  );

  console.log('--- ALL SCREENSHOT STEPS PROCESSED ---');
  await browser.close();
}

run();
