/**
 * Ağır hazırlık işleri (dünya gökyüzü, ev görselleri, önizlemeler) tek seferde yapılırsa kare
 * takılır. Her iş bir üreteçtir (generator): birkaç ms'lik adımlar arasında `yield` eder.
 * Kuyruk her karede verilen süre bütçesi kadar ilerletilir; ihtiyaç anında bir iş hemen
 * bitirilebilir (finish).
 */
interface Job {
  key: string;
  it: Iterator<unknown>;
}

export class Jobs {
  private q: Job[] = [];

  has(key: string): boolean {
    return this.q.some((j) => j.key === key);
  }

  /** İş ekle (aynı anahtarla bekleyen varsa eklenmez). front: öne al (oyun işleri önizlemelerden önce) */
  add(key: string, it: Iterator<unknown>, front = false): void {
    if (this.has(key)) {
      if (front) {
        const i = this.q.findIndex((j) => j.key === key);
        const [j] = this.q.splice(i, 1);
        this.q.unshift(j);
      }
      return;
    }
    if (front) this.q.unshift({ key, it });
    else this.q.push({ key, it });
  }

  /** Bekleyen işi hemen sonuna kadar çalıştır; iş yoksa false */
  finish(key: string): boolean {
    const i = this.q.findIndex((j) => j.key === key);
    if (i < 0) return false;
    const j = this.q[i];
    this.q.splice(i, 1);
    while (!j.it.next().done) {
      /* sürdür */
    }
    return true;
  }

  /** Anahtarı önekle başlayan bekleyen işleri iptal et (ör. ekran boyutu değişti) */
  cancel(prefix: string): void {
    this.q = this.q.filter((j) => !j.key.startsWith(prefix));
  }

  /** Bütçe (ms) dolana kadar sıradaki işleri ilerlet; her karede en az bir adım */
  pump(budgetMs: number): void {
    if (!this.q.length) return;
    const t0 = performance.now();
    do {
      const j = this.q[0];
      if (j.it.next().done) this.q.shift();
    } while (this.q.length && performance.now() - t0 < budgetMs);
  }

  get busy(): boolean {
    return this.q.length > 0;
  }
}

export const jobs = new Jobs();
