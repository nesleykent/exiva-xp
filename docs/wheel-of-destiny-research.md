# Wheel of Destiny research digest for Night'Flyn

Scope: level 467 Elder Druid. Sources read: `wheel-Wheel_of_Destiny.wikitext`, `wheel-Dedication_Perks.wikitext`, `wheel-Conviction_Perks.wikitext`, and `wheel-Revelation_Perks.wikitext`. Existing calculator model read: `assets/js/engine/planning.js` uses `rawAvg * resistanceFactor * mitigationFactor * critFactor * fatalFactor` plus expected charm damage; it does not derive spell rolls from level or magic level.

## 1. Outgoing damage perks

### Elder Druid / generic availability

- Increased Damage and Healing, Revelation, all vocations. Numeric effect: stage 1/2/3 values are `4`, `9`, `20`; the unit is not in source. Druid availability: yes, all vocations. At level 467, base points allow at most a 250-point stage 1 domain unless optional extra points are present; exact build allocation is not in source.
  - Source quotes: `Each stage of each revelation perk unlocks a bonus to all damage and healing done through spells, runes, or attacks.` and `| Damage and healing increase || 4 || 9 || 20`

- Vessel Resonance / matching socketed gem, generic Conviction/Gem Atelier. Numeric effect: `+1 damage/healing` for lesser or regular gem matches; `+2 damage/healing` for greater gem matches. Druid availability: yes, generic Wheel/Gem mechanic. Unit and damage formula are not in source.
  - Source quotes: `* lesser gem and one vessel: +1 damage/healing`, `* regular gem and two vessels: +1 damage/healing`, `* greater gem and three vessels: +2 damage/healing`, and `Bonus is increased to +2 in case of a [[Greater Gem]].`

- Weapon, Distance, Magic Skill Boosts, generic Conviction. Numeric effect: not in source. Druid availability: yes as a generic perk, but exact Elder Druid magic-skill value is not in source.
  - Source quote: `'''Weapon, Distance, Magic Skill Boosts''': Grants a boost to the main offensive skill of your vocation`

- Terra Wave augmentation, Elder Druid Conviction. Numeric effect: stage 1 `+6.5% Base Damage`; stage 2 adds `10% life leech` to the spell, not outgoing damage. Druid availability: yes, Elder Druid.
  - Source quote: `| [[File:Augmented Terra Wave Icon.gif|left]] [[Terra Wave]] || +6.5% Base Damage || Adds 10% life leech to this spell`

- Strong Ice Wave augmentation, Elder Druid Conviction. Numeric effect: stage 1 `+6% Base Damage`; stage 2 area increased, no numeric damage. Druid availability: yes, Elder Druid.
  - Source quote: `| [[File:Augmented Strong Ice Wave Icon.gif|left]] [[Strong Ice Wave]] || +6% Base Damage || Area increased`

- Forked Spells augmentation, Elder Druid Conviction. Numeric effect: stage 1 `-2s cooldown`; stage 2 `Adds +1 target`. Druid availability: yes, Elder Druid. This changes cadence/target count, not per-hit damage.
  - Source quote: `| <!--[[File:Augmented Forked Spells Icon.gif|left]]--> [[Forked Spells]] || -2s cooldown || Adds +1 target`

- Runic Mastery, Mages. Numeric effect: `25% chance`; magic level increase is `10%`, or `20%` for a rune the vocation can create; applies to base magic level. Druid availability: yes, the source explicitly names elder druids using Avalanche Rune. Per-damage multiplier is not in source.
  - Source quote: `If you use a [[rune]], you have a 25% chance of increasing your magic level by 10%, or by 20% if you use a rune your vocation can create, for that specific rune effect.`

- Twin Bursts, Elder Druid Revelation. Numeric effect: not in source. Element/damage type: ice or earth damage. Druid availability: yes, Elder Druid.
  - Source quote: `Casts [[Ice Burst|ice]] or [[Terra Burst|earth damage]] in a ring area around you.`

### Outgoing damage effects in source but not available to Elder Druid

