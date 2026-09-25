import type { SaveData } from '../core/storage';
import type { RunResult } from '../game/world';
import { PENS, type Pen } from '../game/pens';
import { UPGRADE_BY_ID } from '../game/upgrades';
import { getLang, t } from '../i18n';
import { ATMOSPHERES, atmosphereIndexForWave, firstWaveOf } from '../render/atmospheres';
import {
  type DailyInfo,
  GIFT_REWARDS,
  type GiftState,
  RANKS,
  type RankProgress,
  SKILLS,
  type Settlement,
  WORKSHOP,
  rankProgress,
} from '../meta/progression';
import { FREE_COINS, FREE_COINS_PER_DAY, SHOP, priceOf } from '../monetize';
import { fmt, fmtDuration, fmtTime, roman } from './format';
import { icon } from './icons';

export function rankLabel(idx: number): string {
  const r = RANKS[idx];
  return `${t('rank.' + r.key)}${r.tier ? ' ' + roman(r.tier) : ''}`;
}

function seal(idx: number, size = 48): string {
  const r = RANKS[idx];
  const letter = t('rank.' + r.key).charAt(0).toLocaleUpperCase(getLang() === 'tr' ? 'tr-TR' : 'en-US');
  return `<div class="seal" style="--rc:${r.color};--s:${size}px"><b>${letter}</b>${r.tier ? `<i>${roman(r.tier)}</i>` : ''}</div>`;
}

export function rankCard(p: RankProgress, best: number, extraClass = '', rankUp = false): string {
  const next = p.next ? t('menu.toNext', { rank: rankLabel(p.idx + 1), n: fmt(p.need) }) : t('menu.maxRank');
  return `
    <div class="rank-card ${extraClass}" style="--rc:${p.rank.color}">
      ${seal(p.idx)}
      <div class="rank-info">
        ${rankUp ? `<div class="rank-up">${icon('star')}${t('over.rankUp')}</div>` : ''}
        <div class="rank-name">${rankLabel(p.idx)}</div>
        <div class="bar"><i style="--w:${(p.frac * 100).toFixed(1)}%"></i></div>
        <div class="rank-next">${next}</div>
      </div>
      <div class="best-box"><small>${t('menu.best')}</small><b>${fmt(best)}</b></div>
    </div>`;
}

const LOGO_STROKE = `<svg class="logo-stroke" viewBox="0 0 300 22" preserveAspectRatio="none"><path d="M6 14 C 60 2, 110 20, 160 10 S 250 4, 294 12"/></svg>`;

export function bootHTML(): string {
  return `
    <section class="screen boot" id="boot">
      <h1 class="logo"><span>${t('app.title1')}</span><span>${t('app.title2')}</span>${LOGO_STROKE}</h1>
      <p class="tagline">${t('app.tagline')}</p>
      <div class="boot-hint">${t('app.tap')}</div>
    </section>`;
}

export interface MenuData {
  save: SaveData;
  daily: DailyInfo;
  gift: GiftState;
  worldName: string;
  worldIndex: number;
}

