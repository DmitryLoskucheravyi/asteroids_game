import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const QuestProgressSchema = new Schema(
  {
    questId: { type: String, required: true },
    periodKey: { type: String, required: true },
    progress: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
  },
  { _id: false },
);

const CrateSchema = new Schema({
  crateType: { type: String, enum: ['common', 'rare', 'epic', 'mythic', 'legendary'], required: true },
  source: { type: String, required: true },
  acquiredAt: { type: Date, default: () => new Date() },
  openedAt: { type: Date, default: null },
});

const SurvivalEntrySchema = new Schema(
  {
    time: { type: Number, required: true },
    date: { type: String, required: true },
  },
  { _id: false },
);

const PlaneProgressSchema = new Schema(
  {
    planeId: { type: String, required: true },
    tier: { type: Number, default: 1 },
    level: { type: Number, default: 1 },
  },
  { _id: false },
);

const OwnedItemSchema = new Schema({
  defId: { type: String, required: true },
  rarity: { type: String, enum: ['common', 'rare', 'epic', 'mythic', 'legendary'], required: true },
});

const LoadoutSchema = new Schema(
  {
    planeId: { type: String, required: true },
    active: { type: String, default: null },
    passive: { type: String, default: null },
    weapon: { type: String, default: null },
  },
  { _id: false },
);

const UserSchema = new Schema({
  nickname: { type: String, required: true, unique: true, minlength: 3, maxlength: 20, trim: true },
  nicknameLower: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },

  coins: { type: Number, default: 0 },
  crystals: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },

  selectedPlane: { type: String, default: 'falcon' },
  ownedPlanes: { type: [String], default: ['falcon'] },
  planeProgress: { type: [PlaneProgressSchema], default: [] },
  stars: { type: [Number], default: [] },
  unlocked: { type: Number, default: 1 },
  survivalTop: { type: [SurvivalEntrySchema], default: [] },

  dailyLast: { type: String, default: '' },
  dailyStreak: { type: Number, default: 0 },

  quests: { type: [QuestProgressSchema], default: [] },

  passSeasonId: { type: String, default: '' },
  passBpPoints: { type: Number, default: 0 },
  passPremium: { type: Boolean, default: false },
  passClaimedFree: { type: [Number], default: [] },
  passClaimedPremium: { type: [Number], default: [] },

  crates: { type: [CrateSchema], default: [] },

  items: { type: [OwnedItemSchema], default: [] },
  loadouts: { type: [LoadoutSchema], default: [] },
  ownedWeapons: { type: [String], default: ['machine_gun'] },

  /** Рейтинговий режим */
  rankPoints: { type: Number, default: 0 },
  rankBest: { type: Number, default: 0 },
  rankedMatches: { type: Number, default: 0 },
  rankedWins: { type: Number, default: 0 },
  rankSeasonId: { type: String, default: '' },
  /** Підсумок минулого сезону рейтингу (для показу нагороди) */
  rankLastSeason: { type: Schema.Types.Mixed, default: null },
  /** Одноразова компенсація за перебалансування предметів (v2) */
  balanceV2Comp: { type: Boolean, default: false },

  keybinds: { type: Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: () => new Date() },
  lastLoginAt: { type: Date, default: () => new Date() },
});

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };

export const User = model('User', UserSchema);
