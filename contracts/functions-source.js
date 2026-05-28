// contracts/functions-source.js
// Runs inside Chainlink DON. args[0] = TheSportsDB event ID.
const eventId = args[0];
const apiKey = secrets?.apiKey ?? "3";

const response = await Functions.makeHttpRequest({
  url: `https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupevent.php?id=${eventId}`,
});

if (response.error) throw new Error("API request failed");

const event = response.data?.events?.[0];
if (!event) throw new Error("Event not found");
if (event.strStatus !== "Match Finished") throw new Error("Match not finished yet");

const homeScore = parseInt(event.intHomeScore);
const awayScore = parseInt(event.intAwayScore);

let result;
if (homeScore > awayScore) result = 0;      // home win
else if (awayScore > homeScore) result = 1;  // away win
else result = 2;                             // draw

return new Uint8Array([result]);
