// Cargo Line Tycoon — Phase 1 port canon (browser + Node dual-mode)
//
// This is a verbatim JS mirror of ../../locales/en/canon/ports.json (the real
// 10 US/CA ports canon), plus a fixed, documented flavor mapping of a primary
// export commodity per port. It exists as its own .js file (rather than being
// fetch()'d as .json) so the offline game works when opened directly from
// disk via file:// — no local server required, no bundler.
//
// SOURCE OF TRUTH: locales/en/canon/ports.json. If that file changes, mirror
// the change here by hand (small, deliberate, and reviewable — there are only
// 10 ports).
//
// The commodity assignment is a real-world-grounded simplification for game
// flavor, not fabricated canon: Houston (crude oil export/import hub),
// Savannah (major US auto-import terminal, Kia/Hyundai), Vancouver and New
// Orleans (major grain export corridors, prairie wheat / Mississippi corn &
// soy), Baltimore (top US auto-import port). The rest default to a generic
// consumer-goods mix ("electronics"/"apparel") reflecting their role as
// general container gateways. This is flavor + a light price-model input,
// not a claim about exact commodity mix.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CLT_PORTS = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  const PORTS = [
    { id: 'los_angeles', name: 'Port of Los Angeles', lat: 33.7395, lng: -118.2610, country: 'US', annual_teus: 9000000, notable: ['San Pedro Bay complex', 'LA-Long Beach combined'], tier: 1, commodity: 'electronics' },
    { id: 'long_beach', name: 'Port of Long Beach', lat: 33.7550, lng: -118.2160, country: 'US', annual_teus: 9000000, notable: ['2nd busiest US container port'], tier: 1, commodity: 'apparel' },
    { id: 'new_york', name: 'Port of New York and New Jersey', lat: 40.6699, lng: -74.0431, country: 'US', annual_teus: 7000000, notable: ['East coast gateway'], tier: 1, commodity: 'apparel' },
    { id: 'savannah', name: 'Port of Savannah', lat: 32.0809, lng: -81.0912, country: 'US', annual_teus: 5000000, notable: ['Largest single-terminal facility on East coast'], tier: 1, commodity: 'automobiles' },
    { id: 'houston', name: 'Port of Houston', lat: 29.7355, lng: -95.3018, country: 'US', annual_teus: 4000000, notable: ['Largest US port by tonnage'], tier: 1, commodity: 'crude_oil' },
    { id: 'vancouver', name: 'Port of Vancouver', lat: 49.2884, lng: -123.1152, country: 'CA', annual_teus: 3500000, notable: ['Largest Canadian port'], tier: 1, commodity: 'grain' },
    { id: 'miami', name: 'PortMiami', lat: 25.7785, lng: -80.1772, country: 'US', annual_teus: 1100000, notable: ['Cruise capital of the world'], tier: 1, commodity: 'electronics' },
    { id: 'seattle', name: 'Port of Seattle', lat: 47.5903, lng: -122.3343, country: 'US', annual_teus: 1900000, notable: ['Pacific Northwest gateway'], tier: 2, commodity: 'electronics' },
    { id: 'new_orleans', name: 'Port of New Orleans', lat: 29.9450, lng: -90.0668, country: 'US', annual_teus: 500000, notable: ['Mississippi River deepwater'], tier: 2, commodity: 'grain' },
    { id: 'baltimore', name: 'Port of Baltimore', lat: 39.2672, lng: -76.5779, country: 'US', annual_teus: 1100000, notable: ['Roll-on/roll-off cars'], tier: 2, commodity: 'automobiles' },
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
  // Cape Horn, which no operator actually chooses commercially). This is the
  // ONE live chokepoint for the Phase 1 toy: real, grounded, and it visibly
  // changes optimal routing when disrupted (see game/src/economy.js).
  const WEST_COAST = ['los_angeles', 'long_beach', 'seattle', 'vancouver'];
  const EAST_GULF_COAST = ['new_york', 'savannah', 'houston', 'new_orleans', 'miami', 'baltimore'];

  const PORTS_BY_ID = {};
  for (const p of PORTS) PORTS_BY_ID[p.id] = p;

  return { PORTS, PORTS_BY_ID, VESSEL_TYPES, WEST_COAST, EAST_GULF_COAST };
});