- Elite Knight only: Combat Mastery has `1% increased damage per 12/10/8% missing [[HP]]`, doubled with a two-handed weapon. Augmentations include Fierce Berserk `+10% Base Damage`, Groundshaker `+12.5% Base Damage`, and Front Sweep `+40% Base Power` / `+2 sqms hit`. Druid availability: no.

- Royal Paladin only: Ballistic Mastery has `critical extra damage ... increased by 10%` with crossbow and `+4% physical and holy pierce` with bow. Augmentations include Divine Caldera `+8.5% Base Damage`, Divine Barrage `+10% Base Damage` / `+15% Base Damage`, Strong Ethereal Spear `+380% Base Damage`, and Ethereal Barrage `+10% Critical Chance`. Druid availability: no.

- Master Sorcerer only: Focus Mastery empowers the next damaging spell by `35%`. Beam Mastery gives beam-spell damage increases of `10% (30% max.)`, `12% (36% max.)`, `14% (42% max.)` and adjacent-square damage of `40%`, `60%`, `80%`. Lord of Destruction gives fire-spell base power `2%/3%/4%`, energy-spell critical hit chance `2%/3%/4%`, and death-spell critical extra damage `45%/52.5%/60%`. Augmentations include Great Fire Wave `10%` critical hit chance and `+15%` critical extra damage / `+5% Base Damage`, Energy Wave `+10% Base Damage`, Sap Strength `+8% base damage`, Special Spells `+50% base damage`, and Focus Spells `+5% Base Damage`. Druid availability: no.

- Exalted Monk only: Sanctuary increases damage/healing by `2% for each Harmony consumed` and adjacent enemy damage by `10%`. Ascetic increases Harmony base bonus by `1%/2%/3%` and auto attacks deal `100%/200%/300%` of mantra. Augmentations include Flurry of Blows `+15% base damage`, Mystic Repulse `+40% base damage`, Thousand Fist Blows `+40% critical extra damage`, and Chained Penance `+18% base damage`. Druid availability: no.

## 2. Mitigation / defence / sustain perks with numbers

- Mitigation Dedication, all vocations. Numeric effect: `0.075%` per promotion point, multiplicative. Druid availability: yes, generic Dedication.
  - Source quote: `'''Mitigation''': Multiplicatively increases your [[mitigation]] by 0.075% for each promotion point spent.`

- Generic elemental resistances, all vocations. Numeric effects: fire `2%`, energy `2%`, ice `2%`, earth `2%`, holy `1%`, death `1%`. Druid availability: yes, generic Conviction.
  - Source quotes: `'''Resistance to Fire''': Grants 2% [[Fire|fire protection]]`, `'''Resistance to Energy''': Grants 2% [[Energy|energy protection]]`, `'''Resistance to Ice''': Grants 2% [[Ice|ice protection]]`, `'''Resistance to Earth''': Grants 2% [[Earth|earth protection]]`, and `'''Resistance to Holy and Death''': Grants 1% [[Holy|holy]] and 1% [[Death Damage|death protection]]`

- Generic leech Convictions, all vocations. Numeric effects: `0.25%` mana leech, `0.75%` life leech. Druid availability: yes, generic Conviction.
  - Source quotes: `'''Mana Leech''': Grants 0.25% [[Imbuing#Mana Leech|mana leech]]` and `'''Life Leech''': Grants 0.75% [[Imbuing#Life Leech|life leech]]`

- Dedication HP/Mana/Capacity, all vocations. Numeric values in source: HP `(3/2/1/1)`, Mana `(1/3/6/6)`, Capacity `(5/4/2/2)`. Exact Elder Druid HP/mana/cap result is not in source because the source says the amount is based on vocation level-up gains.
  - Source quote: `The amount is based on the amount of hit points your vocation gains when [[Level|leveling up]].`

- Healing Link, Elder Druid. Numeric effect: self-heal for `10%` of applied healing when healing someone with Nature's Embrace or Heal Friend. Druid availability: yes.
  - Source quote: `If you heal someone with [[Nature's Embrace]] or [[Heal Friend]], you also heal yourself for 10% of the applied healing.`