/** Mobil oyun ana ekranı: üst profil çubuğu, yan hızlı butonlar, büyük OYNA */
export function menuHTML(d: MenuData): string {
  const s = d.save;
  const p = rankProgress(s.best);
  const unlocked = Math.min(ATMOSPHERES.length, s.maxAtm + 1);
  const meta: string[] = [];
  if (s.streak.count > 0) meta.push(`<span class="meta-chip streak">${icon('flame')}${t('menu.streakDays', { n: s.streak.count })}</span>`);
  if (s.bestWave > 0) meta.push(`<span class="meta-chip">${icon('lines')}${t('menu.bestWave', { n: s.bestWave })}</span>`);
  return `
    <section class="screen home" id="menu">
      <header class="topbar enter" style="--d:0">
        <button class="profile" data-a="panel" data-p="records" style="--rc:${p.rank.color}">
          ${seal(p.idx, 42)}
          <span class="profile-info">
            <b>${rankLabel(p.idx)}</b>
            <span class="xp"><i style="--w:${(p.frac * 100).toFixed(1)}%"></i></span>
          </span>
        </button>
        <div class="top-right">
          <button class="currency" data-a="shop">${icon('coin')}<b class="coin-count" id="m-coins">${fmt(s.coins)}</b><span class="plus">+</span></button>
          <button class="icon-btn sm" data-a="panel" data-p="settings" aria-label="${t('menu.settings')}">${icon('gear')}</button>
        </div>
      </header>

      <div class="brand home-brand enter" style="--d:1">
        <h1 class="logo"><span>${t('app.title1')}</span><span>${t('app.title2')}</span>${LOGO_STROKE}</h1>
        <div class="world-chip" style="--ac:${ATMOSPHERES[d.worldIndex].accent}">${icon('planet')}${d.worldName}</div>
      </div>

      <div class="home-mid">
        <div class="side left">
          <button class="fab gift ${d.gift.ready ? 'ready' : ''}" data-a="gift" style="--ac:var(--gold)">
            <span class="fab-ic">${icon('gift')}${d.gift.ready ? '<i class="dot">!</i>' : ''}</span>
            <span class="fab-label">${t('menu.gift')}</span>
          </button>
          <button class="fab" data-a="panel" data-p="daily" style="--ac:var(--ember)">
            <span class="fab-ic">${icon('calendar')}</span>
            <span class="fab-label">${t('menu.daily')}</span>
            <small class="fab-sub">${t('mod.' + d.daily.mod.id)}</small>
          </button>
          <button class="fab shop-fab" data-a="shop" style="--ac:var(--gold)">
            <span class="fab-ic">${icon('bag')}${!s.starter ? '<i class="dot">%</i>' : ''}</span>
            <span class="fab-label">${t('menu.shop')}</span>
          </button>
        </div>
        <div class="side right">
          <button class="fab" data-a="panel" data-p="worlds" style="--ac:${ATMOSPHERES[Math.min(unlocked, ATMOSPHERES.length) - 1].accent}">
            <span class="fab-ic">${icon('planet')}</span>
            <span class="fab-label">${t('menu.worlds')}</span>
            <small class="fab-sub">${unlocked}/${ATMOSPHERES.length}</small>
          </button>
          <button class="fab" data-a="panel" data-p="skills" style="--ac:${(SKILLS.find((k) => k.id === s.skill) ?? SKILLS[0]).color}">
            <span class="fab-ic">${icon((SKILLS.find((k) => k.id === s.skill) ?? SKILLS[0]).icon)}</span>
            <span class="fab-label">${t('menu.skills')}</span>
          </button>
        </div>
      </div>

      <div class="home-play enter" style="--d:2">
        ${meta.length ? `<div class="play-meta">${meta.join('')}</div>` : ''}
        <div class="play-wrap">
          <span class="ring"></span>
          <button class="btn-play big" data-a="play">${icon('play')}<span class="play-text">${t('menu.play')}</span></button>
        </div>
      </div>
    </section>`;
}

export type TabName = 'pens' | 'workshop' | 'home' | 'missions' | 'records';

/** Alt sekme çubuğu (menüde her zaman görünür) */
export function tabbarHTML(active: TabName, missionsBadge: number, canBuy: boolean): string {
  const tab = (id: TabName, ic: string, label: string, badge = ''): string =>
    `<button class="tab ${active === id ? 'active' : ''} ${id === 'home' ? 'home-tab' : ''}" data-a="tab" data-p="${id}">
      <span class="tab-ic">${icon(ic)}${badge}</span><span class="tab-label">${label}</span>
    </button>`;
  return `
    <nav class="tabbar" aria-label="menu">
      ${tab('pens', 'pen', t('menu.pens'))}
      ${tab('workshop', 'hammer', t('menu.workshop'), canBuy ? '<i class="badge dot"></i>' : '')}
      ${tab('home', 'home', t('menu.home'))}
      ${tab('missions', 'target', t('menu.missions'), missionsBadge > 0 ? `<i class="badge">${missionsBadge}</i>` : '')}
      ${tab('records', 'trophy', t('menu.records'))}
    </nav>`;
}

/** Dünyalar galerisi: açılan atmosferler, menü arka planı seçimi */
export function worldsHTML(save: SaveData, thumbs: string[], current: number): string {
  const cards = ATMOSPHERES.map((a, i) => {
    const unlocked = i <= save.maxAtm;
    const selected = i === current;
    const first = firstWaveOf(i);
    const range = i === ATMOSPHERES.length - 1 ? t('worlds.wavesEnd', { a: first }) : t('worlds.waves', { a: first, b: first + 4 });
    const status = selected
      ? `<span class="w-status on">${icon('check')}${t('worlds.selected')}</span>`
      : unlocked
        ? `<span class="w-status">${t('worlds.select')}</span>`
        : `<span class="w-status locked">${icon('lock')}${t('worlds.locked', { n: first })}</span>`;
    return `
      <button class="world ${unlocked ? '' : 'locked'} ${selected ? 'selected' : ''}" data-a="world" data-i="${i}" style="--ac:${a.accent};--d:${i}">
        <span class="w-thumb">${thumbs[i] ? `<img src="${thumbs[i]}" alt="">` : ''}${unlocked ? '' : `<span class="w-lock">${icon('lock')}</span>`}</span>
        <span class="w-info">
          <b>${t('atm.' + a.id)}</b>
          <small>${range}</small>
          <em>${t('atm.' + a.id + '.d')}</em>
        </span>
        ${status}
      </button>`;
  }).join('');
  return panel('worlds', t('worlds.title'), `<p class="lead">${t('worlds.desc')}</p><div class="worlds">${cards}</div>`, save.coins);
}

