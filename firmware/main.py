"""ioto: Internet of Things Oscilloscope.

Serves the web app from /www and talks to it over a WebSocket at /ws.
Client messages are short text commands:
  R GPIOn      reset pin
  O GPIOn v    set pin as output at level v
  I GPIOn      set pin as input
  G GPIOn      read pin       -> IN GPIOn level time
  A            read channel 1 -> AN CH1 millivolts time
Reply fields are separated by EOT (0x04).
"""
import time

import machine
import network
import ntptime
from machine import ADC, Pin
from microdot import Microdot, Response, send_file
from microdot.websocket import with_websocket

import config

WWW = 'www'
DIGITAL_PINS = (42, 41, 40, 39, 38, 37)  # D1..D6, the only pins clients may drive
ADC_PIN = 7  # channel 1 (ADC1_CH6 on the ESP32-S2)
ADC_SAMPLES = 64
EOT = '\x04'

pins = {n: Pin(n) for n in DIGITAL_PINS}
adc = ADC(Pin(ADC_PIN), atten=ADC.ATTN_11DB)


def connect_wifi():
    network.hostname(config.HOSTNAME)
    wlan = network.WLAN(network.WLAN.IF_STA)
    wlan.active(True)
    wlan.connect(config.WIFI_SSID, config.WIFI_PASSWORD)
    for _ in range(config.WIFI_TIMEOUT_S * 10):
        if wlan.isconnected():
            break
        time.sleep(0.1)
    else:
        print('failed to connect to SSID:', config.WIFI_SSID, '- rebooting in 5 seconds')
        time.sleep(5)
        machine.reset()
    print('got ip:', wlan.ipconfig('addr4')[0])


def sync_time():
    ntptime.host = config.NTP_SERVER
    try:
        ntptime.settime()
    except OSError as exc:
        print('NTP sync failed, timestamps count from boot:', exc)


def timestamp():
    t = time.localtime(time.time() + config.UTC_OFFSET_HOURS * 3600)
    return '%02d:%02d:%02d' % tuple(t[3:6])


def read_mv():
    total = 0
    for _ in range(ADC_SAMPLES):
        total += adc.read_uv()
    return total // ADC_SAMPLES // 1000


def parse_pin(name):
    if name.startswith('GPIO'):
        try:
            pin = int(name[4:])
        except ValueError:
            return None
        if pin in pins:
            return pin
    return None


def reply(kind, name, value):
    return EOT.join((kind, name, str(value), timestamp()))


def handle_command(msg):
    parts = msg.split()
    if parts and parts[0] == 'A':
        return reply('AN', 'CH1', read_mv())

    pin = parse_pin(parts[1]) if len(parts) > 1 else None
    if pin is not None:
        if parts[0] in ('R', 'I'):
            pins[pin].init(Pin.IN, Pin.PULL_UP)
            return None
        if parts[0] == 'O' and len(parts) > 2:
            pins[pin].init(Pin.OUT, value=int(parts[2] != '0'))
            return None
        if parts[0] == 'G':
            return reply('IN', 'GPIO%d' % pin, pins[pin].value())
    print('ignoring message:', msg)
    return None


app = Microdot()
Response.types_map['ico'] = 'image/x-icon'
STATIC_FILES = ('main.js', 'main.css', 'favicon.ico')


def serve(name, status_code=200):
    """Text files are stored gzipped on the board (see tools/deploy.sh)."""
    if name.endswith('.ico'):
        return send_file(WWW + '/' + name, status_code=status_code)
    return send_file(WWW + '/' + name + '.gz', status_code=status_code, compressed=True)


@app.route('/ws')
@with_websocket
async def websocket(request, ws):
    while True:
        msg = await ws.receive()
        response = handle_command(msg) if isinstance(msg, str) else None
        if response:
            await ws.send(response)


@app.route('/')
async def index(request):
    return serve('root.html')


@app.route('/<name>')
async def static(request, name):
    if name in STATIC_FILES:
        return serve(name)
    return serve('error.html', 404)


@app.errorhandler(404)
async def not_found(request):
    return serve('error.html', 404)


def main():
    connect_wifi()
    sync_time()
    print('web app at http://%s.local/' % config.HOSTNAME)
    app.run(port=80)


if __name__ == '__main__':
    main()
