#!/usr/bin/env bash
# Google Play yükleme anahtarı oluşturur ve GitHub Actions için gizli değerleri hazırlar.
# Kullanım: ./scripts/create-keystore.sh
# Oluşan upload.jks dosyasını ve şifreni GÜVENLİ bir yerde sakla; kaybedersen güncelleme yayınlayamazsın.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-upload.jks}"
ALIAS="upload"
if [ -f "$OUT" ]; then
  echo "Hata: $OUT zaten var. Üzerine yazmamak için başka bir ad ver: ./scripts/create-keystore.sh yeni.jks" >&2
  exit 1
fi

read -r -s -p "Anahtar şifresi (en az 6 karakter): " PASS; echo
read -r -s -p "Şifre tekrar: " PASS2; echo
if [ "$PASS" != "$PASS2" ] || [ "${#PASS}" -lt 6 ]; then
  echo "Hata: şifreler eşleşmiyor ya da çok kısa." >&2
  exit 1
fi
read -r -p "Adın soyadın (sertifika için): " CN

keytool -genkeypair -v -keystore "$OUT" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=${CN:-Murekkep Kalkani}, O=Murekkep Kalkani, C=TR"

cat > android/keystore.properties <<PROPS
storeFile=$(pwd)/$OUT
storePassword=$PASS
keyAlias=$ALIAS
keyPassword=$PASS
PROPS

echo
echo "✓ $OUT oluşturuldu, android/keystore.properties yazıldı (ikisi de depoya girmez)."
echo
echo "GitHub'da otomatik imzalı AAB için: Settings → Secrets and variables → Actions → New repository secret"
echo "  MK_KEYSTORE_BASE64   = aşağıdaki uzun metin"
echo "  MK_KEYSTORE_PASSWORD = girdiğin şifre"
echo "  MK_KEY_ALIAS         = $ALIAS"
echo "  MK_KEY_PASSWORD      = girdiğin şifre"
echo
echo "----- MK_KEYSTORE_BASE64 -----"
base64 -w0 "$OUT" 2>/dev/null || base64 "$OUT" | tr -d '\n'
echo
echo "------------------------------"
