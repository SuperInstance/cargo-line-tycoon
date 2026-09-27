// Cargo Line Tycoon — the truth pool (browser + Node dual-mode)
//
// The Fable apex call's truth-pool doctrine (FABLE-CARGO-LINE-ANSWER.md §7.1.3,
// settled in arch/cargo-line-fact-landed.md §5): "reality withheld, not
// invented." The game ships with MORE truth than it shows and lands it over
// play, via the seeded reveal schedule in game/src/pencil.js — so "grows
// toward real as you play" works OFFLINE on day one, with no dependency on
// the (unbuilt) L1 scouting moat.
//
// SOURCE OF TRUTH: locales/en/canon/pool.json. This file is a verbatim JS
// mirror (see game/data/ports.js's own header for why: file:// offline play,
// no bundler, no fetch()). If pool.json changes, mirror the change here by
// hand — there are only 14 rows.
//
// Every row cites a real, checkable source (mostly the port's own Wikipedia
// article — general-knowledge compiled this session, not freshly
// web-verified, so trust is held at a moderate 0.65 rather than the
// 0.8-1.0 a freshly-verified primary source earns elsewhere in this canon —
// the same honest-degradation posture game/data/chokepoints.js already uses
// for malacca/gibraltar). `teu: 0` marks a real port whose primary cargo
// isn't containers (bulk/ro-ro/breakbulk/oil), never a fabricated figure —
// same convention as ras_tanura in game/data/ports.js.
//
// "Omit any entry that cannot cite a real URL" (Fable §7.2): every row below
// has one. No candidate port considered this session was dropped for lack
// of a citation — all 14 made the cut.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../src/provenance.js'));
  } else {
    root.CLT_POOL = factory(root.CLTProvenance);
  }
})(typeof window !== 'undefined' ? window : this, function (provenance) {
  const { attest, SOURCES } = provenance;

  const RAW = [
    { id: 'oakland', value: { name: 'Port of Oakland', lat: 37.7955, lng: -122.2775, teu: 2300000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Oakland', as_of: '2024-06-01', trust: 0.65 },
    { id: 'tacoma', value: { name: 'Port of Tacoma', lat: 47.2648, lng: -122.4162, teu: 1900000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Tacoma', as_of: '2024-06-01', trust: 0.65 },
    { id: 'prince_rupert', value: { name: 'Prince Rupert (Fairview Terminal)', lat: 54.3150, lng: -130.3208, teu: 1300000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Prince_Rupert', as_of: '2024-06-01', trust: 0.65 },
    { id: 'port_hueneme', value: { name: 'Port Hueneme', lat: 34.148, lng: -119.207, teu: 0 }, source_url: 'https://en.wikipedia.org/wiki/Port_Hueneme,_California', as_of: '2024-06-01', trust: 0.7 },
    { id: 'san_diego', value: { name: 'Port of San Diego (Tenth Avenue Marine Terminal)', lat: 32.7078, lng: -117.1547, teu: 0 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_San_Diego', as_of: '2024-06-01', trust: 0.65 },
    { id: 'charleston', value: { name: 'Port of Charleston', lat: 32.7833, lng: -79.9247, teu: 2700000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Charleston', as_of: '2024-06-01', trust: 0.65 },
    { id: 'norfolk', value: { name: 'Port of Virginia (Norfolk International Terminals)', lat: 36.9050, lng: -76.3283, teu: 3000000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Virginia', as_of: '2024-06-01', trust: 0.65 },
    { id: 'jacksonville', value: { name: 'Port of Jacksonville (JAXPORT)', lat: 30.3860, lng: -81.5720, teu: 1000000 }, source_url: 'https://en.wikipedia.org/wiki/Jacksonville_Port_Authority', as_of: '2024-06-01', trust: 0.65 },
    { id: 'mobile', value: { name: 'Port of Mobile', lat: 30.6944, lng: -88.0400, teu: 450000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Mobile', as_of: '2024-06-01', trust: 0.65 },
    { id: 'tampa', value: { name: 'Port Tampa Bay', lat: 27.9278, lng: -82.4472, teu: 0 }, source_url: 'https://en.wikipedia.org/wiki/Port_Tampa_Bay', as_of: '2024-06-01', trust: 0.65 },
    { id: 'philadelphia', value: { name: 'PhilaPort', lat: 39.9187, lng: -75.1390, teu: 700000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Philadelphia', as_of: '2024-06-01', trust: 0.65 },
    { id: 'boston', value: { name: 'Port of Boston (Conley Terminal)', lat: 42.3390, lng: -71.0186, teu: 300000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Boston', as_of: '2024-06-01', trust: 0.65 },
    { id: 'wilmington_nc', value: { name: 'Port of Wilmington (NC)', lat: 34.2257, lng: -77.9447, teu: 400000 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Wilmington_(North_Carolina)', as_of: '2024-06-01', trust: 0.65 },
    { id: 'everett', value: { name: 'Port of Everett', lat: 47.9790, lng: -122.2280, teu: 0 }, source_url: 'https://en.wikipedia.org/wiki/Port_of_Everett', as_of: '2024-06-01', trust: 0.65 },
  ];

  const POOL = RAW.map((r) => {
    const cell = attest(r.value, { source: SOURCES.CANON, source_url: r.source_url, as_of: r.as_of, trust: r.trust });
    return { id: r.id, ...cell };
  });
  const POOL_BY_ID = {};
  for (const f of POOL) POOL_BY_ID[f.id] = f;

  return { POOL, POOL_BY_ID };
});
