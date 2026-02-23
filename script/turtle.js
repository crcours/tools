// ============================================================
//  turtle.js — Rendu canvas + module Python turtle
//  Dépendances : un élément <canvas id="turtle-canvas"> dans le DOM
// ============================================================

const canvas = document.getElementById('turtle-canvas');
const ctx    = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// Helpers de coordonnées (repère turtle : centre = 0,0 ; y vers le haut)
const cx = x => W / 2 + x;
const cy = y => H / 2 - y;

/** Vide le canvas */
function clearCanvas() {
  ctx.clearRect(0, 0, W, H);
}

/** Dessine l'icône tortue à la position courante */
function drawTurtleAt(x, y, angle, visible) {
  if (!visible) return;
  const r = 10, rad = angle * Math.PI / 180;
  ctx.save();
  ctx.translate(cx(x), cy(y));
  ctx.rotate(-rad);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * .7,  r * .5);
  ctx.lineTo(-r * .4,  0);
  ctx.lineTo(-r * .7, -r * .5);
  ctx.closePath();
  ctx.fillStyle   = '#22aa44';
  ctx.strokeStyle = '#115522';
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Exécute une commande de dessin reçue depuis Python */
function execCommand(cmd) {
  switch (cmd.type) {
    case 'line':
      ctx.beginPath();
      ctx.moveTo(cx(cmd.x1), cy(cmd.y1));
      ctx.lineTo(cx(cmd.x2), cy(cmd.y2));
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth   = cmd.width;
      ctx.lineCap     = 'round';
      ctx.stroke();
      break;
    case 'move':
      break;
    case 'dot':
      ctx.beginPath();
      ctx.arc(cx(cmd.x), cy(cmd.y), cmd.r, 0, 2 * Math.PI);
      ctx.fillStyle = cmd.color;
      ctx.fill();
      break;
    case 'fill':
      if (cmd.points && cmd.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(cx(cmd.points[0][0]), cy(cmd.points[0][1]));
        for (let k = 1; k < cmd.points.length; k++)
          ctx.lineTo(cx(cmd.points[k][0]), cy(cmd.points[k][1]));
        ctx.closePath();
        ctx.fillStyle = cmd.color;
        ctx.fill();
      }
      break;
    case 'write':
      ctx.font      = cmd.font;
      ctx.fillStyle = cmd.color;
      ctx.textAlign = cmd.align;
      ctx.fillText(cmd.text, cx(cmd.x), cy(cmd.y));
      break;
    case 'clear':
      clearCanvas();
      break;
    case 'bgcolor':
      canvas.style.background = cmd.color;
      break;
    case 'turtle':
      drawTurtleAt(cmd.x, cmd.y, cmd.angle, cmd.visible);
      break;
  }
}

/**
 * Rejoue la liste de commandes turtle.
 * @param {Object[]} commands - tableau de commandes
 * @param {number}   delay    - délai en ms entre chaque pas (0 = instantané)
 * @param {Function} onDone   - callback appelé à la fin
 */
function replayCommands(commands, delay, onDone) {
  if (delay === 0) {
    commands.forEach(execCommand);
    onDone();
    return;
  }
  let i = 0;
  function next() {
    if (i >= commands.length) { onDone(); return; }
    const cmd = commands[i++];
    execCommand(cmd);
    if (['line', 'move', 'dot'].includes(cmd.type)) {
      setTimeout(next, delay);
    } else {
      next();
    }
  }
  next();
}

// File d'attente des commandes (partagée avec Python via window)
window._turtleCommands = [];
window._turtleCanvas   = canvas;
window._turtleCtx      = ctx;

// ── Bouton reset canvas ─────────────────────────────────────
document.getElementById('reset-turtle-btn')
  .addEventListener('click', clearCanvas);

