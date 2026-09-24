# Mürekkep Kalkanı

Parmağınla mürekkep çizgileri çizip gökten yağan meteorları sektirdiğin, İstanbul'u koruduğun bir mobil arcade oyunu.
Sektirdiğin meteoru başka bir meteora çarptırırsan ikisi de patlar. Zincirleme patlamalar komboyu, kombo da puanı büyütür.

- **Tür:** Arcade / roguelite, dikey ekran, tek parmak
- **Platform:** Android (Google Play), tarayıcı (PWA gibi, internetsiz çalışır)
- **Diller:** Türkçe, İngilizce (cihaz diline göre otomatik)

## Oyun

| Mekanik | Açıklama |
|---|---|
| Mürekkep çizgisi | Parmağını sürükle: hat kalemi gibi incelip kalınlaşan, ışıldayan bir çizgi. Meteorlar açısına göre seker. |
| Ağır çekim | Çizerken zaman yavaşlar, nişan almak kolaylaşır. Parmağını basılı tutmak mürekkep harcar. |
| Mürekkep | Sınırlı; zamanla dolar, patlattığın meteorlar mürekkep damlası bırakır. |
| Kombo ve zincir | Sekme ve patlamalar komboyu artırır (x5'e kadar çarpan). Kümelenmiş meteorlar zincirleme patlar. |
| Meteorlar | Normal, hızlı (buz), zırhlı (ilk çarpmada çizgiyi kırar), bölünen, altın (altın kazandırır). |
| Kızıl Dev | Her 5 dalgada bir boss. Minyonlarını ona geri sektirerek yenersin. |
| Güçler | Her dalga sonunda 3 karttan biri: 19 güç, 4 nadirlik (Ayna, Zincir Şimşek, Kara Delik, Anka Kuşu...). |
| Şehir | Beş mahalle, her biri iki can. Mahalleler yıkıldıkça uzak silüetin ışıkları söner. |

### Rekabet ve bağlılık sistemleri

- **Rütbeler:** Çırak → Kalfa → Usta → Hattat → Üstad → Efsane (hat sanatı ustalık basamakları). Menüde bir sonraki rütbeye kalan puan hep görünür.
- **Günlük meydan okuma:** Her gün herkes aynı tohumlu meteor dizisiyle ve günün kuralıyla oynar (Fırtına, Altın Yağmuru, Tek Çizgi...). 1,5 kat altın ödülü verir.
- **Günlük seri:** Her gün oyna, seri bonusu 7 güne kadar büyüsün.
- **Görevler:** Aynı anda 3 görev; tamamlandıkça zorlaşan yenileri gelir.
- **Atölye:** Altınla alınan kalıcı geliştirmeler.
- **Kalemler:** Mürekkep renkleri; Ateş, Buz ve Gökkuşağı yalnızca rütbeyle açılır.
- **Rekorlar:** En iyi 10 oyun ve istatistikler. Oyun sırasında rekor kırılınca kutlama yapılır.

## Teknik yapı

Harici oyun motoru yok. Mobilde 60+ FPS için Canvas 2D üzerine yazılmış hafif bir motor kullanılıyor:

- **Çizim:** Parıltılar, meteor gövdeleri ve arka plan açılışta bir kez çizilip önbelleğe alınır; oyun sırasında `shadowBlur` ya da gradyan üretilmez. Işık efektleri additive (`lighter`) karışımla basılır.
- **Parçacıklar:** Yapı-dizisi (SoA) `Float32Array` havuzu. Karede sıfır bellek ayırma, kalite ayarına göre bütçe.
- **Fizik:** Hızlı meteorlar çizgiden geçip gitmesin diye alt adımlı çember-doğru parçası çarpışması.
- **Giriş:** `getCoalescedEvents` ile 120-240 Hz dokunmatik örnekleri kaybolmaz; düşük gecikmeli canvas (`desynchronized`).
- **Uyarlanabilir kalite:** Kare hızı düşerse çözünürlük ve parçacık bütçesi kendiliğinden azalır.
- **Ses:** Hiç ses dosyası yok. Bütün efektler ve Hicaz makamındaki üretken müzik WebAudio ile anlık sentezlenir. Çizim sırasında müzik boğuklaşır.
- **Görseller:** Ebru desenli bulutsu, İstanbul silüeti, cumbalı evler ve ikonlar kodla üretilir.
- **Paket:** Tek HTML dosyası (~410 KB, fontlar dahil). Oyun tamamen internetsiz çalışır.

```
src/
  core/      döngü, giriş, ses, titreşim, kayıt, RNG
  render/    görünüm (ölçekleme), sprite önbelleği, parçacıklar, gökyüzü
  game/      dünya (simülasyon), meteorlar, çizgiler, şehir, dalga yöneticisi, güçler
  meta/      rütbeler, görevler, günlük meydan okuma, atölye
  ui/        HUD, ekranlar, ikonlar, metinler (TR/EN)
  app.ts     durum makinesi: açılış → menü → oyun → güç seçimi → oyun sonu
android/     Capacitor Android projesi
store/       Play Store ikonu, tanıtım görseli, ekran görüntüleri, mağaza metinleri
scripts/     font alt kümesi, ikon üretici, artifact dönüştürücü
```

## Geliştirme

Gereksinim: Node.js 22+

```bash
npm install
npm run dev          # http://localhost:5173 (telefondan aynı ağda da açılabilir)
npm run build        # tip denetimi + dist/index.html (tek dosya)
```

Masaüstünde fareyle de oynanır; oyun alanı dikey bir sütuna sığdırılır.

## Android (Google Play)

Gereksinim: JDK 21, Android Studio (Android SDK 36).

```bash
npm run cap:sync     # web derlemesi + Android projesine kopyala
npm run android:open # Android Studio'da aç, cihazda çalıştır
```

### Bulutta derleme (GitHub Actions)

`.github/workflows/android.yml` her push'ta:

1. Tip denetimi ve web derlemesi yapar,
2. Test APK'sı üretir (**Actions → çalıştırma → Artifacts → `murekkep-kalkani-apk`**). Telefona indirip kurabilirsin,
3. İmza bilgileri tanımlıysa Play Store'a yüklenecek imzalı **AAB** üretir (`murekkep-kalkani-aab`).

### Yayın imzası

Bir kez yükleme anahtarı oluştur (dosyayı ve şifreleri güvenli sakla, kaybedersen güncelleme yayınlayamazsın):

```bash
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

- **Yerelde:** `android/keystore.properties` oluştur (depoya girmez):
  ```properties
  storeFile=/tam/yol/upload.jks
  storePassword=...
  keyAlias=upload
  keyPassword=...
  ```
  Ardından `cd android && ./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`
- **GitHub Actions ile:** Depo ayarlarında **Secrets and variables → Actions** altına ekle:
  `MK_KEYSTORE_BASE64` (`base64 -w0 upload.jks` çıktısı), `MK_KEYSTORE_PASSWORD`, `MK_KEY_ALIAS`, `MK_KEY_PASSWORD`.
  Sürüm kodu her çalıştırmada otomatik artar (`github.run_number`).

### Play Console kontrol listesi

- [ ] Geliştirici hesabı (tek seferlik 25 $)
- [ ] Uygulama oluştur: ad **Mürekkep Kalkanı**, paket adı `com.talhamert.murekkepkalkani`
- [ ] Mağaza girişi: metinler `store/listing.md`, ikon `store/icon-512.png`, tanıtım görseli `store/feature-graphic-tr.jpg`, ekran görüntüleri `store/screenshots/`
- [ ] Gizlilik politikası: `docs/privacy-policy.md` dosyasını herkese açık bir adreste yayınla (örneğin GitHub Pages) ve adresini gir
- [ ] Veri güvenliği formu: veri toplanmıyor, paylaşılmıyor (oyun yalnızca cihazda yerel kayıt tutar)
- [ ] İçerik derecelendirmesi anketi: şiddet yok (yalnızca soyut meteor patlamaları), kullanıcılar arası etkileşim yok, reklam yok
- [ ] Hedef kitle: 13+ önerilir (çocuklara yönelik "Aileler" politikası ek gereksinim getirir)
- [ ] Kapalı test: yeni kişisel hesaplarda üretime geçmeden önce en az 12 test kullanıcısıyla 14 günlük kapalı test gerekir
- [ ] İmzalı AAB'yi yükle, Play App Signing'i kabul et

## Sonraki adımlar

- **Küresel skor tablosu:** Google Play Games Services liderlik tablosu (rekabet için en güçlü adım)
- **Bulut kaydı:** Play Games ile ilerlemenin cihazlar arası taşınması
- **Gelir:** Ödüllü reklam (oyun sonunda "2 kat altın") ve kozmetik kalem paketleri
- **İçerik:** Yeni boss türleri, mevsimlik günlük kurallar, başarımlar

## Lisanslar

- Oyun kodu ve görseller: tüm hakları saklıdır.
- Fontlar: [Unbounded](https://fonts.google.com/specimen/Unbounded) ve [Rubik](https://fonts.google.com/specimen/Rubik), SIL Open Font License 1.1.
