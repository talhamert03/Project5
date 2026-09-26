import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { isNative } from './platform';

/**
 * Gelir: ödüllü video reklamlar (AdMob) ve uygulama içi satın almalar (Google Play Billing).
 * Web'de (tarayıcı / önizleme) gerçek reklam ve ödeme yoktur: uygulama demo akışını gösterir.
 *
 * YAYIN ÖNCESİ: gerçek AdMob kimlikleri index.html'in başındaki INKFALL_ADS bloğuna
 * (derlenmiş pakette android/app/src/main/assets/public/index.html) ve AndroidManifest.xml'deki
 * APPLICATION_ID'ye yazılır, testing false yapılır. Ürün kimlikleri Play Console'da aynen açılmalı.
 */
interface AdsConfig {
  testing?: boolean;
  rewarded?: string;
  interstitial?: string;
  interstitialEvery?: number;
}
const ADS: AdsConfig = (window as unknown as { INKFALL_ADS?: AdsConfig }).INKFALL_ADS ?? {};
export const ADS_TESTING = ADS.testing !== false;
/** Ödüllü video birimi (varsayılan: Google'ın resmi test birimi) */
export const REWARDED_AD_ID = ADS.rewarded || 'ca-app-pub-3940256099942544/5224354917';
/** Geçiş (araya giren) reklam birimi (varsayılan: test birimi) */
export const INTERSTITIAL_AD_ID = ADS.interstitial || 'ca-app-pub-3940256099942544/1033173712';
/** Kaç oyunda bir zorunlu geçiş reklamı (Reklamsız pakette hiç çıkmaz) */
export const INTERSTITIAL_EVERY = Math.max(1, Math.round(ADS.interstitialEvery ?? 5));

export type ShopKind = 'coins' | 'starter' | 'noads';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  coins: number;
  /** yüzde ek altın (etiket) */
  bonus: number;
  tag?: 'popular' | 'best';
  /** mağaza fiyatı gelmezse (web/önizleme) gösterilecek yaklaşık fiyat */
  fallback: { tr: string; en: string };
}

export const SHOP: ShopItem[] = [
  { id: 'inkfall_starter', kind: 'starter', coins: 3000, bonus: 0, fallback: { tr: '₺49,99', en: '$1.99' } },
  { id: 'inkfall_coins_1000', kind: 'coins', coins: 1000, bonus: 0, fallback: { tr: '₺29,99', en: '$0.99' } },
  { id: 'inkfall_coins_2750', kind: 'coins', coins: 2750, bonus: 10, fallback: { tr: '₺74,99', en: '$2.49' } },
  { id: 'inkfall_coins_6000', kind: 'coins', coins: 6000, bonus: 20, tag: 'popular', fallback: { tr: '₺149,99', en: '$4.99' } },
  { id: 'inkfall_coins_14000', kind: 'coins', coins: 14000, bonus: 40, tag: 'best', fallback: { tr: '₺299,99', en: '$9.99' } },
  { id: 'inkfall_noads', kind: 'noads', coins: 0, bonus: 0, fallback: { tr: '₺99,99', en: '$3.99' } },
];

export const SHOP_BY_ID = new Map(SHOP.map((s) => [s.id, s]));

/** Başlangıç paketiyle açılan yetenek */
export const STARTER_SKILL = 'warp';
/** Günlük ücretsiz altın videosu: ödül ve hak */
export const FREE_COINS = 80;
export const FREE_COINS_PER_DAY = 5;

let adsReady = false;
let adsInit: Promise<void> | null = null;
let billingReady = false;
let billingInit: Promise<void> | null = null;
const prices = new Map<string, string>();

/**
 * Açılışta hiçbir şey başlatılmaz. Reklam SDK'sı ve önceden yüklenmiş bir reklam, oyunun
 * WebView'ıyla aynı işlem hattını paylaşır ve oyun sırasında takılmaya yol açar. Bu yüzden
 * reklam yalnızca oyuncu "Video izle"ye dokunduğunda yüklenir ve gösterildikten sonra
 * yenisi önceden yüklenmez. Satın alma istemcisi de mağaza açılınca bağlanır.
 */
export async function initMonetization(): Promise<void> {
  /* bilinçli olarak boş: tembel başlatma */
}

