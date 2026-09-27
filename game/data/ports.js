// Cargo Line Tycoon — Phase 1+2 port canon (browser + Node dual-mode)
//
// The original 10 ports are a verbatim JS mirror of
// ../../locales/en/canon/ports.json (the real US/CA ports canon), plus a
// fixed, documented flavor mapping of a primary export commodity per port.
// It exists as its own .js file (rather than being fetch()'d as .json) so
// the offline game works when opened directly from disk via file:// — no
// local server required, no bundler.
//
// SOURCE OF TRUTH (US/CA 10): locales/en/canon/ports.json. If that file
// changes, mirror the change here by hand (small, deliberate, and
// reviewable — there are only 10 ports).
//
// The commodity assignment is a real-world-grounded simplification for game
// flavor, not fabricated canon: Houston (crude oil export/import hub),
// Savannah (major US auto-import terminal, Kia/Hyundai), Vancouver and New
// Orleans (major grain export corridors, prairie wheat / Mississippi corn &
// soy), Baltimore (top US auto-import port). The rest default to a generic
// consumer-goods mix ("electronics"/"apparel") reflecting their role as
// general container gateways. This is flavor + a light price-model input,
// not a claim about exact commodity mix.
//
// Phase 2 adds 3 real international ports (rotterdam, singapore, ras_tanura)
// — NOT mirrored from locales/en/canon/ports.json (that file stays the 10
// US/CA locale canon used by the classroom apps; these 3 are Phase-2-only
// additions, sourced independently, see `provenance` per port below). They
// exist so the 5 new Phase-2 chokepoint cells (game/data/chokepoints.js)
// have real lanes to sit on — Suez/Bab-el-Mandeb/Gibraltar/Malacca/Hormuz
// are inert trivia without a real corridor that actually transits them; see
// the CORRIDORS table in game/src/economy.js. `annual_teus` figures for
// these 3 are well-known approximate public figures, compiled from general
// knowledge rather than freshly web-verified this session (lower trust,
// said plainly). Ras Tanura is a crude oil export terminal, not a container
// port, so its annual_teus is null and it carries annual_bpd instead — a
// TEU figure would be fabricated, not real.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../src/provenance.js'));
  } else {
    root.CLT_PORTS = factory(root.CLTProvenance);
  }
})(typeof window !== 'undefined' ? window : this, function (provenance) {
  const { attest, SOURCES } = provenance;

  const US_CA_PROVENANCE = attest('lat/lng/annual_teus/tier per locale canon', {
    source: SOURCES.CANON, source_url: 'locales/en/canon/ports.json', as_of: '2024-01-01', trust: 1.0,
  });

  const PORTS = [
    { id: 'los_angeles', name: 'Port of Los Angeles', lat: 33.7395, lng: -118.2610, country: 'US', annual_teus: 9000000, notable: ['San Pedro Bay complex', 'LA-Long Beach combined'], tier: 1, commodity: 'electronics', region: 'WEST_COAST', provenance: US_CA_PROVENANCE },
    { id: 'long_beach', name: 'Port of Long Beach', lat: 33.7550, lng: -118.2160, country: 'US', annual_teus: 9000000, notable: ['2nd busiest US container port'], tier: 1, commodity: 'apparel', region: 'WEST_COAST', provenance: US_CA_PROVENANCE },
    { id: 'new_york', name: 'Port of New York and New Jersey', lat: 40.6699, lng: -74.0431, country: 'US', annual_teus: 7000000, notable: ['East coast gateway'], tier: 1, commodity: 'apparel', region: 'EAST_GULF_COAST', provenance: US_CA_PROVENANCE },
    { id: 'savannah', name: 'Port of Savannah', lat: 32.0809, lng: -81.0912, country: 'US', annual_teus: 5000000, notable: ['Largest single-terminal facility on East coast'], tier: 1, commodity: 'automobiles', region: 'EAST_GULF_COAST', provenance: US_CA_PROVENANCE },
    { id: 'houston', name: 'Port of Houston', lat: 29.7355, lng: -95.3018, country: 'US', annual_teus: 4000000, notable: ['Largest US port by tonnage'], tier: 1, commodity: 'crude_oil', region: 'EAST_GULF_COAST', provenance: US_CA_PROVENANCE },
    { id: 'vancouver', name: 'Port of Vancouver', lat: 49.2884, lng: -123.1152, country: 'CA', annual_teus: 3500000, notable: ['Largest Canadian port'], tier: 1, commodity: 'grain', region: 'WEST_COAST', provenance: US_CA_PROVENANCE },
    { id: 'miami', name: 'PortMiami', lat: 25.7785, lng: -80.1772, country: 'US', annual_teus: 1100000, notable: ['Cruise capital of the world'], tier: 1, commodity: 'electronics', region: 'EAST_GULF_COAST', provenance: US_CA_PROVENANCE },
    { id: 'seattle', name: 'Port of Seattle', lat: 47.5903, lng: -122.3343, country: 'US', annual_teus: 1900000, notable: ['Pacific Northwest gateway'], tier: 2, commodity: 'electronics', region: 'WEST_COAST', provenance: US_CA_PROVENANCE },
    { id: 'new_orleans', name: 'Port of New Orleans', lat: 29.9450, lng: -90.0668, country: 'US', annual_teus: 500000, notable: ['Mississippi River deepwater'], tier: 2, commodity: 'grain', region: 'EAST_GULF_COAST', provenance: US_CA_PROVENANCE },
    { id: 'baltimore', name: 'Port of Baltimore', lat: 39.2672, lng: -76.5779, country: 'US', annual_teus: 1100000, notable: ['Roll-on/roll-off cars'], tier: 2, commodity: 'automobiles', region: 'EAST_GULF_COAST', provenance: US_CA_PROVENANCE },

    // ── Phase 2: 3 real international ports, added so the new chokepoint
    // cells (Suez/Malacca/Hormuz/Bab-el-Mandeb/Gibraltar) sit on real,
    // playable corridors instead of being inert canon. See file header.
    {
      id: 'rotterdam', name: 'Port of Rotterdam', lat: 51.9244, lng: 4.4777, country: 'NL',
      annual_teus: 13_800_000, notable: ["Europe's largest port", 'Rhine/Maas delta gateway'], tier: 1,
      commodity: 'electronics', region: 'EUROPE',
      provenance: attest('lat/lng/annual_teus per Port of Rotterdam Authority throughput reporting', {
        source: SOURCES.CANON, source_url: 'https://www.portofrotterdam.com/en/news-and-press-releases/cargo-throughput-port-rotterdam-slightly-decreased-2024',
        as_of: '2024-12-31', trust: 0.8,
        notes: '13.8M TEU in 2024 (container throughput +2.8% YoY even as total tonnage slightly declined) — the Port Authority\'s own reported figure, web-verified this session.',
      }),
    },
    {
      id: 'singapore', name: 'Port of Singapore', lat: 1.2900, lng: 103.8500, country: 'SG',
      annual_teus: 41_120_000, notable: ["World's busiest transshipment hub"], tier: 1,
      commodity: 'electronics', region: 'ASIA_PACIFIC',
      provenance: attest('lat/lng/annual_teus per PSA Singapore / MPA throughput reporting', {
        source: SOURCES.CANON, source_url: 'https://www.singaporepsa.com/2024/12/27/psa-singapore-hits-record-breaking-annual-throughput-of-more-than-40-million-teus/',
        as_of: '2024-12-27', trust: 0.8,
        notes: '41.12M TEU in 2024, a record (+5.4% YoY over 39.0M TEU in 2023) — PSA Singapore\'s own press release, web-verified this session; ~90% is transshipment per MPA.',
      }),
    },
    {
      id: 'ras_tanura', name: 'Ras Tanura Terminal', lat: 26.6438, lng: 50.1593, country: 'SA',
      annual_teus: null, annual_bpd: 6_500_000,
      notable: ["Saudi Aramco's principal crude oil export terminal", 'Not a container port'], tier: 1,
      commodity: 'crude_oil', region: 'PERSIAN_GULF',
      provenance: attest('lat/lng/annual_bpd per public reporting on Saudi Aramco terminal capacity', {
        source: SOURCES.CANON, source_url: 'https://en.wikipedia.org/wiki/Ras_Tanura',
        as_of: '2024-01-01', trust: 0.7,
        notes: 'A real, major crude terminal; ~6.5M bpd is the most commonly cited export-terminal capacity figure (some sources cite up to 9M bpd for peak simultaneous berth loading vs. sustained system flow) — web-verified this session, still an approximate public figure, not a primary Aramco disclosure. annual_teus is intentionally null (not a container port) rather than a fabricated TEU count.',
      }),
    },
  ];

  const VESSEL_TYPES = [
    { id: 'tugboat', name: 'Tugboat', size_tier: 'small', uses: ['harbor assistance'] },
    { id: 'container_small', name: 'Feeder Container Ship', size_tier: 'small', uses: ['regional routes'] },
    { id: 'container_medium', name: 'Panamax Container', size_tier: 'medium', uses: ['trans-Pacific'] },
    { id: 'container_large', name: 'ULCV Container', size_tier: 'large', uses: ['Asia-Europe'] },
    { id: 'tanker', name: 'Crude Tanker', size_tier: 'large', uses: ['oil transport'] },
    { id: 'bulk_carrier', name: 'Bulk Carrier', size_tier: 'medium', uses: ['grain, ore'] },
  ];

  // West coast vs. East/Gulf coast — any route crossing this split has no
  // real great-circle sea lane; it must transit the Panama Canal (or round
  // Cape Horn, which no operator actually chooses commercially). This was
  // the ONE live chokepoint for the Phase 1 toy: real, grounded, and it
  // visibly changes optimal routing when disrupted (see game/src/economy.js)
  // — kept exactly as-is; Phase 2 only adds regions and corridors alongside.
  const WEST_COAST = ['los_angeles', 'long_beach', 'seattle', 'vancouver'];
  const EAST_GULF_COAST = ['new_york', 'savannah', 'houston', 'new_orleans', 'miami', 'baltimore'];

  // Phase 2: the 3 new international ports each anchor their own
  // single-port region (a real corridor still needs a real chokepoint chain
  // to cross between regions — see CORRIDORS in game/src/economy.js).
  const EUROPE = ['rotterdam'];
  const ASIA_PACIFIC = ['singapore'];
  const PERSIAN_GULF = ['ras_tanura'];

  const REGIONS = { WEST_COAST, EAST_GULF_COAST, EUROPE, ASIA_PACIFIC, PERSIAN_GULF };

  function regionOf(portId) {
    for (const name of Object.keys(REGIONS)) {
      if (REGIONS[name].includes(portId)) return name;
    }
    throw new Error(`regionOf: unknown port ${portId}`);
  }

  const PORTS_BY_ID = {};
  for (const p of PORTS) PORTS_BY_ID[p.id] = p;

  return {
    PORTS, PORTS_BY_ID, VESSEL_TYPES, WEST_COAST, EAST_GULF_COAST,
    EUROPE, ASIA_PACIFIC, PERSIAN_GULF, REGIONS, regionOf,
  };
});
