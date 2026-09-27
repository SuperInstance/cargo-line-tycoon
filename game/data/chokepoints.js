// Cargo Line Tycoon — Phase 2 chokepoint canon (browser + Node dual-mode)
//
// Six real maritime chokepoints, each a provenance-bearing cell per
// game/src/provenance.js: {value, source, source_url, as_of, trust,
// seed_label, notes}. This is a curated, dated snapshot — NOT a live feed
// (rights/ToS; see CARGO-LINE-TYCOON.md §7). Every numeric or status fact
// below was checked against public reporting at research time (dates noted
// per-cell); where a figure is an honest order-of-magnitude reconstruction
// rather than a certified quote, trust is deliberately held below 0.8 and
// `notes` says so. Every cell here is source:'canon' — externally-cited
// facts carry a real URL; internal gameplay-baseline constants (e.g. the
// Phase 1 Panama toll/transit figures) instead cite the exact repo file and
// constant that defines them, per the schema's "precise repo-relative
// pointer" allowance (game/src/provenance.js) — still 'canon', not
// 'procgen', because they are fixed, curated design decisions, not a
// per-game generator draw.
//
// Nothing here is refreshed at runtime — Phase 5's (unbuilt) scouting moat
// (source:'scout') is the only thing allowed to move an as_of forward, and
// only through the same attest()/reattest() envelope.
//
// `status` is one of 'open' | 'congested' | 'disrupted'. `kind` is 'canal'
// (a toll-levying, engineered waterway — Panama, Suez) or 'strait' (a natural
// passage no authority tolls — Malacca, Hormuz, Bab-el-Mandeb, Gibraltar;
// real, and a genuine strategic asymmetry with the two canals).
//
// `disruption`/`congestion` are held-in-reserve multiplier tables (tollMult,
// transitMult, warRiskMult) applied on top of the base figures when a
// chokepoint's *current, in-game* status (tracked at runtime by the engine,
// not here) is 'disrupted'/'congested' — this file only supplies the
// baseline facts and the multiplier tables, never mutates itself. Any
// runtime status CHANGE the engine simulates is booked as source:'procgen'
// (see game/src/engine.js _tickChokepointEvents) — never written back here.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../src/provenance.js'));
  } else {
    root.CLT_CHOKEPOINTS = factory(root.CLTProvenance);
  }
})(typeof window !== 'undefined' ? window : this, function (provenance) {
  const { attest, SOURCES } = provenance;

  const CHOKEPOINTS = {
    panama: {
      id: 'panama', name: 'Panama Canal', lat: 9.08, lng: -79.68, kind: 'canal',
      tollPerTeu: attest(12, {
        source: SOURCES.CANON, source_url: 'game/src/economy.js#PANAMA_TOLL_PER_TEU', as_of: '2024-01-01', trust: 0.75,
        notes: 'Phase 1 gameplay baseline — real ACP tariffs vary by vessel size/laden state and rose further with the post-drought slot-auction system; this is a round gameplay figure, not a quote.',
      }),
      transitDays: attest(1, { source: SOURCES.CANON, source_url: 'game/src/economy.js#PANAMA_TRANSIT_DAYS', as_of: '2024-01-01', trust: 0.75, notes: 'Phase 1 gameplay baseline.' }),
      sizeLimit: attest('Neopanamax locks: ~366m LOA, ~49m beam, ~15.2m draft — blocks ULCV-class container ships (Phase 1: canTransitPanama=false).', {
        source: SOURCES.CANON, source_url: 'https://pancanal.com', as_of: '2024-01-01', trust: 0.85,
      }),
      status: attest('open', {
        source: SOURCES.CANON,
        source_url: 'https://mykn.kuehne-nagel.com/news/article/panama-canal-has-plenty-of-water-10-jul-2025',
        as_of: '2026-08-01', trust: 0.8,
        notes: 'Full operational recovery from the 2023-24 El Nino drought: ACP restored 36 daily transit slots and 50ft draft by mid-2025 (Gatun Lake ~87.7ft in Jul 2025); FY2025 transits up 19.3% YoY vs the drought-year prior. IMPORTANT: the in-game Panama route still runs its own seeded Phase 1 toy disruption (game/src/engine.js _tickPanamaEvent, a gameplay abstraction of the 2023-24 drought precedent, always source:"procgen" and rendered in the pencil register, never as news) — never confused with this canon, currently-open cell. An El Nino Watch was reissued in Apr 2026 for possible mid/late-2026 reemergence — a real reason the toy event stays plausible, not just decorative.',
      }),
      disruption: { tollMult: 2.5, transitMult: 3.0 }, // == PANAMA_DISRUPTION_{TOLL,TRANSIT}_MULT, kept byte-identical
    },

    suez: {
      id: 'suez', name: 'Suez Canal', lat: 30.5, lng: 32.35, kind: 'canal',
      tollPerTeu: attest(18, {
        source: SOURCES.CANON, source_url: 'https://www.suezcanal.gov.eg', as_of: '2025-06-01', trust: 0.55,
        notes: 'Illustrative composite. SCA tariffs vary by vessel type/size/direction/season, and the Authority has run crisis-era discounts (see status below) to compete with the Cape route — treat as order-of-magnitude, not a schedule quote.',
      }),
      transitDays: attest(1, { source: SOURCES.CANON, source_url: 'https://www.suezcanal.gov.eg', as_of: '2025-06-01', trust: 0.7, notes: 'Canal transit itself runs roughly half a day to a day depending on convoy; rounded to the game\'s integer-day ticks.' }),
      sizeLimit: attest('No lock/beam restriction (unlike Panama) — the world\'s largest ULCVs transit Suez routinely; this is a real, notable asymmetry between the two canals.', {
        source: SOURCES.CANON, source_url: 'https://www.suezcanal.gov.eg', as_of: '2024-01-01', trust: 0.85,
      }),
      status: attest('congested', {
        source: SOURCES.CANON,
        source_url: 'https://logfret.com/logfret-insights/suez-canal-traffic-remains-subdued-as-red-sea-rerouting-persists-into-2026/',
        as_of: '2025-12-25', trust: 0.7,
        notes: 'Transit volumes remained ~50-60% below the pre-crisis (pre-late-2023) baseline into early 2026, driven almost entirely by Red Sea/Bab-el-Mandeb risk on the canal\'s southern approach; most major carriers (Maersk, MSC, CMA CGM, Hapag-Lloyd) continued Cape of Good Hope diversions. SCA discounted its own toll schedule to try to win ships back even as external war-risk insurance stayed elevated — net shipper cost still rose despite the official discount, which is why the toll multiplier below is a discount (<1) while the transit multiplier is not.',
      }),
      congestion: { tollMult: 0.85, transitMult: 1.3 },
      disruption: { tollMult: 0.7, transitMult: 1.8 }, // held in reserve: an acute closure/blockage (e.g. an Ever Given-style grounding)
    },

    bab_el_mandeb: {
      id: 'bab_el_mandeb', name: 'Bab-el-Mandeb Strait', lat: 12.6, lng: 43.3, kind: 'strait',
      tollPerTeu: attest(0, { source: SOURCES.CANON, source_url: 'https://www.maritime.dot.gov/msci', as_of: '2024-01-01', trust: 0.9, notes: 'A natural strait, not a canal — no transit authority levies a toll here.' }),
      warRiskSurchargePerTeu: attest(2, { source: SOURCES.CANON, source_url: 'https://www.maritime.dot.gov/msci/2025-012-red-sea-bab-el-mandeb-strait-gulf-aden-arabian-sea-persian-gulf-and-somali-basin', as_of: '2025-12-25', trust: 0.5, notes: 'Illustrative baseline war-risk/insurance add-on, not a quoted premium — actual premiums are negotiated per-voyage and not publicly itemized per TEU.' }),
      transitDays: attest(1, { source: SOURCES.CANON, source_url: 'game/data/chokepoints.js#bab_el_mandeb.transitDays', as_of: '2024-01-01', trust: 0.8, notes: 'A geometric estimate (strait width / typical transit speed), not a cited figure.' }),
      sizeLimit: attest('Wide natural strait — no size restriction for commercial shipping.', { source: SOURCES.CANON, source_url: 'https://www.maritime.dot.gov/msci', as_of: '2024-01-01', trust: 0.85 }),
      status: attest('congested', {
        source: SOURCES.CANON,
        source_url: 'https://www.maritime.dot.gov/msci/2025-012-red-sea-bab-el-mandeb-strait-gulf-aden-arabian-sea-persian-gulf-and-somali-basin',
        as_of: '2025-11-30', trust: 0.7,
        notes: 'Houthi attacks on commercial shipping (from Nov 2023) paused after the Oct 2025 Israel-Gaza ceasefire — no attacks recorded Oct-Nov 2025 at research time — but transits only "modestly increased" by end of Nov 2025, and most carriers still avoided the corridor pending a verified, sustained security guarantee. Read as "recovering, not resolved," not "clear." (A Sept 2025 strike on a Dutch-flagged ship in the Gulf of Aden, one mariner killed, is the most recent confirmed attack at research time.)',
      }),
      congestion: { warRiskMult: 3, transitMult: 1.4 },
      disruption: { warRiskMult: 8, transitMult: 2.2 }, // held in reserve: a relapse to active attacks
    },

    hormuz: {
      id: 'hormuz', name: 'Strait of Hormuz', lat: 26.57, lng: 56.25, kind: 'strait',
      tollPerTeu: attest(0, {
        source: SOURCES.CANON, source_url: 'https://www.foxnews.com/world/strait-hormuz-toll-would-set-dangerous-precedent-un-shipping-agency-warns', as_of: '2026-08-27', trust: 0.85,
        notes: 'A natural strait — the IMO explicitly rejected 2026 proposals to toll it, warning that would "set a dangerous precedent" for international straits; no lawful transit toll exists.',
      }),
      warRiskSurchargePerTeu: attest(3, { source: SOURCES.CANON, source_url: 'https://www.congress.gov/crs-product/R45281', as_of: '2025-06-01', trust: 0.4, notes: 'Illustrative *baseline* (pre-2026-crisis) Gulf war-risk insurance add-on — see status below for the current, far more severe reality; this baseline figure predates the crisis and is not what a shipper would pay today.' }),
      transitDays: attest(1, { source: SOURCES.CANON, source_url: 'game/data/chokepoints.js#hormuz.transitDays', as_of: '2024-01-01', trust: 0.8, notes: 'A geometric estimate, not a cited figure.' }),
      sizeLimit: attest('Wide natural strait — no size restriction for commercial shipping.', { source: SOURCES.CANON, source_url: 'https://www.congress.gov/crs-product/R45281', as_of: '2024-01-01', trust: 0.85 }),
      status: attest('disrupted', {
        source: SOURCES.CANON,
        source_url: 'https://www.aljazeera.com/news/2026/8/27/how-a-95-percent-drop-in-hormuz-traffic-changed-global-shipping',
        as_of: '2026-08-27', trust: 0.85,
        notes: 'Since the US-Israel-Iran air war began 2026-02-28, Iran has periodically declared the Strait "closed," attacked and boarded commercial vessels, and laid sea mines; Gulf crude exports are down ~47% (17M -> ~9M bpd) and Hormuz traffic down ~95% as of late Aug 2026 (Al Jazeera). This is the single most severe real-world fact in this canon — modeled as fully blocking commercial transit (blocksTransit below), not merely more expensive: there is no alternate sea route in or out of the Persian Gulf.',
      }),
      blocksTransit: true, // while status === 'disrupted': routing must refuse, not just upcharge — Hormuz is the ONLY sea access to the Persian Gulf
      disruption: { warRiskMult: 20, transitMult: 3 }, // held for a de-escalated-but-still-tense/high-risk-but-technically-passable state
      congestion: { warRiskMult: 10, transitMult: 2 }, // a partial reopening under armed escort, still far from normal
    },

    malacca: {
      id: 'malacca', name: 'Strait of Malacca', lat: 2.85, lng: 101.15, kind: 'strait',
      tollPerTeu: attest(0, { source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Malacca', as_of: '2024-01-01', trust: 0.85, notes: 'A natural strait — no canal-style transit toll; Malaysia/Indonesia/Singapore levy separate port and pilotage fees not modeled here.' }),
      warRiskSurchargePerTeu: attest(0.5, { source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Malacca', as_of: '2024-01-01', trust: 0.5, notes: 'Small standing piracy/congestion risk premium — one of the world\'s busiest waterways and, historically, a higher-piracy-risk one.' }),
      transitDays: attest(1, { source: SOURCES.CANON, source_url: 'game/data/chokepoints.js#malacca.transitDays', as_of: '2024-01-01', trust: 0.75, notes: 'A geometric estimate, not a cited figure.' }),
      sizeLimit: attest('"Malaccamax": draft limit ~19.5-25m depending on survey — binds the largest crude supertankers (VLCC/ULCC-class), not container ships; no ship class in this game is Malacca-limited.', {
        source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Malacca', as_of: '2024-01-01', trust: 0.7,
      }),
      status: attest('open', {
        source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Malacca', as_of: '2025-06-01', trust: 0.6,
        notes: 'No acute crisis identified at this canon\'s research pass — kept open/unremarkable rather than inventing a disruption. Honest degradation cuts both ways: the absence of a sourced event is not itself evidence of calm, only of "nothing found," which is why trust here is moderate rather than high.',
      }),
      disruption: { warRiskMult: 4, transitMult: 1.5 }, // held in reserve, not currently active
      congestion: { warRiskMult: 2, transitMult: 1.2 },
    },

    gibraltar: {
      id: 'gibraltar', name: 'Strait of Gibraltar', lat: 35.95, lng: -5.6, kind: 'strait',
      tollPerTeu: attest(0, { source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Gibraltar', as_of: '2024-01-01', trust: 0.85, notes: 'A natural strait — no transit toll.' }),
      warRiskSurchargePerTeu: attest(0, { source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Gibraltar', as_of: '2024-01-01', trust: 0.6 }),
      transitDays: attest(1, { source: SOURCES.CANON, source_url: 'game/data/chokepoints.js#gibraltar.transitDays', as_of: '2024-01-01', trust: 0.75, notes: 'A geometric estimate, not a cited figure.' }),
      sizeLimit: attest('Wide, deep natural strait — no size restriction.', { source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Gibraltar', as_of: '2024-01-01', trust: 0.85 }),
      status: attest('open', {
        source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Strait_of_Gibraltar', as_of: '2025-06-01', trust: 0.6,
        notes: 'No acute crisis identified. Modeled here as the Atlantic<->Mediterranean gateway our Rotterdam/Ras-Tanura/Singapore corridors actually need; the Dover Strait (English Channel) is the other classic European chokepoint but sits on no lane this canon\'s ports touch, so it is intentionally not separately modeled ("Gibraltar/Dover as fits").',
      }),
      disruption: { warRiskMult: 2, transitMult: 1.2 }, // held in reserve, not currently active
      congestion: { warRiskMult: 1.3, transitMult: 1.1 },
    },
  };

  const CHOKEPOINT_IDS = Object.keys(CHOKEPOINTS);

  return { CHOKEPOINTS, CHOKEPOINT_IDS };
});
