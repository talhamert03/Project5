# Inkfall: Google Play'e yayın rehberi

Bu paket Android Studio'da doğrudan açılır. Node.js ya da npm kurmana gerek yok: oyunun derlenmiş hali ve
Gradle'ın ihtiyaç duyduğu Capacitor modülleri pakette hazır.

## 1. Paketin içeriği

```
Inkfall/
├─ android/                  ← Android Studio'da AÇACAĞIN klasör
│  └─ app/src/main/
│     ├─ AndroidManifest.xml ← AdMob uygulama kimliği (APPLICATION_ID)
│     └─ assets/public/index.html ← oyun (en üstte reklam ayarları)
├─ node_modules/             ← yalnızca Capacitor'ın Android modülleri (silme, yerini değiştirme)
├─ store/                    ← Play Store görselleri ve mağaza metinleri
├─ docs/privacy-policy.md    ← gizlilik politikası metni
├─ src/, index.html, ...     ← oyunun kaynak kodu (ileride değişiklik için)
└─ GOOGLE-PLAY-YAYIN-REHBERI.txt (bu dosya)
```

> Önemli: `android` ve `node_modules` klasörleri yan yana durmalı. Paketi ayrı klasörlere
> dağıtırsan Gradle Capacitor modüllerini bulamaz.

## 2. Android Studio'da açma ve deneme

1. Android Studio'yu kur (en güncel sürüm). Kendi Java'sıyla gelir, ayrıca JDK kurmana gerek yok.
2. Paketi bir klasöre çıkar. Yolda Türkçe karakter ve boşluk olmaması en sorunsuzudur
   (örnek: `C:\Projeler\Inkfall`).
3. Android Studio → **Open** → `Inkfall\android` klasörünü seç (kök `Inkfall` klasörünü değil).
4. İlk açılışta Gradle eşitlemesi (Sync) internetten bileşenleri indirir. Birkaç dakika sürebilir.
   "SDK bulunamadı" derse SDK Manager'dan Android SDK 36 ve Build Tools'u kur.
5. Telefonu USB hata ayıklama açık bağla (ya da bir emülatör seç) ve yeşil **Run ▶** düğmesine bas.

## 3. Yayından önce: gerçek reklam kimlikleri (AdMob)

Pakette Google'ın **test** reklamları var: çalışır ama para kazandırmaz. Yayından önce:

1. https://admob.google.com adresinde hesap aç → **Uygulamalar → Uygulama ekle** → Android → "Inkfall".
2. Sana verilen **uygulama kimliğini** (`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` biçiminde)
   `android/app/src/main/AndroidManifest.xml` içindeki şu satıra yaz:
   ```xml
   android:name="com.google.android.gms.ads.APPLICATION_ID"
   android:value="BURAYA_UYGULAMA_KIMLIGI"/>
   ```
3. AdMob'da iki **reklam birimi** oluştur:
   - **Ödüllü** (devam etme, 2 kat altın, hediye videoları için)
   - **Geçiş reklamı / Interstitial** (her 5 oyunda bir çıkan zorunlu reklam)
4. `android/app/src/main/assets/public/index.html` dosyasını Not Defteri ile aç. En üstteki bloğu düzenle:
   ```js
   window.INKFALL_ADS = {
     testing: false,                                      // yayında false
     rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/1111111111',   // ödüllü birim kimliği
     interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/2222222222', // geçiş birimi kimliği
     interstitialEvery: 5                                 // kaç oyunda bir geçiş reklamı
   };
   ```
5. **Uyarı:** Kendi reklamlarına tıklama. Denemeyi test kimlikleriyle yap, yoksa AdMob hesabın kapanabilir.

## 4. İmzalı paket (AAB) oluşturma

Google Play APK değil **AAB (Android App Bundle)** ister.

