// ioto web app. Talks to the board over a WebSocket at /ws; the message
// protocol is documented at the top of firmware/main.py.

const EOT = '\x04';
const RECONNECT_MS = 2000;
const INPUT_POLL_MS = 200;
const WINDOW_MS = 10000;
const V_MAX = 3;

// Digital channels D1..D6, matching DIGITAL_PINS in firmware/main.py.
const PINS = [
	['D1', 'GPIO42'], ['D2', 'GPIO41'], ['D3', 'GPIO40'],
	['D4', 'GPIO39'], ['D5', 'GPIO38'], ['D6', 'GPIO37'],
];

const $ = (id) => document.getElementById(id);
const statusTag = $('status');
const canvas = $('scope');
const ctx = canvas.getContext('2d');

let socket = null;
let paused = false;
let pausedAt = 0;
let analogTimer = null;
const samples = []; // { t: ms timestamp, v: volts }

/* Connection */

function send(msg) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(msg);
}

function setStatus(state, text) {
	statusTag.dataset.state = state;
	statusTag.textContent = text;
}

function connect() {
	setStatus('connecting', 'Connecting…');
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	socket = new WebSocket(`${scheme}://${location.host}/ws`);
	socket.addEventListener('open', () => {
		setStatus('connected', 'Connected');
		// The board resets pins on reboot; push the page's settings back to it.
		pins.forEach(applyPin);
	});
	socket.addEventListener('message', (event) => handleMessage(event.data));
	socket.addEventListener('close', () => {
		setStatus('disconnected', 'Disconnected');
		setTimeout(connect, RECONNECT_MS);
	});
}

function handleMessage(data) {
	const [kind, name, value] = data.split(EOT);
	if (kind === 'IN') {
		const pin = pins.find((p) => p.gpio === name);
		if (pin?.mode === 'input') {
			pin.level = value === '1' ? 'HIGH' : 'LOW';
			renderPin(pin);
		}
	} else if (kind === 'AN' && !paused) {
		addSample(parseInt(value, 10) / 1000);
	}
}

/* Digital pins */

const pins = PINS.map(([label, gpio]) => createPin(label, gpio));

function createPin(label, gpio) {
	const el = $('pin-template').content.firstElementChild.cloneNode(true);
	const pin = { gpio, mode: 'off', level: null, button: el.querySelector('.level') };
	el.querySelector('.pin-name').textContent = label;
	el.querySelector('.pin-gpio').textContent = gpio;
	el.querySelector('.segmented').setAttribute('aria-label', `${label} mode`);
	for (const input of el.querySelectorAll('input')) {
		input.name = `mode-${gpio}`;
		input.checked = input.value === 'off';
		input.addEventListener('change', () => setMode(pin, input.value));
	}
	pin.button.addEventListener('click', () => {
		pin.level = pin.level === 'HIGH' ? 'LOW' : 'HIGH';
		applyPin(pin);
		renderPin(pin);
	});
	$('pins').append(el);
	renderPin(pin);
	return pin;
}

function setMode(pin, mode) {
	pin.mode = mode;
	pin.level = mode === 'output' ? 'LOW' : null;
	applyPin(pin);
	renderPin(pin);
}

function applyPin(pin) {
	if (pin.mode === 'off') send(`R ${pin.gpio}`);
	else if (pin.mode === 'input') send(`I ${pin.gpio}`);
	else send(`O ${pin.gpio} ${pin.level === 'HIGH' ? 1 : 0}`);
}

function renderPin(pin) {
	const { button } = pin;
	button.disabled = pin.mode !== 'output';
	button.dataset.level = pin.level ?? '';
	button.textContent = pin.level ?? (pin.mode === 'input' ? 'READING…' : 'OFF');
	button.setAttribute('aria-label', pin.mode === 'output'
		? `${pin.gpio} is ${pin.level}, click to toggle`
		: `${pin.gpio} ${button.textContent.toLowerCase()}`);
}

setInterval(() => {
	for (const pin of pins) {
		if (pin.mode === 'input') send(`G ${pin.gpio}`);
	}
}, INPUT_POLL_MS);

/* Analog scope */

