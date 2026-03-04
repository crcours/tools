// ============================================================
//  pyodide-loader.js — Chargement de Pyodide + exécution de code
//
//  Ce fichier est INDÉPENDANT de turtle.js.
//  Les sections marquées [TURTLE] peuvent être supprimées si vous
//  n'utilisez pas le module turtle. Le fichier fonctionnera
//  normalement pour exécuter du Python sans turtle.
//
//  Dépendances HTML requises :
//    - <div id="status">
//    - <button id="run-btn">
//    - <div id="output">
//    - <span id="timing">
//    - variable globale `codeEl` (déclarée dans le script inline du HTML)
//      OU remplacer editor.getValue() par editor.getValue() si CodeMirror est utilisé
//
//  Dépendances HTML [TURTLE] (supprimables si pas de turtle) :
//    - <input id="speed-slider">
//    - <span id="speed-label">
//    - <div id="turtle-panel"> et <div id="output-panel">
//    - <button class="tab-btn" data-tab="...">
//    - turtle.js chargé AVANT ce fichier (fournit TURTLE_MODULE,
//      clearCanvas, replayCommands, window._turtleCommands)
// ============================================================

const statusEl = document.getElementById('status');
const runBtn   = document.getElementById('run-btn');
const outputEl = document.getElementById('output');
const timing   = document.getElementById('timing');
// codeEl est déjà déclaré dans le script inline de index.html
// const codeEl = document.getElementById('code');

let pyodide = null;

// ── [TURTLE] Slider de vitesse ───────────────────────────────
// Supprimez ce bloc si vous n'utilisez pas turtle.
const speedSlider = document.getElementById('speed-slider');
const speedLabel  = document.getElementById('speed-label');

function getDelay() {
  const v = parseInt(speedSlider.value);
  if (v === 10) return 0;
  if (v === 0)  return 2000;
  return Math.round(2000 / (v * 3));
}
speedSlider.addEventListener('input', () => {
  const v = parseInt(speedSlider.value);
  speedLabel.textContent = v === 10 ? 'max' : v === 0 ? '🐌' : v;
});
// ── [/TURTLE] ────────────────────────────────────────────────

// ── [TURTLE] Helpers de navigation entre onglets ─────────────
// Supprimez cette fonction si vous n'avez pas d'onglets turtle/output.
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
}
// ── [/TURTLE] ────────────────────────────────────────────────

// ── Chargement de Pyodide ────────────────────────────────────
loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' })
  .then(async py => {
    pyodide = py;

    // ── [TURTLE] Injection du module turtle dans sys.modules ──
    // Supprimez ce bloc (et la variable TURTLE_MODULE dans turtle.js)
    // si vous n'utilisez pas turtle.
    // TURTLE_MODULE est défini dans turtle.js (doit être chargé avant).
    pyodide.globals.set('_TURTLE_SRC', TURTLE_MODULE);
    await pyodide.runPythonAsync(`
import sys, types
_turtle_mod = types.ModuleType('turtle')
exec(_TURTLE_SRC, _turtle_mod.__dict__)
sys.modules['turtle'] = _turtle_mod
del _TURTLE_SRC
`);
    statusEl.textContent = '✅ Python 3.11 prêt (turtle activé)';
    // ── [/TURTLE] ─────────────────────────────────────────────

    // Sans turtle, remplacez les deux lignes ci-dessus par :
    // statusEl.textContent = '✅ Python 3.11 prêt';

    statusEl.className = 'ready';
    runBtn.disabled = false;
  })
  .catch(err => {
    statusEl.textContent = '❌ Erreur de chargement : ' + err.message;
    statusEl.className = 'error';
  });