- Terra Wave augmentation, Elder Druid. Numeric sustain effect: stage 2 adds `10% life leech` to Terra Wave. Druid availability: yes.
  - Source quote: `Adds 10% life leech to this spell`

- Blessing of the Grove, Elder Druid Revelation. Numeric healing effects: target 30-60% HP gets `5%/7.5%/10%`; target below 30% HP gets `10%/15%/20%`. Critical healing uses critical hit chance and critical extra damage, but the source does not give separate numeric crit values here. Druid availability: yes.
  - Source quotes: `Healing spells can now [[Critical Heal|critically heal]], using critical hit chance and critical extra damage.`, `| Increased healing<br/>Target between 30 ~ 60% HP || 5% || 7.5% || 10%`, and `| Increased healing<br/>Target below 30% HP || 10% || 15% || 20%`

- Gift of Life, all vocations Revelation. Numeric effect: not in source. Druid availability: yes, all vocations.
  - Source quote: `Under certain circumstances, heals the player before taking otherwise [[Death|fatal damage]], giving them a second chance.`

- Gem mod example, generic Gem Atelier. Numeric defensive example: `+2% fire resistance` and `+300 hitpoints`; only first mod applies with one enabled Vessel Resonance in the example. Druid availability: yes, generic Gem Atelier. The source presents this as an example, not a full mod catalogue.
  - Source quote: `if a player has enabled only one Vessel Resonance in the Wheel, but socketed a [[Regular Gem]] with +2% fire resistance in its first mod slot, and +300 hitpoints on its second mod slot, they will only benefit from fire resistance bonus.`

- Non-druid defensive effects: Elite Knight Shield Slam has `+25% Damage Reduction (75% total)`, and Elite Knight Combat Mastery has `1% reduced damage taken per 12/10/8% missing [[HP]]`, doubled while wielding a shield. Druid availability: no.

## 3. Gem mods and damage interaction

- Gems provide no bonuses before reveal/socket mechanics.
  - Source quote: `A gem will provide no bonuses by itself`

- Revealed gem mod slots by size: Lesser has `one [[Basic Mod]] slot`; Regular has `two [[Basic Mod]] slots`; Greater has `two [[Basic Mod]] and one [[Supreme Mod]] slots`.
  - Source quote: `[[Lesser Gem]]s have one [[Basic Mod]] slot, [[Regular Gem]]s have two [[Basic Mod]] slots, and [[Greater Gem]]s have two [[Basic Mod]] and one [[Supreme Mod]] slots.`

- Mods require enough enabled Vessel Resonances in the same domain. If there are fewer resonances than slots, later mods do not apply.
  - Source quote: `If a Gem has more than one mod slot, then the players need to enable more Vessel Resonances on that Wheel domain for the other mods to apply.`

- Matching resonance count to slot count applies bonus damage/healing: lesser + one vessel gives `+1 damage/healing`; regular + two vessels gives `+1 damage/healing`; greater + three vessels gives `+2 damage/healing`.
  - Source quote: `Additionally, when the amount of Vessel Resonances enabled matches the amount of mod slots in a socketed gem, a bonus to damage and healing will be applied:`

- Mod grades: Grade IV gives `50% increase over their Grade I bonuses`, but a slot can only benefit from a grade as high as the previous slot's grade. Cooldown augmentation grades do not reduce cooldown further; they add a chance to gain Momentum, but that chance is not in source.
  - Source quote: `At Grade IV, they grant 50% increase over their Grade I bonuses.`

- Fully enhanced Grade IV mods grant permanent promotion points, and source states up to `69` extra points can be obtained via Basic/Supreme mod upgrades. Exact Night'Flyn claimed amount: not in source.
  - Source quotes: `for every mod fully enhanced to Grade IV, a character will receive an additional Promotion Point for their Wheel of Destiny.` and `* Up to 69 extra points can be obtained via upgrading [[Basic Mod|Basic]] and [[Supreme Mod]]s.`

