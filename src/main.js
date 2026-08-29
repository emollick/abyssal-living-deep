import { App } from './core/App.js';

const boot = document.getElementById('boot');
const bootBar = document.querySelector('#bootbar i');
const bootMsg = document.getElementById('bootmsg');
const bootErr = document.getElementById('booterr');
const hud = document.getElementById('hud');

function progress(msg, p) {
  bootMsg.textContent = msg;
  if (p !== undefined) bootBar.style.width = `${Math.round(p * 100)}%`;
}

function fail(err) {
  console.error(err);
  if (!boot.isConnected) document.body.appendChild(boot);
  boot.classList.remove('hidden'); boot.removeAttribute('aria-hidden'); boot.inert = false;
  bootMsg.textContent = 'The ocean could not start in this browser.';
  bootErr.replaceChildren();
  const message = document.createElement('p');
  message.textContent = 'This scene needs WebGL2 and hardware acceleration. Try a current desktop browser, or close other graphics-heavy tabs and reload.';
  const retry = document.createElement('button'); retry.textContent = 'Reload the scene';
  retry.style.marginTop = '16px'; retry.onclick = () => location.reload();
  const details = document.createElement('details'), summary = document.createElement('summary'), detail = document.createElement('pre');
  summary.textContent = 'Technical details'; detail.textContent = String(err?.message || err); details.append(summary, detail);
  details.style.marginTop = '16px'; bootErr.append(message, retry, details);
}

async function main() {
  const canvas = document.getElementById('gl');
  const app = new App(canvas, progress);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); app.running = false;
    fail(new Error('The graphics context was interrupted. Reload to restore the world from its seed.'));
  });
  window.__app = app;
  try {
    await app.init();
  } catch (e) {
    fail(e);
    return;
  }

  const { installDirector } = await import('./weather/Director.js');
  const director = installDirector(app);

  const { installUI } = await import('./ui/Overlay.js');
  installUI(app);

  const p = app.params;
  if (p.get('act') !== null) director.gotoAct(parseInt(p.get('act'), 10) || 0);
  if (p.get('director') === '0') director.enabled = false;
  if (p.get('debug') !== null) app.setDebugMode(parseInt(p.get('debug'), 10) || 0);
  if (p.get('paused') === '1') app.paused = true;

  const { Expedition } = await import('./underwater/Expedition.js');
  app.expedition = new Expedition(app);

  app.start();
  setTimeout(() => {
    boot.classList.add('hidden');
    boot.setAttribute('aria-hidden', 'true');
    boot.inert = true;
    setTimeout(() => boot.remove(), 1500);
    hud.classList.add('on');
    if (!app.expedition.active) document.body.classList.add('cine');
  }, 350);

  window.addEventListener('error', (e) => console.error('[runtime]', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('[promise]', e.reason));
}

main();
