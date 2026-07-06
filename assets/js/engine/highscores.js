/**
 * TibiaData highscore category descriptors shared by the tracker and pages.
 */

export const HIGHSCORE_CATEGORIES = [
  { category: 'achievements', valueField: 'achievements', rankField: 'achievementsRank', label: 'Achievements', kind: 'points' },
  { category: 'axefighting', valueField: 'axeFighting', rankField: 'axeFightingRank', label: 'Axe Fighting', kind: 'skill level' },
  { category: 'bosspoints', valueField: 'bossPoints', rankField: 'bossPointsRank', label: 'Boss Points', kind: 'points' },
  { category: 'bountypoints', valueField: 'bountyPoints', rankField: 'bountyPointsRank', label: 'Bounty Points earned', kind: 'points' },
  { category: 'charmpoints', valueField: 'charmPoints', rankField: 'charmPointsRank', label: 'Charm Points', kind: 'earned points' },
  { category: 'clubfighting', valueField: 'clubFighting', rankField: 'clubFightingRank', label: 'Club Fighting', kind: 'skill level' },
  { category: 'distancefighting', valueField: 'distanceFighting', rankField: 'distanceFightingRank', label: 'Distance Fighting', kind: 'skill level' },
  { category: 'dromescore', valueField: 'dromeScore', rankField: 'dromeScoreRank', label: 'Drome Score', kind: 'season score' },
  { category: 'experience', valueField: 'experience', rankField: 'rank', label: 'Experience Points', kind: 'total experience', primary: true },
  { category: 'fishing', valueField: 'fishing', rankField: 'fishingRank', label: 'Fishing', kind: 'skill level' },
  { category: 'fistfighting', valueField: 'fistFighting', rankField: 'fistFightingRank', label: 'Fist Fighting', kind: 'skill level' },
  { category: 'goshnarstaint', valueField: 'goshnarsTaint', rankField: 'goshnarsTaintRank', label: "Goshnar's Taint", kind: 'taint' },
  { category: 'loyaltypoints', valueField: 'loyaltyPoints', rankField: 'loyaltyPointsRank', label: 'Loyalty Points', kind: 'points' },
  { category: 'magiclevel', valueField: 'magicLevel', rankField: 'magicLevelRank', label: 'Magic Level', kind: 'skill level' },
  { category: 'shielding', valueField: 'shielding', rankField: 'shieldingRank', label: 'Shielding', kind: 'skill level' },
  { category: 'swordfighting', valueField: 'swordFighting', rankField: 'swordFightingRank', label: 'Sword Fighting', kind: 'skill level' },
  { category: 'weeklytasks', valueField: 'weeklyTasks', rankField: 'weeklyTasksRank', label: 'Weekly Tasks completed', kind: 'tasks' },
];

export const TRACKED_HIGHSCORE_CATEGORIES = HIGHSCORE_CATEGORIES.filter((entry) => !entry.primary);
