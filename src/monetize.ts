import { AdMob, AdmobConsentStatus, RewardAdPluginEvents } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { isNative } from './platform';

/**
 * Gelir: ödüllü video reklamlar (AdMob) ve uygulama içi satın almalar (Google Play Billing).
 * Web'de (tarayıcı / önizleme) gerçek reklam ve ödeme yoktur: uygulama demo akışını gösterir.
 *
 * YAYIN ÖNCESİ: AdMob hesabındaki gerçek kimlikleri aşağıya ve AndroidManifest.xml'deki
 * APPLICATION_ID'ye yaz, ADS_TESTING'i false yap. Ürün kimlikleri Play Console'da aynen açılmalı.
 */
export const ADS_TESTING = true;
/** Google'ın resmi test ödüllü reklam birimi (gerçeğiyle değiştirilecek) */
export const REWARDED_AD_ID = 'ca-app-pub-3940256099942544/5224354917';

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
let adLoaded = false;
let billingReady = false;
const prices = new Map<string, string>();

/** Açılışta bir kez: reklam SDK'sı + izin formu (AB), satın alma istemcisi */
export async function initMonetization(): Promise<void> {
  if (!isNative) return;
  try {
    await AdMob.initialize({ initializeForTesting: ADS_TESTING });
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    } catch {
      /* izin formu yoksa reklamlar kişiselleştirilmemiş gösterilir */
    }
    adsReady = true;
    void preloadAd();
  } catch {
    adsReady = false;
  }
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    billingReady = isBillingSupported;
  } catch {
    billingReady = false;
  }
}

async function preloadAd(): Promise<void> {
  if (!adsReady || adLoaded) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID, isTesting: ADS_TESTING, immersiveMode: true });
    adLoaded = true;
  } catch {
    adLoaded = false;
  }
}

export type AdResult = 'rewarded' | 'skipped' | 'unavailable';

/** Yerelde ödüllü video göster. Ödül yalnızca video sonuna kadar izlenirse verilir. */
export async function showRewardedAd(): Promise<AdResult> {
  if (!isNative || !adsReady) return 'unavailable';
  if (!adLoaded) await preloadAd();
  if (!adLoaded) return 'unavailable';
  let rewarded = false;
  const handles = [];
  try {
    const closed = new Promise<void>((resolve) => {
      void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()).then((h) => handles.push(h));
      void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()).then((h) => handles.push(h));
    });
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true)));
    adLoaded = false;
    await AdMob.showRewardVideoAd();
    await closed;
  } catch {
    /* gösterilemedi */
  } finally {
    for (const h of handles) void h.remove();
    void preloadAd();
  }
  return rewarded ? 'rewarded' : 'skipped';
}

export const hasNativeStore = (): boolean => isNative && billingReady;

/** Play'deki yerel fiyatlar (yoksa boş; arayüz yedek fiyatı gösterir) */
export async function loadPrices(): Promise<Map<string, string>> {
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
  if (!hasNativeStore()) return [];
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases.filter((p) => p.purchaseState === undefined || p.purchaseState === '1').map((p) => p.productIdentifier);
  } catch {
    return [];
  }
}