/** Günlük hediye penceresi (7 günlük takvim) */
export function giftHTML(g: GiftState, noAds = false): string {
  const days = GIFT_REWARDS.map((r, i) => {
    const done = g.ready ? i < g.day : i <= g.day;
    const today = g.ready && i === g.day;
    return `
      <div class="gday ${done ? 'done' : ''} ${today ? 'today' : ''} ${i === 6 ? 'big' : ''}" style="--d:${i}">
        <small>${t('gift.day', { n: i + 1 })}</small>
        <span class="g-ic">${done ? icon('check') : icon(i === 6 ? 'gift' : 'coin')}</span>
        <b>${fmt(r)}</b>
      </div>`;
  }).join('');
  return `
    <section class="screen modal" id="gift-modal">
      <div class="modal-card gift-card">
        <button class="icon-btn sm modal-x" data-a="closeModal" aria-label="${t('common.close')}">${icon('close')}</button>
        <div class="gift-hero ${g.ready ? 'ready' : ''}">${icon('gift')}</div>
        <h2>${t('gift.title')}</h2>
        <p>${t('gift.desc')}</p>
        <div class="gift-grid">${days}</div>
        ${
          g.ready
            ? `<button class="btn-play gold btn-video" data-a="claimGift2x">${icon(noAds ? 'x2' : 'video')}${t('gift.claim2x', { n: fmt(GIFT_REWARDS[g.day] * 2) })}</button>
               <button class="btn-ghost wide" data-a="claimGift">${icon('coin')}${t('gift.claim', { n: fmt(GIFT_REWARDS[g.day]) })}</button>`
            : `<button class="btn-ghost wide" data-a="closeModal">${t('gift.tomorrow')}</button>`
        }
      </div>
    </section>`;
}

export interface ReviveOffer {
  /** video ile devam hakkı var mı (turda bir kez) */
  video: boolean;
  noAds: boolean;
  cost: number;
  bank: number;
  seconds: number;
}

/** Şehir düşerken: video izleyerek (ya da altınla) devam et */
export function reviveHTML(o: ReviveOffer): string {
  const canCoins = o.cost > 0 && o.bank >= o.cost;
  return `
    <section class="screen modal revive" id="revive-modal">
      <div class="modal-card revive-card">
        <div class="revive-timer" style="--dur:${o.seconds}s">
          <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" cx="32" cy="32" r="28"/></svg>
          <span>${icon('house')}</span>
        </div>
        <h2>${t('revive.title')}</h2>
        <p>${t('revive.desc')}</p>
        ${
          o.video
            ? `<button class="btn-play gold btn-video" data-a="reviveVideo">${icon(o.noAds ? 'play' : 'video')}<span>${o.noAds ? t('revive.free') : t('revive.video')}</span></button>`
            : ''
        }
        ${
          canCoins
            ? `<button class="${o.video ? 'btn-ghost wide coin-alt' : 'btn-play gold'}" data-a="revive">${icon('coin')}${fmt(o.cost)} · ${t('revive.go')}</button>`
            : ''
        }
        <button class="btn-ghost wide" data-a="giveup">${t('revive.no')}</button>
        ${o.cost > 0 ? `<small class="bank">${t('revive.bank', { n: fmt(o.bank) })}</small>` : ''}
      </div>
    </section>`;
}

/** Web demo reklamı (gerçek uygulamada burada AdMob videosu oynar) */
export function adHTML(seconds: number): string {
  return `
    <section class="screen modal ad-demo" id="ad-demo">
      <div class="ad-card">
        <div class="ad-top"><span class="ad-tag">${t('ad.tag')}</span><span class="ad-count" id="ad-count">${seconds}</span></div>
        <div class="ad-stage">
          <div class="ad-logo">${icon('video')}</div>
          <b>${t('ad.title')}</b>
          <p>${t('ad.desc')}</p>
        </div>
        <div class="ad-bar"><i style="--dur:${seconds}s"></i></div>
        <button class="btn-ghost wide" data-a="adClose" id="ad-close" hidden>${t('ad.close')}</button>
      </div>
    </section>`;
}