// ── Exécution du code ────────────────────────────────────────
async function runCode() {
  if (!pyodide) return;
  runBtn.disabled = true;
  outputEl.innerHTML = '';
  timing.textContent = '';
  const t0 = performance.now();

  let stdoutBuf = '', stderrBuf = '';
  pyodide.setStdout({ batched: s => { stdoutBuf += s + '\n'; } });
  pyodide.setStderr({ batched: s => { stderrBuf += s + '\n'; } });



  try {
    // ── [TURTLE] Réinitialisation du canvas et de l'état Python
    // Supprimez ce bloc si pas de turtle.
    window._turtleCommands.length = 0;
    clearCanvas();
    await pyodide.runPythonAsync(`
import sys
if 'turtle' in sys.modules:
    sys.modules['turtle'].reset()
`);
    // ── [/TURTLE] ─────────────────────────────────────────────

    // Redirige input() vers prompt() du navigateur
    await pyodide.runPythonAsync(`
import builtins, js
def _input(prompt=""):
    result = js.prompt(prompt)
    return result if result is not None else ""
builtins.input = _input
`);

    await pyodide.runPythonAsync(editor.getValue());

    // ── [TURTLE] Flush de la position finale de la tortue ─────
    // Supprimez ce bloc si pas de turtle.
    await pyodide.runPythonAsync(`
import sys
if 'turtle' in sys.modules:
    sys.modules['turtle']._flush_turtle()
`);

    // Conversion des commandes JS Proxy → objets JS purs
    const commands = Array.from(window._turtleCommands).map(cmd => {
      const obj = { type: cmd.type };
      ['x','y','x1','y1','x2','y2','color','width','r','text','font','align','angle','visible']
        .forEach(k => { if (cmd[k] !== undefined) obj[k] = cmd[k]; });
      if (cmd.points) {
        obj.points = Array.from(cmd.points).map(p => [Number(p[0]), Number(p[1])]);
      }
      return obj;
    });

    // [TURTLE] Bascule sur turtle SEULEMENT si des commandes de dessin ont été émises
    // Supprimez hasDrawing et la ligne switchTab si pas de turtle.
    const hasDrawing = commands.some(c =>
      ['line', 'dot', 'fill', 'write', 'bgcolor'].includes(c.type)
    );
    if (hasDrawing) switchTab('turtle-panel');
    else switchTab('output-panel');
    // [/TURTLE]

    const delay = getDelay();
    replayCommands(commands, delay, () => {
      timing.textContent = `✔ ${((performance.now() - t0) / 1000).toFixed(3)}s`;
      runBtn.disabled = false;
    });
    // ── [/TURTLE] ─────────────────────────────────────────────

    if (stdoutBuf) appendOutput('stdout', stdoutBuf);
    if (stderrBuf) appendOutput('stderr', stderrBuf);

    // Sans turtle, remplacez la condition ci-dessous par :
    // if (!stdoutBuf && !stderrBuf) appendOutput('info', '(aucune sortie)');
    // [TURTLE] ↓
    if (!stdoutBuf && !stderrBuf && !hasDrawing) appendOutput('info', '(aucune sortie)');
    // [/TURTLE]

    // [TURTLE] Sans animation, on sort ici car runBtn sera réactivé par le callback
    const delay2 = getDelay();
    if (delay2 > 0) return;
    // [/TURTLE]
    // Sans turtle : supprimez les 2 lignes ci-dessus

  } catch (err) {
    if (stdoutBuf) appendOutput('stdout', stdoutBuf);
    appendOutput('error', err.message);
    timing.textContent = `✗ ${((performance.now() - t0) / 1000).toFixed(3)}s`;
    // [TURTLE] Basculer sur l'onglet texte en cas d'erreur
    switchTab('output-panel');
    // [/TURTLE]
  }

  runBtn.disabled = false;
}

function appendOutput(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  outputEl.appendChild(span);
}

runBtn.addEventListener('click', runCode);

document.getElementById('clear-btn').addEventListener('click', () => {
  outputEl.innerHTML = '<span class="info">En attente d\'exécution…</span>';
  timing.textContent = '';
});