function addSample(volts) {
	const now = performance.now();
	samples.push({ t: now, v: volts });
	while (samples.length && samples[0].t < now - WINDOW_MS - 1000) samples.shift();

	const visible = samples.filter((s) => s.t >= now - WINDOW_MS).map((s) => s.v);
	$('reading').textContent = volts.toFixed(3);
	$('min').textContent = `${Math.min(...visible).toFixed(3)} V`;
	$('max').textContent = `${Math.max(...visible).toFixed(3)} V`;
}

function setRate(hz) {
	clearInterval(analogTimer);
	analogTimer = setInterval(() => send('A'), 1000 / hz);
}

function drawScope() {
	const dpr = window.devicePixelRatio || 1;
	const { width, height } = canvas.getBoundingClientRect();
	if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
	}
	const css = getComputedStyle(document.documentElement);
	const color = (name) => css.getPropertyValue(name).trim();
	const now = paused ? pausedAt : performance.now();
	const pad = { left: 44, right: 10, top: 10, bottom: 26 };
	const plotW = width - pad.left - pad.right;
	const plotH = height - pad.top - pad.bottom;
	const x = (t) => pad.left + plotW * (1 - (now - t) / WINDOW_MS);
	const y = (v) => pad.top + plotH * (1 - v / V_MAX);

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = color('--surface');
	ctx.fillRect(0, 0, width, height);

	ctx.lineWidth = 1;
	ctx.strokeStyle = color('--grid');
	ctx.fillStyle = color('--muted');
	ctx.font = `11px ${color('--mono')}`;
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	for (let v = 0; v <= V_MAX + 1e-9; v += 0.5) {
		const yy = Math.round(y(v)) + 0.5;
		ctx.beginPath();
		ctx.moveTo(pad.left, yy);
		ctx.lineTo(pad.left + plotW, yy);
		ctx.stroke();
		ctx.fillText(`${v.toFixed(1)} V`, pad.left - 8, yy);
	}
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	for (let s = 0; s <= WINDOW_MS / 1000; s += 2) {
		const xx = Math.round(pad.left + plotW * (1 - s * 1000 / WINDOW_MS)) + 0.5;
		ctx.beginPath();
		ctx.moveTo(xx, pad.top);
		ctx.lineTo(xx, pad.top + plotH);
		ctx.stroke();
		ctx.fillText(s === 0 ? 'now' : `−${s}s`, xx, pad.top + plotH + 8);
	}

	if (samples.length > 1) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(pad.left, pad.top, plotW, plotH);
		ctx.clip();
		ctx.beginPath();
		samples.forEach((s, i) => (i ? ctx.lineTo(x(s.t), y(s.v)) : ctx.moveTo(x(s.t), y(s.v))));
		ctx.lineJoin = 'round';
		ctx.lineWidth = 2;
		ctx.strokeStyle = color('--accent');
		ctx.stroke();
		ctx.lineTo(x(samples.at(-1).t), y(0));
		ctx.lineTo(x(samples[0].t), y(0));
		ctx.fillStyle = color('--accent-fill');
		ctx.fill();
		ctx.restore();
	}
}

function animate() {
	drawScope();
	if (!paused) requestAnimationFrame(animate);
}

function setPaused(value) {
	paused = value;
	pausedAt = performance.now();
	$('pause').setAttribute('aria-pressed', String(paused));
	$('pause-label').textContent = paused ? 'Resume' : 'Pause';
	$('pause-icon').setAttribute('d', paused ? 'M4 2.5v11l9-5.5z' : 'M4 3h3v10H4zM9 3h3v10H9z');
	if (!paused) animate();
}

function saveChart() {
	drawScope();
	const link = document.createElement('a');
	link.download = `ioto-channel1-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
	link.href = canvas.toDataURL('image/png');
	link.click();
}

$('rate').addEventListener('change', (event) => setRate(Number(event.target.value)));
$('pause').addEventListener('click', () => setPaused(!paused));
$('save').addEventListener('click', saveChart);
new ResizeObserver(() => paused && drawScope()).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => paused && drawScope());

setRate(Number($('rate').value));
animate();
connect();
