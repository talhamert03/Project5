#!/usr/bin/env bash
# Fontları Türkçe + İngilizce için gereken karakterlere indirger (paket boyutu küçülür).
# Gerekli: pip install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")/.."
RANGES="U+0020-007E,U+00A0-00FF,U+011E-011F,U+0130-0131,U+015E-015F,U+2013-2014,U+2018-201E,U+2022,U+2026,U+20BA,U+2190-2193,U+00D7,U+2715,U+2605"
for spec in "unbounded:node_modules/@fontsource-variable/unbounded/files/unbounded" "rubik:node_modules/@fontsource-variable/rubik/files/rubik"; do
  name="${spec%%:*}"; base="${spec#*:}"
  # latin + latin-ext birleştirilemez (değişken font), bu yüzden ikisini ayrı ayrı alt kümeleriz
  pyftsubset "${base}-latin-wght-normal.woff2" --unicodes="$RANGES" --flavor=woff2 --layout-features='*' --output-file="src/assets/fonts/${name}-latin.woff2"
  pyftsubset "${base}-latin-ext-wght-normal.woff2" --unicodes="U+011E-011F,U+0130-0131,U+015E-015F" --flavor=woff2 --layout-features='*' --output-file="src/assets/fonts/${name}-tr.woff2"
done
ls -la src/assets/fonts