/** Mağaza: altın paketleri, başlangıç paketi, reklamsız ve günlük ücretsiz altın */
export function shopHTML(save: SaveData, native: boolean): string {
  const lang = getLang();
  const today = new Date().toISOString().slice(0, 10);
  const used = save.adCoins.date === today ? save.adCoins.n : 0;
  const left = Math.max(0, FREE_COINS_PER_DAY - used);
  const free = `
    <div class="shop-free" style="--d:0">
      <div class="ic">${icon('video')}</div>
      <div><h4>${t('shop.free', { n: FREE_COINS })}</h4><p>${t('shop.freeLeft', { n: left, max: FREE_COINS_PER_DAY })}</p></div>
      <button class="buy ${left > 0 ? '' : 'disabled'}" data-a="freeCoins">${icon(save.noAds ? 'coin' : 'video')}${t('shop.watch')}</button>
    </div>`;
  const packs = SHOP.filter((i) => i.kind === 'coins')
    .map(
      (i, k) => `
      <button class="pack ${i.tag ?? ''}" data-a="buy" data-id="${i.id}" style="--d:${k + 2}">
        ${i.tag ? `<span class="pack-tag">${t('shop.' + i.tag)}</span>` : ''}
        <span class="pack-coins">${'<i></i>'.repeat(Math.min(4, k + 1))}${icon('coin')}</span>
        <b>${fmt(i.coins)}</b>
        ${i.bonus ? `<small class="pack-bonus">+%${i.bonus}</small>` : '<small class="pack-bonus"></small>'}
        <span class="pack-price">${priceOf(i.id, lang)}</span>
      </button>`,
    )
    .join('');
  const starter = SHOP.find((i) => i.kind === 'starter')!;
  const noads = SHOP.find((i) => i.kind === 'noads')!;
  const starterCard = save.starter
    ? ''
    : `
    <button class="offer starter" data-a="buy" data-id="${starter.id}" style="--d:1">
      <span class="offer-badge">${t('shop.once')}</span>
      <div class="offer-art">${icon('gem')}</div>
      <div class="offer-body">
        <h4>${t('shop.starter')}</h4>
        <p>${t('shop.starterDesc', { n: fmt(starter.coins) })}</p>
      </div>
      <span class="pack-price">${priceOf(starter.id, lang)}</span>
    </button>`;
  const noadsCard = save.noAds
    ? `<div class="offer noads owned" style="--d:7"><div class="offer-art">${icon('noads')}</div><div class="offer-body"><h4>${t('shop.noads')}</h4><p>${t('shop.noadsOwned')}</p></div><span class="buy done">${icon('check')}</span></div>`
    : `
    <button class="offer noads" data-a="buy" data-id="${noads.id}" style="--d:7">
      <div class="offer-art">${icon('noads')}</div>
      <div class="offer-body"><h4>${t('shop.noads')}</h4><p>${t('shop.noadsDesc')}</p></div>
      <span class="pack-price">${priceOf(noads.id, lang)}</span>
    </button>`;
  const body = `
    ${starterCard}
    <h3 class="shop-h">${t('shop.coins')}</h3>
    <div class="packs">${packs}</div>
    ${noadsCard}
    ${free}
    <div class="shop-foot">
      ${native ? `<button class="btn-ghost" data-a="restore">${t('shop.restore')}</button>` : `<p class="note">${t('shop.demo')}</p>`}
    </div>`;
  return panel('shop', t('shop.title'), body, save.coins);
}

/** Yetenekler: bir tanesi takılır, dolunca oyunda tek dokunuşla tetiklenir */
export function skillsHTML(save: SaveData): string {
  const cards = SKILLS.map((k, i) => {
    const owned = save.skills.includes(k.id);
    const on = save.skill === k.id;
    let btn: string;
    if (on) btn = `<span class="buy done">${icon('check')}${t('skills.on')}</span>`;
    else if (owned) btn = `<button class="buy ghost" data-a="equipSkill" data-id="${k.id}">${t('skills.equip')}</button>`;
    else btn = `<button class="buy ${save.coins >= k.price ? '' : 'disabled'}" data-a="buySkill" data-id="${k.id}">${icon('coin')}${fmt(k.price)}</button>`;
    return `
      <div class="skill-card ${on ? 'on' : ''} ${owned ? '' : 'locked'}" style="--sc:${k.color};--d:${i}">
        <div class="skill-orb">${icon(k.icon)}</div>
        <div class="skill-info">
          <h4>${t('skill.' + k.id)}</h4>
          <p>${t('skill.' + k.id + '.d')}</p>
        </div>
        ${btn}
      </div>`;
  }).join('');
  return panel('skills', t('skills.title'), `<p class="lead">${t('skills.desc')}</p><div class="skill-list">${cards}</div>`, save.coins);
}