function ensureAds(): Promise<void> {
  if (!isNative) return Promise.resolve();
  if (!adsInit) {
    adsInit = (async () => {
      try {
        await AdMob.initialize({ initializeForTesting: ADS_TESTING });
        try {
          const info = await AdMob.requestConsentInfo();
          if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
        } catch {
          /* izin formu yoksa reklamlar kişiselleştirilmemiş gösterilir */
        }
        adsReady = true;
      } catch {
        adsReady = false;
        adsInit = null;
      }
    })();
  }
  return adsInit;
}

function ensureBilling(): Promise<void> {
  if (!isNative) return Promise.resolve();
  if (!billingInit) {
    billingInit = (async () => {
      try {
        const { isBillingSupported } = await NativePurchases.isBillingSupported();
        billingReady = isBillingSupported;
      } catch {
        billingReady = false;
        billingInit = null;
      }
    })();
  }
  return billingInit;
}

export type AdResult = 'rewarded' | 'skipped' | 'unavailable';

/** Yerelde ödüllü video: o an yüklenir ve gösterilir. Ödül yalnızca sonuna kadar izlenirse. */
export async function showRewardedAd(): Promise<AdResult> {
  if (!isNative) return 'unavailable';
  await ensureAds();
  if (!adsReady) return 'unavailable';
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID, isTesting: ADS_TESTING, immersiveMode: true });
  } catch {
    return 'unavailable';
  }
  let rewarded = false;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  try {
    const closed = new Promise<void>((resolve) => {
      void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()).then((h) => handles.push(h));
      void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()).then((h) => handles.push(h));
    });
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true)));
    await AdMob.showRewardVideoAd();
    await closed;
  } catch {
    /* gösterilemedi */
  } finally {
    for (const h of handles) void h.remove();
  }
  return rewarded ? 'rewarded' : 'skipped';
}

/** Geçiş reklamı: o an yüklenir ve gösterilir (oyun sırasında önceden yükleme yok). Kapatılınca döner. */
export async function showInterstitialAd(): Promise<boolean> {
  if (!isNative) return false;
  await ensureAds();
  if (!adsReady) return false;
  try {
    // yavaş ağda oyuncuyu bekletme: 8 sn'de yüklenmezse atla
    await Promise.race([
      AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID, isTesting: ADS_TESTING, immersiveMode: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
  } catch {
    return false;
  }
  const handles: Array<{ remove: () => Promise<void> }> = [];
  try {
    const closed = new Promise<void>((resolve) => {
      void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => resolve()).then((h) => handles.push(h));
      void AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => resolve()).then((h) => handles.push(h));
    });
    await AdMob.showInterstitial();
    await closed;
    return true;
  } catch {
    return false;
  } finally {
    for (const h of handles) void h.remove();
  }
}

export const hasNativeStore = (): boolean => isNative && billingReady;

/** Play'deki yerel fiyatlar (yoksa boş; arayüz yedek fiyatı gösterir) */
export async function loadPrices(): Promise<Map<string, string>> {
  await ensureBilling();
  if (!hasNativeStore() || prices.size) return prices;
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: SHOP.map((s) => s.id), productType: PURCHASE_TYPE.INAPP });
    for (const p of products) prices.set(p.identifier, p.priceString);
  } catch {
    /* fiyatlar gelmezse yedek gösterilir */
  }
  return prices;
}

export function priceOf(id: string, lang: 'tr' | 'en'): string {
  return prices.get(id) ?? SHOP_BY_ID.get(id)?.fallback[lang] ?? '';
}

export type BuyResult = 'ok' | 'cancelled' | 'error';

/** Google Play ödeme akışı. Altın paketleri tüketilir (tekrar alınabilir). */
export async function buyNative(item: ShopItem): Promise<BuyResult> {
  await ensureBilling();
  if (!billingReady) return 'error';
  try {
    const tx = await NativePurchases.purchaseProduct({
      productIdentifier: item.id,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: item.kind === 'coins',
      quantity: 1,
    });
    if (tx.purchaseState !== undefined && tx.purchaseState !== '1' && tx.purchaseState !== 'PURCHASED') return 'error';
    return 'ok';
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    return msg.includes('cancel') ? 'cancelled' : 'error';
  }
}

/** Kalıcı ürünleri (reklamsız, başlangıç paketi) geri yükle */
export async function ownedNonConsumables(): Promise<string[]> {
  await ensureBilling();
  if (!hasNativeStore()) return [];
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases.filter((p) => p.purchaseState === undefined || p.purchaseState === '1').map((p) => p.productIdentifier);
  } catch {
    return [];
  }
}
