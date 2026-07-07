/**
 * Imbuement resource-acquisition catalogue and pure calculation engine.
 * DOM-free and Node-safe — the UI never computes a price itself, it only
 * renders what this module returns.
 *
 * Data provenance: every item, quantity and per-tier bonus is read directly
 * from each tier's own TibiaWiki page ("Basic/Intricate/Powerful <Name>"),
 * via its `{{Infobox Imbuement}}` `astralsources`/`effect` fields fetched
 * 2026-07-06 — the wiki's own primary data, not a third-party guide. All
 * entries are `verified: true`. An earlier pass sourced ~18 of these from a
 * single web guide (TibiaVault) and got several wrong (e.g. Dragon Hide's
 * items were entirely different, Vibrancy's third item wasn't "Swamp
 * Plant" but "Quill") — corrected here against the wiki's own template
 * data. If TibiaWiki itself is ever wrong, fix it here with a fresh fetch,
 * never by guessing.
 */

export const GOLD_TOKEN_ITEM = 'gold-token';

const TOKEN_COST = { basic: 2, intricate: 4, powerful: 6 };
const TOKEN_HYBRID_SOURCE = { intricate: 'basic', powerful: ['intricate', 'basic'] };
const TIER_ORDER = ['basic', 'intricate', 'powerful'];
// Summer Update 2025 removed success-rate boosting; these are the current fixed shrine costs.
export const IMBUING_FEES = { basic: 7500, intricate: 60000, powerful: 250000 };

/** Builds a tier's cumulative item list from a per-step item table. */
function tier(name, bonus, steps, tokenCost) {
  const items = [];
  for (const step of steps) {
    for (const item of step) {
      const existing = items.find((i) => i.itemId === item.itemId);
      if (existing) existing.quantity += item.quantity;
      else items.push({ ...item });
    }
  }
  return { name, bonus, items, tokenCost };
}

function item(itemId, name, quantity) {
  return { itemId, name, quantity };
}

function imbuement(id, name, effect, category, supportsGoldTokenExchange, verified, basicItems, intricateItems, powerfulItems, bonuses = {}) {
  return {
    id,
    name,
    effect,
    category,
    supportsGoldTokenExchange,
    verified,
    tiers: {
      basic: tier('Basic', bonuses.basic || null, [basicItems], supportsGoldTokenExchange ? TOKEN_COST.basic : null),
      intricate: tier('Intricate', bonuses.intricate || null, [basicItems, intricateItems], supportsGoldTokenExchange ? TOKEN_COST.intricate : null),
      powerful: tier('Powerful', bonuses.powerful || null, [basicItems, intricateItems, powerfulItems], supportsGoldTokenExchange ? TOKEN_COST.powerful : null),
    },
  };
}

