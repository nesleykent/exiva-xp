/**
 * Imbuement resource-acquisition catalogue and pure calculation engine.
 * DOM-free and Node-safe — the UI never computes a price itself, it only
 * renders what this module returns.
 *
 * Data provenance: Vampirism, Void, Strike and Featherweight quantities are
 * cross-confirmed (Featherweight against the owner's own in-game screenshot;
 * the other three against multiple independent guides) and marked
 * `verified: true`. Every other imbuement's item list comes from a single
 * third-party guide (TibiaVault, 2026) with no in-game confirmation yet —
 * they carry `verified: false` and the UI must show that plainly. Never
 * silently upgrade an entry to verified without a second source or the
 * owner's own confirmation.
 */

export const GOLD_TOKEN_ITEM = 'gold-token';

const TOKEN_COST = { basic: 2, intricate: 4, powerful: 6 };
const TOKEN_HYBRID_SOURCE = { intricate: 'basic', powerful: ['intricate', 'basic'] };
const TIER_ORDER = ['basic', 'intricate', 'powerful'];

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

  imbuement('strike', 'Strike', 'Critical Damage', 'critical', true, true,
    [item('protective-charm', 'Protective Charm', 20)],
    [item('sabretooth', 'Sabretooth', 25)],
    [item('vexclaw-talon', 'Vexclaw Talon', 5)],
    { basic: '+15% Critical Damage', intricate: '+25% Critical Damage', powerful: '+50% Critical Damage' }),

  imbuement('swiftness', 'Swiftness', 'Speed Boost', 'utility', false, false,
    [item('damselfly-wing', 'Damselfly Wing', 15)],
    [item('compass', 'Compass', 25)],
    [item('waspoid-wing', 'Waspoid Wing', 5)]),

  imbuement('featherweight', 'Featherweight', 'Capacity Increase', 'utility', false, true,
    [item('fairy-wings', 'Fairy Wings', 20)],
    [item('little-bowl-of-myrrh', 'Little Bowl of Myrrh', 10)],
    [item('goosebump-leather', 'Goosebump Leather', 5)],
    { basic: '+3% total capacity', intricate: '+8% total capacity', powerful: '+15% total capacity' }),

  imbuement('vibrancy', 'Vibrancy', 'Paralysis Removal', 'utility', false, false,
    [item('wereboar-hooves', 'Wereboar Hooves', 20)],
    [item('crystallized-anger', 'Crystallized Anger', 15)],
    [item('swamp-plant', 'Swamp Plant', 5)]),

  imbuement('lich-shroud', 'Lich Shroud', 'Death Protection', 'protection', false, false,
    [item('flask-of-embalming-fluid', 'Flask of Embalming Fluid', 25)],
    [item('gloom-wolf-fur', 'Gloom Wolf Fur', 20)],
    [item('mystical-hourglass', 'Mystical Hourglass', 5)]),

  imbuement('snake-skin', 'Snake Skin', 'Earth Protection', 'protection', false, false,
    [item('piece-of-swampling-wood', 'Piece of Swampling Wood', 25)],
    [item('snake-skin-item', 'Snake Skin', 20)],
    [item('brimstone-shell', 'Brimstone Shell', 5)]),

  imbuement('dragon-hide', 'Dragon Hide', 'Fire Protection', 'protection', false, false,
    [item('green-dragon-scale', 'Green Dragon Scale', 10)],
    [item('wyvern-talisman', 'Wyvern Talisman', 5)],
    [item('warmasters-wristguards', "Warmaster's Wristguards", 5)]),

  imbuement('quara-scale', 'Quara Scale', 'Ice Protection', 'protection', false, false,
    [item('quara-bone', 'Quara Bone', 25)],
    [item('quara-eye', 'Quara Eye', 5)],
    [item('frozen-heart', 'Frozen Heart', 5)]),

  imbuement('cloud-fabric', 'Cloud Fabric', 'Energy Protection', 'protection', false, false,
    [item('wyvern-talisman', 'Wyvern Talisman', 20)],
    [item('peacock-feather-fan', 'Peacock Feather Fan', 10)],
    [item('energy-vein', 'Energy Vein', 5)]),

  imbuement('demon-presence', 'Demon Presence', 'Holy Protection', 'protection', false, false,
    [item('flask-of-demonic-blood', 'Flask of Demonic Blood', 25)],
    [item('cultish-robe', 'Cultish Robe', 15)],
    [item('concentrated-demonic-blood', 'Concentrated Demonic Blood', 5)]),

  imbuement('precision', 'Precision', 'Distance Fighting', 'skill', false, false,
    [item('elven-scouting-glass', 'Elven Scouting Glass', 25)],
    [item('compass', 'Compass', 20)],
    [item('soul-orb', 'Soul Orb', 5)]),

  imbuement('epiphany', 'Epiphany', 'Magic Level', 'skill', false, false,
    [item('strand-of-medusa-hair', 'Strand of Medusa Hair', 25)],
    [item('gloom-wolf-fur', 'Gloom Wolf Fur', 15)],
    [item('concentrated-demonic-blood', 'Concentrated Demonic Blood', 5)]),

  imbuement('scorch', 'Scorch', 'Fire Damage', 'damage', false, false,
    [item('fiery-heart', 'Fiery Heart', 25)],
    [item('green-dragon-scale', 'Green Dragon Scale', 5)],
    [item('piece-of-hellfire-armor', 'Piece of Hellfire Armor', 5)]),

  imbuement('venom', 'Venom', 'Earth Damage', 'damage', false, false,
    [item('swamp-grass', 'Swamp Grass', 25)],
    [item('gruesome-fan', 'Gruesome Fan', 5)],
    [item('slime-heart', 'Slime Heart', 5)]),

  imbuement('frost', 'Frost', 'Ice Damage', 'damage', false, false,
    [item('frosty-heart', 'Frosty Heart', 25)],
    [item('seacrest-hair', 'Seacrest Hair', 5)],
    [item('polar-bear-paw', 'Polar Bear Paw', 5)]),

  imbuement('electrify', 'Electrify', 'Energy Damage', 'damage', false, false,
    [item('rorc-feather', 'Rorc Feather', 25)],
    [item('peacock-feather-fan', 'Peacock Feather Fan', 5)],
    [item('energy-vein', 'Energy Vein', 5)]),

  imbuement('reap', 'Reap', 'Death Damage', 'damage', false, false,
    [item('pile-of-grave-earth', 'Pile of Grave Earth', 25)],
    [item('unholy-bone', 'Unholy Bone', 25)],
    [item('piece-of-dead-brain', 'Piece of Dead Brain', 5)]),

  imbuement('chop', 'Chop', 'Axe Fighting', 'skill', false, false,
    [item('piece-of-scarab-shell', 'Piece of Scarab Shell', 25)],
    [item('brimstone-fangs', 'Brimstone Fangs', 25)],
    [item('piece-of-royal-steel', 'Piece of Royal Steel', 5)]),

  imbuement('slash', 'Slash', 'Sword Fighting', 'skill', false, false,
    [item('lions-mane', "Lion's Mane", 25)],
    [item('moohtar-shell', "Mooh'tar Shell", 25)],
    [item('war-crystal', 'War Crystal', 5)]),

  imbuement('bash', 'Bash', 'Club Fighting', 'skill', false, false,
    [item('cyclops-toe', 'Cyclops Toe', 20)],
    [item('ogre-nose-ring', 'Ogre Nose Ring', 15)],
    [item('warmasters-wristguards', "Warmaster's Wristguards", 5)]),

  imbuement('blockade', 'Blockade', 'Shielding', 'skill', false, false,
    [item('piece-of-scarab-shell', 'Piece of Scarab Shell', 20)],
    [item('brimstone-shell', 'Brimstone Shell', 25)],
    [item('piece-of-royal-steel', 'Piece of Royal Steel', 5)]),
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
    total: market.total,
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
      total: tok.missing ? null : tok.subtotal,
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
      const total = tok.missing || remainingPricing.total == null ? null : tok.subtotal + remainingPricing.total;
      options.push({
        method: 'hybrid',
        label: `Hybrid from ${imbuement.tiers[coveredTierId].name}`,
        hybridFrom: coveredTierId,
        items: remainingPricing.lines,
        tokenQuantity: coveredTokenCost,
        tokenLine: tok,
        total,
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
  lines.push(`Total: ${Math.round(option.total).toLocaleString('en-US')} gp`);
  return lines.join('\n');
}
