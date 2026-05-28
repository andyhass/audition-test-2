import {
  pgTable,
  pgEnum,
  text,
  integer,
  uuid,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core"

export const eventStatusEnum = pgEnum("event_status", [
  "upcoming", "live", "completed", "cancelled",
])

export const resultEnum = pgEnum("result", [
  "home_win", "away_win", "draw", "pending",
])

export const betSideEnum = pgEnum("bet_side", ["home", "away"])

export const betStatusEnum = pgEnum("bet_status", [
  "pending", "won", "lost", "refunded",
])

export const leagues = pgTable("leagues", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  external_id: text("external_id").notNull().unique(),
})

export const sports_events = pgTable("sports_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  external_id: text("external_id").notNull().unique(),
  on_chain_event_id: text("on_chain_event_id"),
  league_id: integer("league_id")
    .notNull()
    .references(() => leagues.id),
  home_team: text("home_team").notNull(),
  away_team: text("away_team").notNull(),
  match_time: timestamp("match_time", { withTimezone: true }).notNull(),
  status: eventStatusEnum("status").notNull().default("upcoming"),
  home_odds: numeric("home_odds", { precision: 8, scale: 4 }),
  away_odds: numeric("away_odds", { precision: 8, scale: 4 }),
  result: resultEnum("result").notNull().default("pending"),
})

export const users = pgTable("users", {
  wallet_address: text("wallet_address").primaryKey(),
  preferred_timezone: text("preferred_timezone").notNull().default("UTC"),
  favorite_sports: text("favorite_sports").array().notNull().default([]),
  top_leagues: integer("top_leagues").array().notNull().default([]),
})

export const bet_cache = pgTable("bet_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  tx_hash: text("tx_hash").notNull(),
  wallet_address: text("wallet_address")
    .notNull()
    .references(() => users.wallet_address),
  event_id: uuid("event_id")
    .notNull()
    .references(() => sports_events.id),
  side: betSideEnum("side").notNull(),
  amount_usdc: numeric("amount_usdc", { precision: 20, scale: 6 }).notNull(),
  odds_snapshot: numeric("odds_snapshot", { precision: 8, scale: 4 }).notNull(),
  status: betStatusEnum("status").notNull().default("pending"),
})