// ============================================================
//  Module Python turtle (injecté dans sys.modules par pyodide-loader.js)
//  Ce module communique avec le canvas via window._turtleCommands.
// ============================================================
const TURTLE_MODULE = `
import js
import math

_W = int(js.window._turtleCanvas.width)
_H = int(js.window._turtleCanvas.height)

_x = 0.0; _y = 0.0; _angle = 0.0
_pen_down = True
_pen_color = 'black'; _fill_color = 'black'
_pen_width = 1; _visible = True
_filling = False; _fill_points = []

def _push(**kw):
    obj = js.Object.new()
    for k, v in kw.items():
        setattr(obj, k, v)
    js.window._turtleCommands.append(obj)

def forward(distance):
    global _x, _y
    rad = math.radians(_angle)
    nx = _x + distance * math.cos(rad)
    ny = _y + distance * math.sin(rad)
    if _pen_down:
        _push(type='line', x1=_x, y1=_y, x2=nx, y2=ny, color=_pen_color, width=_pen_width)
    else:
        _push(type='move', x=nx, y=ny)
    if _filling: _fill_points.append((_x, _y))
    _x, _y = nx, ny

fd = forward
def backward(d): forward(-d)
bk = back = backward

def right(a):
    global _angle; _angle = (_angle - a) % 360
rt = right

def left(a):
    global _angle; _angle = (_angle + a) % 360
lt = left

def goto(x, y=None):
    global _x, _y
    if y is None and hasattr(x, '__len__'): x, y = x[0], x[1]
    nx, ny = float(x), float(y)
    if _pen_down:
        _push(type='line', x1=_x, y1=_y, x2=nx, y2=ny, color=_pen_color, width=_pen_width)
    else:
        _push(type='move', x=nx, y=ny)
    if _filling: _fill_points.append((_x, _y))
    _x, _y = nx, ny

setpos = setposition = goto
def setx(x): goto(x, _y)
def sety(y): goto(_x, y)

def home():
    global _angle; goto(0, 0); _angle = 0.0

def setheading(a):
    global _angle; _angle = float(a)
seth = setheading

def penup():
    global _pen_down; _pen_down = False
pu = up = penup

def pendown():
    global _pen_down; _pen_down = True
pd = down = pendown

def isdown(): return _pen_down

def pencolor(*args):
    global _pen_color
    if len(args) == 1: _pen_color = args[0]
    elif len(args) == 3:
        r,g,b = [int(v*255) if v<=1.0 else int(v) for v in args]
        _pen_color = f'rgb({r},{g},{b})'

def fillcolor(*args):
    global _fill_color
    if len(args) == 1: _fill_color = args[0]
    elif len(args) == 3:
        r,g,b = [int(v*255) if v<=1.0 else int(v) for v in args]
        _fill_color = f'rgb({r},{g},{b})'

def color(*args):
    if len(args) == 1:   pencolor(args[0]); fillcolor(args[0])
    elif len(args) == 2: pencolor(args[0]); fillcolor(args[1])
    elif len(args) == 3: pencolor(*args);   fillcolor(*args)

def width(w=None):
    global _pen_width
    if w is not None: _pen_width = w
    else: return _pen_width
pensize = width

def begin_fill():
    global _filling, _fill_points
    _filling = True; _fill_points = [(_x, _y)]

def end_fill():
    global _filling, _fill_points
    if _filling and len(_fill_points) >= 2:
        pts = js.Array.new()
        for px, py in _fill_points + [(_x, _y)]:
            pair = js.Array.new(); pair.push(float(px)); pair.push(float(py))
            pts.push(pair)
        _push(type='fill', points=pts, color=_fill_color)
    _filling = False; _fill_points = []

def circle(radius, extent=360, steps=None):
    if steps is None:
        steps = max(int(abs(radius)*abs(extent)*math.pi/180/3)+4, 8)
    step_angle = extent / steps
    step_len = 2*math.pi*abs(radius)*(abs(extent)/360)/steps
    sign = 1 if radius >= 0 else -1
    left(sign*90)
    for _ in range(steps):
        forward(sign*step_len)
        left(sign*step_angle)
    left(-sign*90)

def dot(size=None, *color_args):
    c = color_args[0] if color_args else _pen_color
    r = (size or max(_pen_width+4, 2*_pen_width)) / 2
    _push(type='dot', x=_x, y=_y, r=r, color=c)

def write(text, move=False, align='left', font=('Arial',12,'normal')):
    fn = font[0]; fs = font[1] if len(font)>1 else 12; fst = font[2] if len(font)>2 else 'normal'
    _push(type='write', x=_x, y=_y, text=str(text), font=f'{fst} {fs}px {fn}', color=_pen_color, align=align)

def clear():  _push(type='clear')
def bgcolor(c): _push(type='bgcolor', color=c)

def reset():
    global _x,_y,_angle,_pen_down,_pen_color,_fill_color,_pen_width,_visible,_filling,_fill_points
    _x=_y=0.0; _angle=0.0; _pen_down=True
    _pen_color='black'; _fill_color='black'; _pen_width=1; _visible=True
    _filling=False; _fill_points=[]
    clear()

def hideturtle():
    global _visible; _visible = False
ht = hideturtle

def showturtle():
    global _visible; _visible = True
st = showturtle

def isvisible(): return _visible
def position(): return (_x, _y)
pos = position
def xcor(): return _x
def ycor(): return _y
def heading(): return _angle

def distance(x, y=None):
    ox,oy = (x[0],x[1]) if y is None else (x,y)
    return math.hypot(_x-ox, _y-oy)

def speed(s=None): pass
def tracer(n=None,delay=None): pass
def update(): pass
def done(): pass
mainloop = done

def _flush_turtle():
    _push(type='turtle', x=_x, y=_y, angle=_angle, visible=_visible)

def Screen():
    class _S:
        def bgcolor(self,c): bgcolor(c)
        def title(self,t): pass
        def setup(self,w,h): pass
        def tracer(self,n,d=None): pass
        def update(self): pass
        def mainloop(self): pass
        def done(self): pass
    return _S()

class Turtle:
    def __init__(self): pass
    def forward(self,d): forward(d); return self
    def fd(self,d): return self.forward(d)
    def backward(self,d): backward(d); return self
    def bk(self,d): return self.backward(d)
    def back(self,d): return self.backward(d)
    def right(self,a): right(a); return self
    def rt(self,a): return self.right(a)
    def left(self,a): left(a); return self
    def lt(self,a): return self.left(a)
    def goto(self,x,y=None): goto(x,y); return self
    def setpos(self,x,y=None): return self.goto(x,y)
    def setposition(self,x,y=None): return self.goto(x,y)
    def setx(self,x): setx(x); return self
    def sety(self,y): sety(y); return self
    def home(self): home(); return self
    def setheading(self,a): setheading(a); return self
    def seth(self,a): return self.setheading(a)
    def penup(self): penup(); return self
    def pu(self): return self.penup()
    def up(self): return self.penup()
    def pendown(self): pendown(); return self
    def pd(self): return self.pendown()
    def down(self): return self.pendown()
    def isdown(self): return isdown()
    def color(self,*a): color(*a); return self
    def pencolor(self,*a): pencolor(*a); return self
    def fillcolor(self,*a): fillcolor(*a); return self
    def width(self,w=None): return width(w)
    def pensize(self,w=None): return self.width(w)
    def begin_fill(self): begin_fill(); return self
    def end_fill(self): end_fill(); return self
    def circle(self,r,e=360,s=None): circle(r,e,s); return self
    def dot(self,size=None,*c): dot(size,*c); return self
    def write(self,t,**kw): write(t,**kw); return self
    def clear(self): clear(); return self
    def reset(self): reset(); return self
    def hideturtle(self): hideturtle(); return self
    def ht(self): return self.hideturtle()
    def showturtle(self): showturtle(); return self
    def st(self): return self.showturtle()
    def isvisible(self): return isvisible()
    def position(self): return position()
    def pos(self): return self.position()
    def xcor(self): return xcor()
    def ycor(self): return ycor()
    def heading(self): return heading()
    def distance(self,x,y=None): return distance(x,y)
    def speed(self,s=None): return self
    def stamp(self): _flush_turtle(); return self

__all__ = [
    'forward','fd','backward','bk','back','right','rt','left','lt',
    'goto','setpos','setposition','setx','sety','home','setheading','seth',
    'penup','pu','up','pendown','pd','down','isdown',
    'pencolor','fillcolor','color','width','pensize',
    'begin_fill','end_fill','circle','dot','write',
    'clear','reset','hideturtle','ht','showturtle','st','isvisible',
    'position','pos','xcor','ycor','heading','distance',
    'bgcolor','speed','tracer','update','done','mainloop','Screen','Turtle'
]
`;
