# Inkfall: Meteor Defense

Parmağınla mürekkep çizgileri çizip gökten yağan meteorları sektirdiğin, şehri meteordan kurtardığın bir mobil arcade oyunu.
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
| Meteorlar | Normal, hızlı, zırhlı (ilk çarpmada çizgiyi kırar), bölünen, altın; **kuyruklu yıldız** (köşeden çapraz ve çok hızlı, sektirince fazladan deler), **buz kristali** (dokunduğu çizgiyi dondurup kırar, patlayınca çevresini yavaşlatır), **hayalet** (aralıklarla saydamlaşıp çizgilerden geçer), **nova çekirdeği** (şehre 2 hasar; patlatınca dev zincir), **ışınlanan** (parlayınca yana ışınlanır), **alev meteoru** (sektiği çizgiyi yakar), **prizma** (sektirilince üçe bölünür), **şifa kristali** (sektirilirse şehri onarır), **kıvılcım sürüsü** (yılan gibi aynı yoldan dalgalanarak iner). |
| Stratejik çizgi | HUD'un altındaki ince bant çizime kapalı; üst atmosfere çizilen mürekkep çabuk yanar, uzun duvarlar ve çok sektiren çizgiler daha çabuk söner. |
| Dünyadan başlama | Dünyalar ekranı ("Hangi dünyadan devam etmek istersin?") büyük bölüm kartları ve "Buradan Başla" düğmeleriyle açık bir dünyadan oyunu hemen başlatır. Başta güç kartı seçtirilmez: kartlar dalgalar geçildikçe tek tek kazanılır, atölye geliştirmeleri her dünyada geçerlidir. Günlük meydan okuma hep 1. dalgadan. |
| Görüntü ve akıcılık | Gökyüzü (bulutsu, ebru damarları, yıldızlar) ekranın gerçek piksel yoğunluğunda hazırlanır; dev ışık lekeleri çift tamponlu gökyüzü karesinde yavaşça tazelenir. Oyun tuvali dinamik çözünürlükle çalışır: ilk açılış güvenli 2x, cihaz 60 FPS'i tutuyorsa gerçek yoğunluğa (HD) çıkar, düşerse iner; öğrenilen seviye cihazda saklanır. |
| Reklamlar | Ödüllü videolar (devam, 2 kat altın, hediye) ve her 5 oyunda bir zorunlu geçiş reklamı; Reklamsız paket ikisini de kaldırır. Reklam kimlikleri `index.html` başındaki `INKFALL_ADS` bloğunda. |
| Mürekkep Ateşi | 15 komboda (sonra her 30'da) 6,5 sn: mürekkep bedava, çizgiler gökkuşağı, puan x1,5. Duvardan sekip vuran dost meteor **bilardo** bonusu verir. |
| Bosslar | Her 5 dalgada sırayla beş farklı boss: **Kaya Titanı** (parça yağdırır), **Kuyruklu Kraliçe** (hızlı süzülür, kuyruklu yıldız fırlatır), **Buz Kalesi** (önce yörüngedeki üç kristali kır), **Tekillik** (dost meteorları kendine çeker, daralan halka dolunca çizgileri kırar), **İkiz Yıldızlar** (birbirinin etrafında dans eder, biri düşünce diğeri öfkelenir). Her döngüde daha dayanıklı. |
| Güçler | Her dalga sonunda 3 karttan biri: 27 güç, 4 nadirlik. Yeni: Mıknatıs Uç, Kırağı, Sekme Ustası, Koruyucu Uydu, Aşırı Yük, İkinci Nefes, Şans Yıldızı, Mürekkep Dalgası. |
| Yetenekler | Şekil çizerek atılır: **daire** Yıldız Patlaması (ücretsiz), **üçgen** Zaman Kırılması, **kare** Aegis Kalkanı, **zikzak** Yıldız Yağmuru, **sonsuzluk** Sonsuz Yansıma (sektirilen meteor üçe bölünür), **sarmal** Kara Girdap (meteorları yutan girdap), **yıldız** Yıldız Işınları (beş ışın ekranı keser). Her birinin bekleme süresi var (meteor patlatmak kısaltır). Yetenek Takımyıldızı (Orion) ekranında her yıldız bir yetenek: dokununca şekli çizilerek gösterilir, altınla açılır ve 3 seviyeye kadar geliştirilir. |
| Şekil tanıma | El çizimine dayanıklı tanıyıcı: başlangıç-bitiş halkası aranır (taşan uç ve parmak kancası kesilir), dönüş sayısı topolojik olarak ölçülür, daire elipse göre, üçgen/kare en iyi oturan çokgene göre karşılaştırılır. Parmağın ham yolu kullanılır (üst bant kırpması şekli bozmaz). Hazır bir yetenek varsa mürekkep bitmişken de şekil çizilebilir. Yetenek bekliyorsa "YILDIZ PATLAMASI dolmadı · 12 sn", açılmamışsa "… kilitli" yazar. |
| Menüler | Kalemler, Atölye, Görevler, Rekorlar, Mağaza, Ayarlar ve Günlük: ana ekranın gökyüzü üstünde yarı saydam uzay örtüsü (göz kırpan yıldızlar). Üst çubuk (altın pili) ve alt sekme çubuğu ana ekranla aynı; sekmeler arasında yalnızca içerik kayar. Vitrinlerde yörüngesinde uydu dönen gezegen ve kendini çizen mürekkep çizgisi, kartlarda ana ekran karolarının parlak dili, parlayan ilerleme çubukları. |
| Yetenek parşömenleri | Açılan tüm yetenekler oyunda çizilerek kullanılabilir; en fazla 3 tanesi parşömene konur ve oyunda altta rehber olarak görünür (dokununca şekil gösterilir). |
| Şehir | Beş mahalle, her biri iki can. Mahalleler yıkıldıkça uzak silüetin (apartmanlar ve Boğaz Köprüsü) ışıkları söner. |
| Son anda | Şehre çok yakınken yapılan sektirme "SON ANDA!" bonusu kazandırır. |
| Devam et | Şehir düşünce **ödüllü video izleyerek** (turda bir kez) ya da altınla üç mahalleyi yeniden kurup sürdürebilirsin; ikinci düşüşte yalnızca altınla (iki kat bedel). |

### Dünyalar (atmosferler)

Her 5 dalgada sahne tamburu 360° sağa döner ve arkasındaki yeni dünya ortaya çıkar. Her dünyanın kendi gökyüzü, gök cismi, ortam efekti, müzik tonu ve küçük bir oynanış farkı var:

| Bölüm | Dünya | Dalgalar | Farkı |
|---|---|---|---|
| 1 | Gece | 1–5 | Hilal, ebru bulutsusu |
| 2 | Alacakaranlık | 6–10 | Batan güneş, uçuşan lale yaprakları, meteorları sürükleyen rüzgâr |
| 3 | Kuzey Işıkları | 11–15 | Kuzey ışığı perdeleri, kar; buz meteorları çoğalır |
| 4 | Kızıl Kıyamet | 16–20 | Kan ayı, şimşekler, yükselen korlar; zırhlı ve bölünen meteorlar artar |
| 5 | Kozmos | 21–25 | Halkalı gezegen, yıldız tozu; ağır meteorlar |
| 6 | Orion Bulutsusu | 26–30 | Avcı'nın kuşağı, pembe yıldız doğumevi |
| 7 | Satürn Halkaları | 31–35 | Dev halkalı gezegen ve uyduları, buz kristali yağmuru; buz meteorları |
| 8 | Olay Ufku | 36–40 | Işık diski dönen kara delik, içine akan sarmal toz; hayaletler çoğalır |
| 9 | Süpernova | 41+ | Patlayan yıldız, yayılan şok halkaları, kıvılcımlar; son ve sonsuz dünya |

Açılan dünyalar menüdeki **Dünyalar** ekranında görünür; seçilen dünya menü arka planı olur ve oyun doğrudan oradan başlar.

### Rekabet ve bağlılık sistemleri

- **Rütbeler:** Çırak → Kalfa → Usta → Hattat → Üstad → Efsane (hat sanatı ustalık basamakları). Menüde bir sonraki rütbeye kalan puan hep görünür.
- **Günlük meydan okuma:** Her gün herkes aynı tohumlu meteor dizisiyle ve günün kuralıyla oynar (Fırtına, Altın Yağmuru, Tek Çizgi...). 1,5 kat altın ödülü verir.
- **Günlük seri:** Her gün oyna, seri bonusu 7 güne kadar büyüsün.
- **Görevler:** Aynı anda 3 görev; tamamlandıkça zorlaşan yenileri gelir.
- **Atölye:** Altınla alınan kalıcı geliştirmeler.
- **Kalemler:** Mürekkep renkleri; Ateş, Buz ve Gökkuşağı yalnızca rütbeyle açılır.
- **Rekorlar:** En iyi 10 oyun ve istatistikler. Oyun sırasında rekor kırılınca kutlama yapılır.
- **Günlük hediye:** 7 günlük takvim; arka arkaya gelen günlerde ödül büyür, 7. gün büyük hediye.
- **Mobil oyun menüsü:** Profil (rütbe) kartı, altın kasası, yan hızlı butonlar, alt sekme çubuğu, mürekkep fırçası geçişleri.

### Gelir modeli

- **Ödüllü video (AdMob):** Şehir düşünce "Video izle, devam et", oyun sonunda "altınları 2 katına çıkar", günlük hediyeyi 2 kat alma ve mağazada günde 5 kez ücretsiz 80 altın. Reklam her zaman isteğe bağlıdır; zorunlu (araya giren) reklam yoktur.
- **Uygulama içi satın alma (Google Play Billing):** Altın paketleri (1.000 / 2.750 / 6.000 / 14.000), tek seferlik **Başlangıç Paketi** (3.000 altın + Zaman Kırılması) ve **Reklamsız** (tüm video ödülleri anında).
- Altının harcandığı yerler: kalemler, atölye, yetenekler, altınla devam.

**Yayın öncesi yapılacaklar:**

1. [AdMob](https://admob.google.com) hesabında uygulamayı ve bir **Ödüllü** reklam birimi oluştur.
2. `android/app/src/main/AndroidManifest.xml` içindeki `APPLICATION_ID` değerini ve `src/monetize.ts` içindeki `REWARDED_AD_ID`'yi kendi kimliklerinle değiştir, `ADS_TESTING`'i `false` yap.
3. AdMob'da AB kullanıcıları için izin (GDPR) mesajını etkinleştir; uygulama formu kendisi gösterir.
4. Play Console → Para kazanma → Ürünler → **Uygulama içi ürünler** altında şu kimliklerle ürünleri oluştur:
   `inkfall_coins_1000`, `inkfall_coins_2750`, `inkfall_coins_6000`, `inkfall_coins_14000`, `inkfall_starter`, `inkfall_noads`.
   Fiyatlar mağazadan otomatik okunur ve kullanıcının para biriminde gösterilir.
5. Satın almaları test etmek için Play Console'da lisans test kullanıcıları ekle (test kartıyla ücret alınmaz).

## Teknik yapı

Harici oyun motoru yok. Mobilde 60+ FPS için Canvas 2D üzerine yazılmış hafif bir motor kullanılıyor:

- **Çizim:** Parıltılar, meteor gövdeleri ve arka plan açılışta bir kez çizilip önbelleğe alınır; oyun sırasında `shadowBlur` ya da gradyan üretilmez. Işık efektleri additive (`lighter`) karışımla basılır.
- **Parçacıklar:** Yapı-dizisi (SoA) `Float32Array` havuzu. Karede sıfır bellek ayırma, kalite ayarına göre bütçe.
- **Fizik:** Hızlı meteorlar çizgiden geçip gitmesin diye alt adımlı çember-doğru parçası çarpışması.
- **Giriş:** `getCoalescedEvents` ile 120-240 Hz dokunmatik örnekleri kaybolmaz; düşük gecikmeli canvas (`desynchronized`).
- **Uyarlanabilir kalite:** Kare hızı düşerse çözünürlük ve parçacık bütçesi kendiliğinden azalır.
- **Ses:** Hiç ses dosyası yok. Bütün efektler ve Hicaz makamındaki üretken müzik WebAudio ile anlık sentezlenir. Çizim sırasında müzik boğuklaşır.
- **Görseller:** HD ebru damarları (dönel akış alanını izleyen, piksel çözünürlüğünde çizilen vektörel çizgiler), apartman ve köprü silüeti, cumbalı evler ve ikonlar kodla üretilir. Sıradaki dünya, güç kartları ekranı açıkken önceden hazırlanır; geçişte takılma olmaz.
- **Paket:** Tek HTML dosyası (~430 KB, fontlar dahil). Oyun tamamen internetsiz çalışır.

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
scripts/     font alt kümesi, ikon üretici, imza anahtarı oluşturucu, artifact dönüştürücü
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
2. Test APK'sı üretir (**Actions → çalıştırma → Artifacts → `inkfall-apk` (içinde `Inkfall-<sürüm>-debug.apk`)**). Telefona indirip kurabilirsin,
3. İmza bilgileri tanımlıysa Play Store'a yüklenecek imzalı **AAB** üretir (`inkfall-aab`).

### Yayın imzası

Bir kez yükleme anahtarı oluştur (dosyayı ve şifreyi güvenli sakla, kaybedersen güncelleme yayınlayamazsın). Hazır betik anahtarı üretir, `android/keystore.properties` dosyasını yazar ve GitHub'a eklenecek gizli değerleri yazdırır (JDK gerekir):

```bash
./scripts/create-keystore.sh
```

Elle yapmak istersen:

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
- [ ] Uygulama oluştur: ad **Inkfall: Meteor Defense**, paket adı `com.talhamert.inkfall`
- [ ] Mağaza girişi: metinler `store/listing.md`, ikon `store/icon-512.png`, tanıtım görseli `store/feature-graphic-tr.jpg`, ekran görüntüleri `store/screenshots/`
- [ ] Gizlilik politikası: `docs/privacy-policy.md` dosyasını herkese açık bir adreste yayınla (örneğin GitHub Pages) ve adresini gir
- [ ] Veri güvenliği formu: oyun kendi sunucusuna veri göndermez; **AdMob reklam kimliği ve cihaz verisi toplar** (reklam ve analiz amaçlı), Google Play Billing ödeme bilgisini işler. Formda "Reklam kimliği" ve "Uygulama etkileşimleri" beyan edilmeli.
- [ ] İçerik derecelendirmesi anketi: şiddet yok (yalnızca soyut meteor patlamaları), kullanıcılar arası etkileşim yok, **reklam var**, **uygulama içi satın alma var**
- [ ] Hedef kitle: 13+ önerilir (çocuklara yönelik "Aileler" politikası ek gereksinim getirir)
- [ ] Kapalı test: yeni kişisel hesaplarda üretime geçmeden önce en az 12 test kullanıcısıyla 14 günlük kapalı test gerekir
- [ ] İmzalı AAB'yi yükle, Play App Signing'i kabul et

## Sonraki adımlar

- **Küresel skor tablosu:** Google Play Games Services liderlik tablosu (rekabet için en güçlü adım)
- **Bulut kaydı:** Play Games ile ilerlemenin cihazlar arası taşınması
- **Gelir:** Kozmetik kalem paketleri, sezonluk etkinlik kartı
- **İçerik:** Mevsimlik günlük kurallar, başarımlar, yeni yetenekler

## Lisanslar

- Oyun kodu ve görseller: tüm hakları saklıdır.
- Fontlar: [Unbounded](https://fonts.google.com/specimen/Unbounded) ve [Rubik](https://fonts.google.com/specimen/Rubik), SIL Open Font License 1.1.