function upgradeDesc(id: string, nextLevel: number): string {
  const def = UPGRADE_BY_ID.get(id)!;
  const v = def.value ? def.value(nextLevel) : '';
  return t(`upg.${id}.d`, { v });
}

export function upgradeHTML(ids: string[], levels: Record<string, number>, sub: string, rerolls: number): string {
  const cards = ids
    .map((id, i) => {
      const def = UPGRADE_BY_ID.get(id)!;
      const lvl = levels[id] ?? 0;
      const tag = id === 'repair' ? '' : lvl === 0 ? t('up.new') : t('up.level', { n: lvl + 1 });
      return `
      <button class="card r${def.rarity}" data-a="pick" data-id="${id}" style="--d:${i}">
        <div class="card-icon">${icon(def.icon)}</div>
        <div class="card-body">
          <div class="card-top"><span class="rarity">${t('rarity.' + def.rarity)}</span>${tag ? `<span class="lvl">${tag}</span>` : ''}</div>
          <h3>${t('upg.' + id)}</h3>
          <p>${upgradeDesc(id, lvl + 1)}</p>
        </div>
      </button>`;
    })
    .join('');
  return `
    <section class="screen upgrade" id="upgrade">
      <h2>${t('up.title')}</h2>
      <p class="sub">${sub}</p>
      <div class="cards">${cards}</div>
      ${rerolls > 0 ? `<div class="reroll-row"><button class="btn-ghost" data-a="reroll">${icon('reroll')}${t('up.reroll', { n: rerolls })}</button></div>` : ''}
    </section>`;
}

export function pauseHTML(save: SaveData): string {
  const st = save.settings;
  return `
    <section class="screen pause" id="pause">
      <div class="pause-box">
        <h2>${t('pause.title')}</h2>
        <button class="btn-play" data-a="resume">${icon('play')}${t('pause.resume')}</button>
        <div class="toggles">
          <button class="tog ${st.music ? 'on' : ''}" data-a="set" data-k="music">${icon('music')}${t('settings.music')}</button>
          <button class="tog ${st.sfx ? 'on' : ''}" data-a="set" data-k="sfx">${icon('sound')}${t('settings.sfx')}</button>
          <button class="tog ${st.haptics ? 'on' : ''}" data-a="set" data-k="haptics">${icon('vibrate')}${t('settings.haptics')}</button>
        </div>
        <button class="btn-ghost" data-a="restart">${icon('restart')}${t('pause.restart')}</button>
        <button class="btn-ghost" data-a="quit">${icon('home')}${t('pause.menu')}</button>
        <p class="note">${t('pause.note')}</p>
      </div>
    </section>`;
}