## 4. Points available at level 467 and level thresholds

- Base points at level 467: `417` from level alone, derived from source rule `For every level after 50, a character will get 1 point` as `467 - 50 = 417`. The source also states `Starting with level 51, all [[Promotion|promoted characters]] on [[Premium account]]s gain 1 promotion point per level`.

- Optional extra points in source: up to `50` Promotion Scroll points, up to `10` Way of the Monk points, up to `50` Hunting Task Shop points, and up to `69` Basic/Supreme Mod upgrade points. Optional maximum from those sources is `179`; level 467 theoretical total if every optional source is claimed is `596`. Night'Flyn's actual claimed optional points: not in source.

- Wheel cap: `4,000` points.
  - Source quote: `The Wheel accommodates up to 4,000 points`

- Revelation point thresholds by domain: stages 1/2/3 unlock after spending `250`, `500`, and `1000` points in the respective domain.
  - Source quote: `with stages 1, 2, and 3 of the same perk being unlocked after spending 250, 500, and 1000 points, respectively.`

- Branch threshold: `575` points in a branch to reach one of the largest boons.
  - Source quote: `A character would have to spend 575 points in a branch to reach one of the largest boons.`

- Source milestone levels: `300`, `550`, `625`, `800`, `825`, `875`, `1050`, `1075`, `1125`, `1150`, `1200`, `1300`, `1325`, `1350`, `1400`, `1550`, `1575`, `1725`. For level 467, the source milestone already passed is `300` (`Unlock one Revelation Perk at stage 1.`); the next source milestone is `550` (`Unlock one Revelation Perk at stage 2.`), then `625` (`Access to the first outer slice Conviction Perk`).

## 5. Calculator-ready facts

Only facts below are numeric, unambiguous in the source, druid-available, and directly composable into the existing `effectiveDamage()` multiplier model if the user-entered raw min/max is the pre-Wheel base spell roll.

- Terra Wave augmentation stage 1: for Terra Wave only, `wheelSpellFactor = 1 + 6.5 / 100`, so `rawAvgAfterWheel = rawAvg * 1.065` before the existing resistance, mitigation, crit, and fatal factors.
  - Exact source quote: `[[Terra Wave]] || +6.5% Base Damage`

- Strong Ice Wave augmentation stage 1: for Strong Ice Wave only, `wheelSpellFactor = 1 + 6 / 100`, so `rawAvgAfterWheel = rawAvg * 1.06` before the existing resistance, mitigation, crit, and fatal factors.
  - Exact source quote: `[[Strong Ice Wave]] || +6% Base Damage`

### Ambiguous — needs owner/in-game verification

- Revelation Increased Damage and Healing: source gives `4`, `9`, `20` and says it applies to all damage/healing, but does not state whether those are percentage points, a flat bonus, or where in the damage pipeline they apply.
- Vessel Resonance / gem damage-healing bonus: source gives `+1` / `+2 damage/healing`, but does not state the unit or whether it is additive, multiplicative, pre-resistance, post-resistance, or UI "bonus" terminology.
- Runic Mastery: source gives a `25%` proc chance and `10%`/`20%` base magic level increase, but `effectiveDamage()` deliberately does not derive spell damage from magic level; the conversion from temporary magic level to rune damage is not in source.
- Weapon, Distance, Magic Skill Boosts: source says it boosts the main offensive skill, but numeric effect is not in source.
- Twin Bursts: source states ice/earth damage, but damage numbers and formulas are not in source.
- Forked Spells: source gives `-2s cooldown` and `+1 target`; useful for rotations/throughput, but not a single-hit multiplier for `effectiveDamage()`.
- Blessing of the Grove and Healing Link are numeric but healing-only in the provided source, not outgoing damage for `effectiveDamage()`.
- Level-467 exact unlocked Wheel state, optional extra promotion points, socketed gems, Gem grades, and actual enabled Vessel Resonances for Night'Flyn are not in source.