export const IMBUEMENTS = [
  imbuement('vampirism', 'Vampirism', 'Life Leech', 'leech', true, true,
    [item('vampire-teeth', 'Vampire Teeth', 25)],
    [item('bloody-pincers', 'Bloody Pincers', 15)],
    [item('piece-of-dead-brain', 'Piece of Dead Brain', 5)],
    { basic: '+5% Life Leech', intricate: '+10% Life Leech', powerful: '+25% Life Leech' }),

  imbuement('void', 'Void', 'Mana Leech', 'leech', true, true,
    [item('rope-belt', 'Rope Belt', 25)],
    [item('silencer-claws', 'Silencer Claws', 25)],
    [item('grimeleech-wings', 'Some Grimeleech Wings', 5)],
    { basic: '+3% Mana Leech', intricate: '+5% Mana Leech', powerful: '+8% Mana Leech' }),

  imbuement('strike', 'Strike', 'Critical Hit Damage', 'critical', true, true,
    [item('protective-charm', 'Protective Charm', 20)],
    [item('sabretooth', 'Sabretooth', 25)],
    [item('vexclaw-talon', 'Vexclaw Talon', 5)],
    { basic: '+5% damage (5% chance)', intricate: '+15% damage (5% chance)', powerful: '+40% damage (5% chance)' }),

  imbuement('swiftness', 'Swiftness', 'Speed Boost', 'utility', false, true,
    [item('damselfly-wing', 'Damselfly Wing', 15)],
    [item('compass', 'Compass', 25)],
    [item('waspoid-wing', 'Waspoid Wing', 20)],
    { basic: '+10 speed', intricate: '+15 speed', powerful: '+30 speed' }),

  imbuement('featherweight', 'Featherweight', 'Capacity Increase', 'utility', false, true,
    [item('fairy-wings', 'Fairy Wings', 20)],
    [item('little-bowl-of-myrrh', 'Little Bowl of Myrrh', 10)],
    [item('goosebump-leather', 'Goosebump Leather', 5)],
    { basic: '+3% total capacity', intricate: '+8% total capacity', powerful: '+15% total capacity' }),

  imbuement('vibrancy', 'Vibrancy', 'Paralysis Deflection', 'utility', false, true,
    [item('wereboar-hooves', 'Wereboar Hooves', 20)],
    [item('crystallized-anger', 'Crystallized Anger', 15)],
    [item('quill', 'Quill', 5)],
    { basic: '15% deflect chance', intricate: '25% deflect chance', powerful: '50% deflect chance' }),

  imbuement('lich-shroud', 'Lich Shroud', 'Death Protection', 'protection', false, true,
    [item('flask-of-embalming-fluid', 'Flask of Embalming Fluid', 25)],
    [item('gloom-wolf-fur', 'Gloom Wolf Fur', 20)],
    [item('mystical-hourglass', 'Mystical Hourglass', 5)],
    { basic: '+2% Death Protection', intricate: '+5% Death Protection', powerful: '+10% Death Protection' }),

  imbuement('snake-skin', 'Snake Skin', 'Earth Protection', 'protection', false, true,
    [item('piece-of-swampling-wood', 'Piece of Swampling Wood', 25)],
    [item('snake-skin-item', 'Snake Skin', 20)],
    [item('brimstone-fangs', 'Brimstone Fangs', 10)],
    { basic: '+3% Earth Protection', intricate: '+8% Earth Protection', powerful: '+15% Earth Protection' }),

  imbuement('dragon-hide', 'Dragon Hide', 'Fire Protection', 'protection', false, true,
    [item('green-dragon-leather', 'Green Dragon Leather', 20)],
    [item('blazing-bone', 'Blazing Bone', 10)],
    [item('draken-sulphur', 'Draken Sulphur', 5)],
    { basic: '+3% Fire Protection', intricate: '+8% Fire Protection', powerful: '+15% Fire Protection' }),

  imbuement('quara-scale', 'Quara Scale', 'Ice Protection', 'protection', false, true,
    [item('winter-wolf-fur', 'Winter Wolf Fur', 25)],
    [item('thick-fur', 'Thick Fur', 15)],
    [item('deepling-warts', 'Deepling Warts', 10)],
    { basic: '+3% Ice Protection', intricate: '+8% Ice Protection', powerful: '+15% Ice Protection' }),

  imbuement('cloud-fabric', 'Cloud Fabric', 'Energy Protection', 'protection', false, true,
    [item('wyvern-talisman', 'Wyvern Talisman', 20)],
    [item('crawler-head-plating', 'Crawler Head Plating', 15)],
    [item('wyrm-scale', 'Wyrm Scale', 10)],
    { basic: '+3% Energy Protection', intricate: '+8% Energy Protection', powerful: '+15% Energy Protection' }),

  imbuement('demon-presence', 'Demon Presence', 'Holy Protection', 'protection', false, true,
    [item('cultish-robe', 'Cultish Robe', 25)],
    [item('cultish-mask', 'Cultish Mask', 25)],
    [item('hellspawn-tail', 'Hellspawn Tail', 20)],
    { basic: '+3% Holy Protection', intricate: '+8% Holy Protection', powerful: '+15% Holy Protection' }),

  imbuement('precision', 'Precision', 'Distance Fighting', 'skill', false, true,
    [item('elven-scouting-glass', 'Elven Scouting Glass', 25)],
    [item('elven-hoof', 'Elven Hoof', 20)],
    [item('metal-spike', 'Metal Spike', 10)],
    { basic: '+1 Distance Fighting', intricate: '+2 Distance Fighting', powerful: '+4 Distance Fighting' }),

  imbuement('epiphany', 'Epiphany', 'Magic Level', 'skill', false, true,
    [item('elvish-talisman', 'Elvish Talisman', 25)],
    [item('broken-shamanic-staff', 'Broken Shamanic Staff', 15)],
    [item('strand-of-medusa-hair', 'Strand of Medusa Hair', 15)],
    { basic: '+1 Magic Level', intricate: '+2 Magic Level', powerful: '+4 Magic Level' }),

  imbuement('scorch', 'Scorch', 'Fire Damage', 'damage', false, true,
    [item('fiery-heart', 'Fiery Heart', 25)],
    [item('green-dragon-scale', 'Green Dragon Scale', 5)],
    [item('demon-horn', 'Demon Horn', 5)],
    { basic: '+10% Fire Damage', intricate: '+25% Fire Damage', powerful: '+50% Fire Damage' }),

  imbuement('venom', 'Venom', 'Earth Damage', 'damage', false, true,
    [item('swamp-grass', 'Swamp Grass', 25)],
    [item('poisonous-slime', 'Poisonous Slime', 20)],
    [item('slime-heart', 'Slime Heart', 2)],
    { basic: '+10% Earth Damage', intricate: '+25% Earth Damage', powerful: '+50% Earth Damage' }),

  imbuement('frost', 'Frost', 'Ice Damage', 'damage', false, true,
    [item('frosty-heart', 'Frosty Heart', 25)],
    [item('seacrest-hair', 'Seacrest Hair', 10)],
    [item('polar-bear-paw', 'Polar Bear Paw', 5)],
    { basic: '+10% Ice Damage', intricate: '+25% Ice Damage', powerful: '+50% Ice Damage' }),

  imbuement('electrify', 'Electrify', 'Energy Damage', 'damage', false, true,
    [item('rorc-feather', 'Rorc Feather', 25)],
    [item('peacock-feather-fan', 'Peacock Feather Fan', 5)],
    [item('energy-vein', 'Energy Vein', 1)],
    { basic: '+10% Energy Damage', intricate: '+25% Energy Damage', powerful: '+50% Energy Damage' }),

  imbuement('reap', 'Reap', 'Death Damage', 'damage', false, true,
    [item('pile-of-grave-earth', 'Pile of Grave Earth', 25)],
    [item('demonic-skeletal-hand', 'Demonic Skeletal Hand', 20)],
    [item('petrified-scream', 'Petrified Scream', 5)],
    { basic: '+10% Death Damage', intricate: '+25% Death Damage', powerful: '+50% Death Damage' }),

  imbuement('chop', 'Chop', 'Axe Fighting', 'skill', false, true,
    [item('orc-tooth', 'Orc Tooth', 20)],
    [item('battle-stone', 'Battle Stone', 25)],
    [item('moohtant-horn', 'Moohtant Horn', 20)],
    { basic: '+1 Axe Fighting', intricate: '+2 Axe Fighting', powerful: '+4 Axe Fighting' }),

  imbuement('slash', 'Slash', 'Sword Fighting', 'skill', false, true,
    [item('lions-mane', "Lion's Mane", 25)],
    [item('moohtah-shell', "Mooh'tah Shell", 25)],
    [item('war-crystal', 'War Crystal', 5)],
    { basic: '+1 Sword Fighting', intricate: '+2 Sword Fighting', powerful: '+4 Sword Fighting' }),

  imbuement('bash', 'Bash', 'Club Fighting', 'skill', false, true,
    [item('cyclops-toe', 'Cyclops Toe', 20)],
    [item('ogre-nose-ring', 'Ogre Nose Ring', 15)],
    [item('warmasters-wristguards', "Warmaster's Wristguards", 10)],
    { basic: '+1 Club Fighting', intricate: '+2 Club Fighting', powerful: '+4 Club Fighting' }),

  imbuement('blockade', 'Blockade', 'Shielding', 'skill', false, true,
    [item('piece-of-scarab-shell', 'Piece of Scarab Shell', 20)],
    [item('brimstone-shell', 'Brimstone Shell', 25)],
    [item('frazzle-skin', 'Frazzle Skin', 25)],
    { basic: '+1 Shielding', intricate: '+2 Shielding', powerful: '+4 Shielding' }),
];