1. Android Studio → **Build → Generate Signed App Bundle or APK** → **Android App Bundle** → Next.
2. **Create new...** ile yeni bir anahtar deposu (`.jks`) oluştur. Şifreyi ve anahtar adını not al.
   - Bu dosyayı ve şifreleri **güvenli bir yere yedekle.** Kaybedersen güncelleme yüklemekte zorlanırsın.
3. **release** seç → **Create**. Dosya genelde `android/app/release/app-release.aab` konumuna yazılır.

Her güncellemede `android/app/build.gradle` içindeki sürüm numarasını artır:
```
versionCode ((System.getenv("MK_VERSION_CODE") ?: "10600") as Integer)   // 10601, 10602... (hep büyümeli)
versionName (System.getenv("MK_VERSION_NAME") ?: "1.6.0")               // görünen sürüm
```

## 5. Google Play Console

1. https://play.google.com/console adresinde geliştirici hesabı aç (tek seferlik ücret).
2. **Uygulama oluştur** → ad: `Inkfall: Meteor Defense`, varsayılan dil Türkçe, **Oyun**, **Ücretsiz**.
   Paket adı `com.talhamert.inkfall` olarak gelir (ilk yüklemeden sonra değiştirilemez).
3. **Test → Dahili test** bölümünde yeni sürüm oluştur ve AAB dosyasını yükle.
   Google Play Uygulama İmzalama varsayılan olarak açık kalsın.
4. **Uygulama içi ürünler** (Para kazanma → Ürünler). İlk AAB'yi yükledikten sonra açılır.
   Kimlikleri **aynen** şöyle oluştur, fiyatlarını sen belirle:

   | Ürün kimliği | Ne verir | Önerilen fiyat |
   |---|---|---|
   | `inkfall_starter` | 3.000 altın + Zaman Kırılması (tek sefer) | 49,99 ₺ |
   | `inkfall_coins_1000` | 1.000 altın | 29,99 ₺ |
   | `inkfall_coins_2750` | 2.750 altın | 74,99 ₺ |
   | `inkfall_coins_6000` | 6.000 altın | 149,99 ₺ |
   | `inkfall_coins_14000` | 14.000 altın | 299,99 ₺ |
   | `inkfall_noads` | Reklamsız: geçiş reklamları kalkar, video ödülleri anında | 99,99 ₺ |

5. **Mağaza girişi:** metinler `store/listing.md` içinde. Simge `store/icon-512.png`, öne çıkan görsel
   `store/feature-graphic-tr.jpg`, ekran görüntüleri `store/screenshots/`.
6. **Gizlilik politikası:** `docs/privacy-policy.md` metnini herkese açık bir adreste yayınla
   (örneğin Google Sites) ve bağlantıyı **Uygulama içeriği → Gizlilik politikası** alanına yaz.
7. **Uygulama içeriği** formları:
   - Reklam içeriyor mu: **Evet**
   - Veri güvenliği: AdMob reklam kimliği, cihaz bilgisi ve uygulama etkileşimlerini toplar
     (reklam ve analiz amaçlı). Satın almaları Google Play işler. Oyun kendi sunucusuna veri göndermez.
   - Hedef kitle: 13 yaş ve üzeri (gizlilik politikasıyla uyumlu)
   - İçerik derecelendirme anketini doldur.
8. **Önemli (yeni kişisel hesaplar):** Google, yeni açılan kişisel geliştirici hesaplarında üretime
   çıkmadan önce **en az 12 test kullanıcısıyla 14 gün kapalı test** ister. Bu durumda önce
   **Test → Kapalı test** yap, süre dolunca **Üretim** için başvur.

## 6. Oyunu değiştirip yeniden derlemek (isteğe bağlı)

Kaynak koddan yeniden derlemek istersen bilgisayara Node.js 20+ kur, `Inkfall` klasöründe:
```
npm install
npm run build
npx cap sync android
```
Sonra Android Studio'da yeniden Run / Generate Signed Bundle yap. Reklam ayarları bu durumda
kök klasördeki `index.html` dosyasının en üstündedir.
