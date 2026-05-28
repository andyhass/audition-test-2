// lib/contracts/abi.ts
export const BETTING_PLATFORM_ABI = [
  // --- Events ---
  { type: "event", name: "EventCreated", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "homeTeam", type: "string", indexed: false },
    { name: "awayTeam", type: "string", indexed: false },
  ]},
  { type: "event", name: "OddsUpdated", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "homeOdds", type: "uint256", indexed: false },
    { name: "awayOdds", type: "uint256", indexed: false },
  ]},
  { type: "event", name: "BetPlaced", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "bettor", type: "address", indexed: true },
    { name: "side", type: "uint8", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "oddsSnapshot", type: "uint256", indexed: false },
  ]},
  { type: "event", name: "EventSettled", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "result", type: "uint8", indexed: false },
  ]},
  // --- Read ---
  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "nextEventId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "events", stateMutability: "view",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [{ type: "uint256", name: "id" }, { type: "string", name: "homeTeam" }, { type: "string", name: "awayTeam" },
              { type: "uint256", name: "homeOdds" }, { type: "uint256", name: "awayOdds" },
              { type: "uint256", name: "startTime" }, { type: "uint8", name: "status" }, { type: "string", name: "externalId" }]
  },
  { type: "function", name: "getBets", stateMutability: "view",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [{ type: "tuple[]", components: [
      { name: "bettor", type: "address" }, { name: "side", type: "uint8" },
      { name: "amount", type: "uint256" }, { name: "oddsSnapshot", type: "uint256" }, { name: "settled", type: "bool" }
    ]}]
  },
  // --- Write ---
  { type: "function", name: "depositLiquidity", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "createEvent", stateMutability: "nonpayable",
    inputs: [{ name: "homeTeam", type: "string" }, { name: "awayTeam", type: "string" },
             { name: "homeOdds", type: "uint256" }, { name: "awayOdds", type: "uint256" },
             { name: "startTime", type: "uint256" }, { name: "externalId", type: "string" }],
    outputs: [{ name: "eventId", type: "uint256" }]
  },
  { type: "function", name: "updateOdds", stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "uint256" }, { name: "homeOdds", type: "uint256" }, { name: "awayOdds", type: "uint256" }],
    outputs: []
  },
  { type: "function", name: "placeBet", stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "uint256" }, { name: "side", type: "uint8" }, { name: "amount", type: "uint256" }],
    outputs: []
  },
  { type: "function", name: "settle", stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "uint256" }, { name: "result", type: "uint8" }],
    outputs: []
  },
  { type: "function", name: "withdrawHouseFunds", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const