/** Screenshot-matched default order: leech/critical, utility, protection, skill (distance/magic), damage, skill (melee/shield). */
const DEFAULT_ORDER = [
  'vampirism', 'void', 'strike', 'swiftness', 'featherweight', 'vibrancy',
  'lich-shroud', 'snake-skin', 'dragon-hide', 'quara-scale', 'cloud-fabric', 'demon-presence',
  'precision', 'epiphany',
  'scorch', 'venom', 'frost', 'electrify', 'reap',
  'chop', 'slash', 'bash', 'blockade',
];

export function sortImbuements(list, mode = 'default') {
  if (mode === 'alphabetical') return [...list].sort((a, b) => a.name.localeCompare(b.name));
  return [...list].sort((a, b) => DEFAULT_ORDER.indexOf(a.id) - DEFAULT_ORDER.indexOf(b.id));
}

export function imbuementById(id) {
  return IMBUEMENTS.find((i) => i.id === id) || null;
}

export function allItemIds() {
  const ids = new Set([GOLD_TOKEN_ITEM]);
  for (const imb of IMBUEMENTS) {
    for (const t of Object.values(imb.tiers)) {
      for (const it of t.items) ids.add(it.itemId);
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------- pricing

/** A price is "missing" if absent, non-finite, or zero without explicit confirmation. */
function resolvePrice(prices, itemId) {
  const entry = prices?.[itemId];
  if (entry == null) return { price: null, missing: true };
  const price = typeof entry === 'number' ? entry : entry.price;
  if (!Number.isFinite(price)) return { price: null, missing: true };
  if (price === 0 && !(entry && entry.confirmedZero)) return { price: null, missing: true };
  return { price, missing: false };
}

function itemLines(items, prices) {
  const missingItems = [];
  const lines = items.map((it) => {
    const { price, missing } = resolvePrice(prices, it.itemId);
    if (missing) missingItems.push(it.name);
    return {
      itemId: it.itemId,
      name: it.name,
      quantity: it.quantity,
      unitPrice: price,
      subtotal: price == null ? null : it.quantity * price,
    };
  });
  const total = missingItems.length ? null : lines.reduce((sum, l) => sum + l.subtotal, 0);
  return { lines, total, missingItems };
}

function tokenLine(tokenQuantity, prices) {
  const { price, missing } = resolvePrice(prices, GOLD_TOKEN_ITEM);
  return {
    itemId: GOLD_TOKEN_ITEM,
    name: 'Gold Token',
    quantity: tokenQuantity,
    unitPrice: price,
    subtotal: missing ? null : tokenQuantity * price,
    missing,
  };
}

function optionTotal(resourceTotal, tierId) {
  return resourceTotal == null ? null : resourceTotal + IMBUING_FEES[tierId];
}

/** Items still owed after `coveredTierId`'s package is bought via tokens. */
function remainderItems(tierId, coveredTierId) {
  const order = TIER_ORDER.slice(0, TIER_ORDER.indexOf(tierId) + 1);
  const coveredIndex = TIER_ORDER.indexOf(coveredTierId);
  return order.slice(coveredIndex + 1);
}

/**
 * All valid acquisition options for one imbuement tier, priced against the
 * given world's manual price map. Returns market-only, token-only (if
 * supported) and every non-double-counting hybrid split.
 */
export function getAcquisitionOptions(imbuement, tierId, prices) {
  const t = imbuement.tiers[tierId];
  const options = [];

  const market = itemLines(t.items, prices);
  options.push({
    method: 'market',
    label: 'Market only',
    items: market.lines,
    tokenQuantity: 0,
    resourceTotal: market.total,
    fee: IMBUING_FEES[tierId],
    total: optionTotal(market.total, tierId),
    missingItems: market.missingItems,
  });

  if (imbuement.supportsGoldTokenExchange) {
    const tok = tokenLine(t.tokenCost, prices);
    options.push({
      method: 'tokens',
      label: `${t.tokenCost} Gold Tokens`,
      items: [],
      tokenQuantity: t.tokenCost,
      tokenLine: tok,
      resourceTotal: tok.missing ? null : tok.subtotal,
      fee: IMBUING_FEES[tierId],
      total: optionTotal(tok.missing ? null : tok.subtotal, tierId),
      missingItems: tok.missing ? ['Gold Token'] : [],
    });

    const hybridSources = TOKEN_HYBRID_SOURCE[tierId];
    const sources = Array.isArray(hybridSources) ? hybridSources : hybridSources ? [hybridSources] : [];
    for (const coveredTierId of sources) {
      const coveredTokenCost = imbuement.tiers[coveredTierId].tokenCost;
      const remaining = remainderItems(tierId, coveredTierId).flatMap((rid) => {
        // The remaining items for a step are only what that tier ADDS beyond the previous one.
        const prevIndex = TIER_ORDER.indexOf(rid) - 1;
        const prevTierId = TIER_ORDER[prevIndex];
        const prevIds = new Set((prevTierId ? imbuement.tiers[prevTierId].items : []).map((i) => i.itemId));
        return imbuement.tiers[rid].items.filter((i) => !prevIds.has(i.itemId));
      });
      const remainingPricing = itemLines(remaining, prices);
      const tok = tokenLine(coveredTokenCost, prices);
      const resourceTotal = tok.missing || remainingPricing.total == null ? null : tok.subtotal + remainingPricing.total;
      options.push({
        method: 'hybrid',
        label: `Hybrid from ${imbuement.tiers[coveredTierId].name}`,
        hybridFrom: coveredTierId,
        items: remainingPricing.lines,
        tokenQuantity: coveredTokenCost,
        tokenLine: tok,
        resourceTotal,
        fee: IMBUING_FEES[tierId],
        total: optionTotal(resourceTotal, tierId),
        missingItems: [...(tok.missing ? ['Gold Token'] : []), ...remainingPricing.missingItems],
      });
    }
  }

  return options;
}

export function selectCheapestOption(options) {
  const complete = options.filter((o) => o.total != null);
  if (!complete.length) return null;
  return complete.reduce((best, o) => (o.total < best.total ? o : best));
}

/**
 * Full breakdown for one imbuement tier: every option, the cheapest complete
 * one, savings against every alternative, and which prices are missing.
 */
export function calculateTier(imbuement, tierId, prices) {
  const options = getAcquisitionOptions(imbuement, tierId, prices);
  const cheapest = selectCheapestOption(options);
  const missingPrices = [...new Set(options.flatMap((o) => o.missingItems))];
  const savings = cheapest
    ? options
      .filter((o) => o !== cheapest && o.total != null)
      .map((o) => ({ against: o.label, amount: o.total - cheapest.total }))
    : [];
  return {
    tierId,
    tier: imbuement.tiers[tierId],
    options,
    cheapest,
    canCalculate: cheapest != null,
    missingPrices,
    savings,
  };
}

export function calculateImbuement(imbuement, prices) {
  return Object.fromEntries(TIER_ORDER.map((tierId) => [tierId, calculateTier(imbuement, tierId, prices)]));
}

/** Plain-text shopping list for the copy button — pure string building, no DOM/clipboard access here. */
export function formatShoppingList(imbuementName, tierName, world, option) {
  const lines = [`${tierName} ${imbuementName} on ${world}`, 'Recommended method:'];
  if (option.tokenQuantity) lines.push(`${option.tokenQuantity} Gold Token${option.tokenQuantity === 1 ? '' : 's'}`);
  for (const it of option.items) lines.push(`${it.quantity} ${it.name}`);
  lines.push(`Imbuing fee: ${Math.round(option.fee).toLocaleString('en-US')} gp`);
  lines.push(`Total: ${Math.round(option.total).toLocaleString('en-US')} gp`);
  return lines.join('\n');
}