export function overHTML(r: RunResult, st: Settlement, best: number, dailyBest: number, canDouble = false, noAds = false): string {
  const p = rankProgress(best);
  const rankUp = st.rankAfter > st.rankBefore;
  const rows: string[] = [];
  let d = 0;
  rows.push(
    `<div class="reward-row gold" style="--d:${d++}"><span>${t('over.coins')}</span><span class="reward">${icon('coin')}<span id="o-coins">0</span></span></div>`,
  );
  if (st.streakBonus > 0) {
    rows.push(`<div class="reward-row" style="--d:${d++}"><span>${icon('flame')} ${t('over.streak', { n: Math.round(st.streakBonus / 25) })}</span><span class="reward">+${st.streakBonus}</span></div>`);
  }
  for (const m of st.missions) {
    rows.push(
      `<div class="reward-row gold" style="--d:${d++}"><span>${icon('check')} ${t('m.' + m.id, { n: fmt(m.target) })}</span><span class="reward">+${fmt(m.reward)}</span></div>`,
    );
  }
  if (r.daily) {
    rows.push(`<div class="reward-row" style="--d:${d++}"><span>${st.dailyBest ? t('over.dailyBest') : t('over.daily', { n: fmt(dailyBest) })}</span><span>${icon('calendar')}</span></div>`);
  }
  const toBest = !st.newBest && st.prevBest > 0 ? `<div class="tobest">${t('over.toBest', { n: fmt(st.prevBest - r.score) })}</div>` : '';
  return `
    <section class="screen over" id="over">
      <div class="over-inner">
      <div class="over-title">${t('over.title')}</div>
      ${(() => {
        const wi = atmosphereIndexForWave(Math.max(1, r.wave));
        const a = ATMOSPHERES[wi];
        return `<div class="world-chip" style="--ac:${a.accent}">${icon('planet')}${t('banner.chapter', { n: wi + 1 })} · ${t('atm.' + a.id)}</div>`;
      })()}
      <div class="over-score">
        <span class="label">${t('over.score')}</span>
        <b id="o-score">0</b>
        ${st.newBest && r.score > 0 ? `<div class="newbest">${t('over.newBest')}</div>` : toBest}
      </div>
      ${rankCard(p, best, rankUp ? 'levelup' : '', rankUp)}
      <div class="stats">
        <div><span class="label">${t('over.wave')}</span><b>${r.wave}</b></div>
        <div><span class="label">${t('over.combo')}</span><b>${r.maxCombo}</b></div>
        <div><span class="label">${t('over.kills')}</span><b>${r.kills}</b></div>
        <div><span class="label">${t('over.time')}</span><b>${fmtTime(r.time)}</b></div>
      </div>
      <div class="rewards">${rows.join('')}</div>
      ${
        canDouble && st.coins > 0
          ? `<button class="btn-video double" data-a="double">${icon(noAds ? 'x2' : 'video')}<span>${t('over.double', { n: fmt(st.coins) })}</span></button>`
          : ''
      }
      <div class="over-actions">
        <button class="btn-play" data-a="again">${icon('restart')}${t('over.again')}</button>
        <button class="btn-ghost" data-a="menu" aria-label="${t('over.menu')}">${icon('home')}</button>
      </div>
      </div>
    </section>`;
}

function panel(id: string, title: string, body: string, coins: number): string {
  return `
    <section class="screen panel" id="panel-${id}">
      <div class="panel-head">
        <button class="icon-btn" data-a="close" aria-label="${t('common.back')}">${icon('back')}</button>
        <h2>${title}</h2>
        <div class="chip coin">${icon('coin')}<span class="coin-count">${fmt(coins)}</span></div>
      </div>
      <div class="panel-body">${body}</div>
    </section>`;
}

export function dailyHTML(save: SaveData, d: DailyInfo): string {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  const today = save.daily.date === d.key ? save.daily : { best: 0, attempts: 0 };
  const streakDays = Array.from({ length: 7 }, (_, i) => `<i class="${i < Math.min(save.streak.count, 7) ? 'on' : ''}"></i>`).join('');
  const body = `
    <p class="lead enter">${t('daily.desc')}</p>
    <div class="daily-hero enter" style="--d:1">
      <div class="mod">${t('mod.' + d.mod.id)}</div>
      <p>${t('mod.' + d.mod.id + '.d')}</p>
    </div>
    <div class="kv enter" style="--d:1">
      <div><span class="label">${t('daily.best')}</span><b>${fmt(today.best)}</b><small class="lead">${t('daily.attempts', { n: today.attempts })}</small></div>
      <div><span class="label">${t('daily.streak')}</span><b>${t('daily.streakDays', { n: save.streak.count })}</b><div class="streak-days">${streakDays}</div></div>
    </div>
    <p class="lead enter" style="--d:2">${t('daily.streakHint')} ${t('daily.coins')}.</p>
    <button class="btn-play gold enter" style="--d:3" data-a="playDaily">${icon('play')}${t('daily.play')}</button>
    <p class="note enter" style="--d:4">${t('daily.resets', { h: Math.floor(mins / 60), m: mins % 60 })}</p>`;
  return panel('daily', t('daily.title'), body, save.coins);
}

export function missionsHTML(save: SaveData): string {
  const colors: Record<string, string> = {
    kills: 'var(--ember)',
    combo: 'var(--gold)',
    wave: 'var(--ink)',
    score: 'var(--paper)',
    perfect: 'var(--gold)',
    boss: 'var(--crimson)',
    golden: 'var(--gold)',
    oneline: 'var(--ink)',
    chain: 'var(--violet)',
    deflects: 'var(--ink)',
    daily: 'var(--gold)',
  };
  const icons: Record<string, string> = {
    kills: 'blast',
    combo: 'bolt',
    wave: 'lines',
    score: 'star',
    perfect: 'check',
    boss: 'crown',
    golden: 'coin',
    oneline: 'nib',
    chain: 'bolt',
    deflects: 'bounce',
    daily: 'calendar',
  };
  const rows = save.missions
    .map((m, i) => {
      const frac = Math.min(1, m.progress / m.target);
      return `
      <div class="row" style="--d:${i};--tc:${colors[m.id] ?? 'var(--ink)'}">
        <div class="ic">${icon(icons[m.id] ?? 'target')}</div>
        <div>
          <h4>${t('m.' + m.id, { n: fmt(m.target) })}</h4>
          <div class="progress-mini"><i style="--w:${(frac * 100).toFixed(1)}%"></i></div>
          <p>${fmt(Math.min(m.progress, m.target))} / ${fmt(m.target)}</p>
        </div>
        <span class="reward">${icon('coin')}${fmt(m.reward)}</span>
      </div>`;
    })
    .join('');
  return panel('missions', t('missions.title'), `<p class="lead">${t('missions.desc')}</p><div class="list">${rows}</div>`, save.coins);
}

