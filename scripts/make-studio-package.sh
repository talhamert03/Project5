#!/usr/bin/env bash
# Android Studio / Google Play paketi: kendi kendine yeten klasör (+ ZIP).
# Capacitor modülleri android/capacitor-plugins içine kopyalanır ve yolları settings
# klasörüne göre verilir; böylece paket nereye çıkarılırsa çıkarılsın Gradle modülleri bulur
# (node_modules gerekmez). Önce "npm run build" ve "npx cap sync android" çalışmış olmalı.
#
# Kullanım: scripts/make-studio-package.sh <çıkış-klasörü> [sürüm]
set -euo pipefail

OUT="${1:?çıkış klasörü gerekli}"
VER="${2:-dev}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$OUT/Inkfall"

rm -rf "$PKG"
mkdir -p "$PKG"
cd "$ROOT"

# Android projesi (derleme çıktıları ve imza anahtarları hariç)
tar -cf - --exclude='.gradle' --exclude='build' --exclude='local.properties' --exclude='keystore.properties' \
  --exclude='*.jks' --exclude='*.keystore' --exclude='.idea' android | tar -xf - -C "$PKG"

# Capacitor modülleri android klasörünün içine
PLUG="$PKG/android/capacitor-plugins"
mkdir -p "$PLUG"
SETTINGS="$PKG/android/capacitor.settings.gradle"
{
  echo "// Capacitor modülleri bu klasörün içinde (capacitor-plugins): paket nereye çıkarılırsa çıkarılsın bulunur."
  echo "// Not: kaynak koddan \"npx cap sync android\" çalıştırılırsa bu dosya yeniden üretilir ve"
  echo "// ../node_modules yolunu kullanır (o durumda önce \"npm install\" gerekir)."
} > "$SETTINGS"
# capacitor.settings.gradle'daki her modül: ad + node_modules yolu
grep -o "project(':[^']*').projectDir = new File('[^']*')" android/capacitor.settings.gradle | while read -r line; do
  name="$(echo "$line" | sed -E "s/project\(':([^']*)'\).*/\1/")"
  src="$(echo "$line" | sed -E "s/.*new File\('\.\.\/([^']*)'\).*/\1/")"
  mkdir -p "$PLUG/$name"
  (cd "$src" && tar -cf - --exclude='build' .) | tar -xf - -C "$PLUG/$name"
  printf "\ninclude ':%s'\nproject(':%s').projectDir = new File(settingsDir, 'capacitor-plugins/%s')\n" "$name" "$name" "$name" >> "$SETTINGS"
done
sed -i "s#new File('./capacitor-cordova-android-plugins/')#new File(settingsDir, 'capacitor-cordova-android-plugins')#" "$PKG/android/settings.gradle"

# kaynak kod (ileride değişiklik için) + mağaza dosyaları + rehber
tar -cf - src public scripts store docs index.html package.json package-lock.json capacitor.config.ts tsconfig.json \
  vite.config.ts README.md | tar -xf - -C "$PKG"
cp docs/google-play-yayin.md "$PKG/GOOGLE-PLAY-YAYIN-REHBERI.txt"

(cd "$OUT" && rm -f "Inkfall-AndroidStudio-$VER.zip" && zip -qr -9 "Inkfall-AndroidStudio-$VER.zip" Inkfall)
echo "Paket: $OUT/Inkfall-AndroidStudio-$VER.zip"
