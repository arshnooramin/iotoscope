#!/bin/sh
# Copy the firmware and web app to a board running MicroPython, then reset it.
# Usage: tools/deploy.sh [device]   e.g. tools/deploy.sh /dev/tty.usbmodem01
set -eu
cd "$(dirname "$0")/.."

if [ ! -f firmware/config.py ]; then
	echo "firmware/config.py is missing: copy firmware/config.example.py and fill it in" >&2
	exit 1
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

# Text assets are stored gzipped; firmware/main.py serves them with Content-Encoding: gzip.
mkdir "$stage/www"
for f in root.html error.html main.js main.css; do
	gzip -9c "html/$f" > "$stage/www/$f.gz"
done
cp html/favicon.ico "$stage/www/"
cp -R firmware/main.py firmware/config.py firmware/lib "$stage/"

# Precompiling saves RAM on the board. mpy-cross must match the board's MicroPython version.
if command -v mpy-cross >/dev/null 2>&1; then
	for f in "$stage"/lib/microdot/*.py; do
		mpy-cross "$f" && rm "$f"
	done
fi

cd "$stage"
mpremote ${1:+connect "$1"} cp -r main.py config.py lib www : + reset