export function workshopHTML(save: SaveData): string {
  const colors = ['var(--ink)', 'var(--ink)', 'var(--violet)', 'var(--rose)', 'var(--gold)', 'var(--gold)', 'var(--violet)'];
  const rows = WORKSHOP.map((w, i) => {
    const lvl = save.workshop[w.id] ?? 0;
    const maxed = lvl >= w.max;
    const cost = maxed ? 0 : w.cost(lvl);
    const can = !maxed && save.coins >= cost;
    const dots = Array.from({ length: w.max }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('');
    return `
      <div class="row" style="--d:${i};--tc:${colors[i]}">
        <div class="ic">${icon(w.icon)}</div>
        <div>
          <h4>${t('ws.' + w.id)}</h4>
          <p>${t('ws.' + w.id + '.d')}</p>
          <div class="lvl-dots">${dots}</div>
        </div>
        ${
          maxed
            ? `<span class="buy done">${t('workshop.max')}</span>`
            : `<button class="buy ${can ? '' : 'disabled'}" data-a="buyWs" data-id="${w.id}">${icon('coin')}${fmt(cost)}</button>`
        }
      </div>`;
  }).join('');
  return panel('workshop', t('workshop.title'), `<p class="lead">${t('workshop.desc')}</p><div class="list">${rows}</div>`, save.coins);
}

function penSwatch(p: Pen, id: string): string {
  const stroke = p.rainbow ? `url(#rg-${id})` : p.color;
  const grad = p.rainbow
    ? `<defs><linearGradient id="rg-${id}" x1="0" x2="1"><stop offset="0" stop-color="#ff4f8b"/><stop offset=".25" stop-color="#ffc857"/><stop offset=".5" stop-color="#3df58a"/><stop offset=".75" stop-color="#3ef0e0"/><stop offset="1" stop-color="#a77bff"/></linearGradient></defs>`
    : '';
  return `<svg class="pen-swatch" viewBox="0 0 140 54">${grad}
    <path d="M10 38 C 40 6, 72 50, 130 16" stroke="${stroke}" stroke-width="16" opacity=".22"/>
    <path d="M10 38 C 40 6, 72 50, 130 16" stroke="${stroke}" stroke-width="7"/>
    <path d="M10 38 C 40 6, 72 50, 130 16" stroke="${p.core}" stroke-width="2.4"/></svg>`;
}

export function pensHTML(save: SaveData): string {
  const bestRank = rankProgress(save.best).idx;
  const cards = PENS.map((p, i) => {
    const owned = save.pens.includes(p.id);
    const equipped = save.pen === p.id;
    const rankLocked = p.rank !== undefined && bestRank < p.rank;
    let btn: string;
    if (equipped) btn = `<span class="buy done">${t('pens.equipped')}</span>`;
    else if (owned) btn = `<button class="buy ghost" data-a="equip" data-id="${p.id}">${t('pens.equip')}</button>`;
    else if (rankLocked) btn = `<span class="buy ghost disabled">${icon('lock')}${t('pens.needRank', { rank: rankLabel(p.rank!) })}</span>`;
    else if (p.price === 0) btn = `<button class="buy ghost" data-a="equip" data-id="${p.id}">${t('pens.equip')}</button>`;
    else btn = `<button class="buy ${save.coins >= p.price ? '' : 'disabled'}" data-a="buyPen" data-id="${p.id}">${icon('coin')}${fmt(p.price)}</button>`;
    return `
      <div class="pen ${equipped ? 'equipped' : ''} ${rankLocked && !owned ? 'locked' : ''}" style="--pc:${p.color};--d:${i}">
        ${penSwatch(p, p.id)}
        <h4>${t('pen.' + p.id)}</h4>
        ${btn}
      </div>`;
  }).join('');
  return panel('pens', t('pens.title'), `<p class="lead">${t('pens.desc')}</p><div class="pen-grid">${cards}</div>`, save.coins);
}

export function recordsHTML(save: SaveData): string {
  const recs = save.records.length
    ? save.records
        .map(
          (r, i) => `
      <div class="rec" style="--d:${i}">
        <span class="pos">${i + 1}</span>
        <div><b>${fmt(r.score)}</b><br><small>${t('over.wave')} ${r.wave} · ${r.date}${r.daily ? ' · ' + t('st.daily') : ''}</small></div>
        ${i === 0 ? `<span style="color:var(--gold);font-size:22px">${icon('crown')}</span>` : '<span></span>'}
      </div>`,
        )
        .join('')
    : `<p class="lead">${t('records.empty')}</p>`;
  const stats = `
    <div class="kv">
      <div><span class="label">${t('st.runs')}</span><b>${fmt(save.totalRuns)}</b></div>
      <div><span class="label">${t('st.kills')}</span><b>${fmt(save.totalKills)}</b></div>
      <div><span class="label">${t('st.wave')}</span><b>${save.bestWave}</b></div>
      <div><span class="label">${t('st.combo')}</span><b>${save.bestCombo}</b></div>
      <div><span class="label">${t('st.boss')}</span><b>${save.bossKills}</b></div>
      <div><span class="label">${t('st.time')}</span><b>${fmtDuration(save.totalPlaySec)}</b></div>
    </div>`;
  return panel(
    'records',
    t('records.title'),
    `${rankCard(rankProgress(save.best), save.best)}<div class="section-title">${t('records.top')}</div><div class="list">${recs}</div><div class="section-title">${t('records.stats')}</div>${stats}`,
    save.coins,
  );
}

export function settingsHTML(save: SaveData, version: string, canFullscreen: boolean, resetArmed: boolean): string {
  const st = save.settings;
  const sw = (k: string, on: boolean, ic: string, label: string): string => `
    <button class="toggle-row" data-a="set" data-k="${k}"><span class="l">${icon(ic)}${label}</span><span class="switch ${on ? 'on' : ''}"></span></button>`;
  const seg = (k: string, opts: Array<[string, string]>, val: string): string =>
    `<div class="seg">${opts.map(([v, l]) => `<button class="${v === val ? 'on' : ''}" data-a="setv" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const body = `
    <div class="list">
      ${sw('music', st.music, 'music', t('settings.music'))}
      ${sw('sfx', st.sfx, 'sound', t('settings.sfx'))}
      ${sw('haptics', st.haptics, 'vibrate', t('settings.haptics'))}
      <div class="toggle-row"><span class="l">${icon('star')}${t('settings.quality')}</span>${seg(
        'quality',
        [
          ['high', t('q.high')],
          ['balanced', t('q.balanced')],
          ['saver', t('q.saver')],
        ],
        st.quality,
      )}</div>
      <div class="toggle-row"><span class="l">${icon('info')}${t('settings.lang')}</span>${seg(
        'lang',
        [
          ['auto', t('lang.auto')],
          ['tr', 'TR'],
          ['en', 'EN'],
        ],
        st.lang,
      )}</div>
      ${sw('showFps', st.showFps, 'chart', t('settings.fps'))}
      ${canFullscreen ? `<button class="toggle-row" data-a="fullscreen"><span class="l">${icon('expand')}${t('settings.fullscreen')}</span><span></span></button>` : ''}
    </div>
    <div class="section-title"></div>
    <div class="list">
      <button class="btn-ghost" data-a="tutorial">${icon('info')}${t('settings.tutorial')}</button>
      <button class="btn-ghost danger" data-a="reset">${icon('restart')}${resetArmed ? t('settings.resetConfirm') : t('settings.reset')}</button>
    </div>
    <p class="credits">${t('settings.credits', { v: version })}</p>`;
  return panel('settings', t('settings.title'), body, save.coins);
}

export function bannerHTML(big: string, small: string, boss: boolean, color?: string): string {
  return `
    <div class="banner ${boss ? 'boss' : ''}" ${color ? `style="--bc:${color}"` : ''}>
      <div class="big">${big}</div>
      <svg class="stroke" viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M6 10 C 70 2, 120 14, 170 8 S 260 4, 294 9"/></svg>
      ${small ? `<div class="small">${small}</div>` : ''}
    </div>`;
}

export function toastHTML(ic: string, text: string): string {
  return `<div class="toast">${icon(ic)}<span>${text}</span></div>`;
}

