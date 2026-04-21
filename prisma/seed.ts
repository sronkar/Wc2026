import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// All kickoff times in UTC. Source: official FIFA WC2026 schedule (draw: Dec 5, 2024).
// Group stage sorted chronologically by kickoff.
const matches = [
  // ── MATCH DAY 1 ───────────────────────────────────────────────────────────────
  { matchNumber: 1,  homeTeam: "Mexico",                  awayTeam: "South Africa",          group: "A", round: "Group Stage", venue: "Estadio Azteca",           city: "Mexico City",        kickoff: new Date("2026-06-11T19:00:00Z") },
  { matchNumber: 2,  homeTeam: "South Korea",             awayTeam: "Czechia",               group: "A", round: "Group Stage", venue: "Estadio Akron",            city: "Guadalajara",        kickoff: new Date("2026-06-12T02:00:00Z") },
  { matchNumber: 3,  homeTeam: "Canada",                  awayTeam: "Bosnia-Herzegovina",    group: "B", round: "Group Stage", venue: "BMO Field",                city: "Toronto",            kickoff: new Date("2026-06-12T19:00:00Z") },
  { matchNumber: 4,  homeTeam: "United States",           awayTeam: "Paraguay",              group: "D", round: "Group Stage", venue: "SoFi Stadium",             city: "Los Angeles",        kickoff: new Date("2026-06-13T01:00:00Z") },
  { matchNumber: 5,  homeTeam: "Australia",               awayTeam: "Turkey",                group: "D", round: "Group Stage", venue: "BC Place",                 city: "Vancouver",          kickoff: new Date("2026-06-13T04:00:00Z") },
  { matchNumber: 6,  homeTeam: "Qatar",                   awayTeam: "Switzerland",           group: "B", round: "Group Stage", venue: "Levi's Stadium",           city: "San Francisco",      kickoff: new Date("2026-06-13T19:00:00Z") },
  { matchNumber: 7,  homeTeam: "Brazil",                  awayTeam: "Morocco",               group: "C", round: "Group Stage", venue: "MetLife Stadium",          city: "New York/New Jersey", kickoff: new Date("2026-06-13T22:00:00Z") },
  { matchNumber: 8,  homeTeam: "Haiti",                   awayTeam: "Scotland",              group: "C", round: "Group Stage", venue: "Gillette Stadium",         city: "Boston",             kickoff: new Date("2026-06-14T01:00:00Z") },
  { matchNumber: 9,  homeTeam: "Germany",                 awayTeam: "Curaçao",               group: "E", round: "Group Stage", venue: "NRG Stadium",              city: "Houston",            kickoff: new Date("2026-06-14T17:00:00Z") },
  { matchNumber: 10, homeTeam: "Netherlands",             awayTeam: "Japan",                 group: "F", round: "Group Stage", venue: "AT&T Stadium",             city: "Dallas",             kickoff: new Date("2026-06-14T20:00:00Z") },
  { matchNumber: 11, homeTeam: "Ivory Coast",             awayTeam: "Ecuador",               group: "E", round: "Group Stage", venue: "Lincoln Financial Field",  city: "Philadelphia",       kickoff: new Date("2026-06-14T23:00:00Z") },
  { matchNumber: 12, homeTeam: "Sweden",                  awayTeam: "Tunisia",               group: "F", round: "Group Stage", venue: "Estadio BBVA",             city: "Monterrey",          kickoff: new Date("2026-06-15T02:00:00Z") },
  { matchNumber: 13, homeTeam: "Spain",                   awayTeam: "Cape Verde",            group: "H", round: "Group Stage", venue: "Mercedes-Benz Stadium",   city: "Atlanta",            kickoff: new Date("2026-06-15T16:00:00Z") },
  { matchNumber: 14, homeTeam: "Belgium",                 awayTeam: "Egypt",                 group: "G", round: "Group Stage", venue: "Lumen Field",              city: "Seattle",            kickoff: new Date("2026-06-15T19:00:00Z") },
  { matchNumber: 15, homeTeam: "Saudi Arabia",            awayTeam: "Uruguay",               group: "H", round: "Group Stage", venue: "Hard Rock Stadium",        city: "Miami",              kickoff: new Date("2026-06-15T22:00:00Z") },
  { matchNumber: 16, homeTeam: "Iran",                    awayTeam: "New Zealand",           group: "G", round: "Group Stage", venue: "SoFi Stadium",             city: "Los Angeles",        kickoff: new Date("2026-06-16T01:00:00Z") },
  { matchNumber: 17, homeTeam: "Austria",                 awayTeam: "Jordan",                group: "J", round: "Group Stage", venue: "Levi's Stadium",           city: "San Francisco",      kickoff: new Date("2026-06-16T04:00:00Z") },
  { matchNumber: 18, homeTeam: "France",                  awayTeam: "Senegal",               group: "I", round: "Group Stage", venue: "MetLife Stadium",          city: "New York/New Jersey", kickoff: new Date("2026-06-16T19:00:00Z") },
  { matchNumber: 19, homeTeam: "Iraq",                    awayTeam: "Norway",                group: "I", round: "Group Stage", venue: "Gillette Stadium",         city: "Boston",             kickoff: new Date("2026-06-16T22:00:00Z") },
  { matchNumber: 20, homeTeam: "Argentina",               awayTeam: "Algeria",               group: "J", round: "Group Stage", venue: "Arrowhead Stadium",        city: "Kansas City",        kickoff: new Date("2026-06-17T01:00:00Z") },
  { matchNumber: 21, homeTeam: "Portugal",                awayTeam: "DR Congo",              group: "K", round: "Group Stage", venue: "NRG Stadium",              city: "Houston",            kickoff: new Date("2026-06-17T17:00:00Z") },
  { matchNumber: 22, homeTeam: "England",                 awayTeam: "Croatia",               group: "L", round: "Group Stage", venue: "AT&T Stadium",             city: "Dallas",             kickoff: new Date("2026-06-17T20:00:00Z") },
  { matchNumber: 23, homeTeam: "Ghana",                   awayTeam: "Panama",                group: "L", round: "Group Stage", venue: "BMO Field",                city: "Toronto",            kickoff: new Date("2026-06-17T23:00:00Z") },
  { matchNumber: 24, homeTeam: "Uzbekistan",              awayTeam: "Colombia",              group: "K", round: "Group Stage", venue: "Estadio Azteca",           city: "Mexico City",        kickoff: new Date("2026-06-18T02:00:00Z") },

  // ── MATCH DAY 2 ───────────────────────────────────────────────────────────────
  { matchNumber: 25, homeTeam: "Czechia",                 awayTeam: "South Africa",          group: "A", round: "Group Stage", venue: "Mercedes-Benz Stadium",   city: "Atlanta",            kickoff: new Date("2026-06-18T16:00:00Z") },
  { matchNumber: 26, homeTeam: "Switzerland",             awayTeam: "Bosnia-Herzegovina",    group: "B", round: "Group Stage", venue: "SoFi Stadium",             city: "Los Angeles",        kickoff: new Date("2026-06-18T19:00:00Z") },
  { matchNumber: 27, homeTeam: "Canada",                  awayTeam: "Qatar",                 group: "B", round: "Group Stage", venue: "BC Place",                 city: "Vancouver",          kickoff: new Date("2026-06-18T22:00:00Z") },
  { matchNumber: 28, homeTeam: "Mexico",                  awayTeam: "South Korea",           group: "A", round: "Group Stage", venue: "Estadio Akron",            city: "Guadalajara",        kickoff: new Date("2026-06-19T01:00:00Z") },
  { matchNumber: 29, homeTeam: "United States",           awayTeam: "Australia",             group: "D", round: "Group Stage", venue: "Lumen Field",              city: "Seattle",            kickoff: new Date("2026-06-19T19:00:00Z") },
  { matchNumber: 30, homeTeam: "Scotland",                awayTeam: "Morocco",               group: "C", round: "Group Stage", venue: "Gillette Stadium",         city: "Boston",             kickoff: new Date("2026-06-19T22:00:00Z") },
  { matchNumber: 31, homeTeam: "Brazil",                  awayTeam: "Haiti",                 group: "C", round: "Group Stage", venue: "Lincoln Financial Field",  city: "Philadelphia",       kickoff: new Date("2026-06-20T01:00:00Z") },
  { matchNumber: 32, homeTeam: "Turkey",                  awayTeam: "Paraguay",              group: "D", round: "Group Stage", venue: "Levi's Stadium",           city: "San Francisco",      kickoff: new Date("2026-06-20T03:00:00Z") },
  { matchNumber: 33, homeTeam: "Tunisia",                 awayTeam: "Japan",                 group: "F", round: "Group Stage", venue: "Estadio Akron",            city: "Guadalajara",        kickoff: new Date("2026-06-20T04:00:00Z") },
  { matchNumber: 34, homeTeam: "Netherlands",             awayTeam: "Sweden",                group: "F", round: "Group Stage", venue: "NRG Stadium",              city: "Houston",            kickoff: new Date("2026-06-20T17:00:00Z") },
  { matchNumber: 35, homeTeam: "Germany",                 awayTeam: "Ivory Coast",           group: "E", round: "Group Stage", venue: "BMO Field",                city: "Toronto",            kickoff: new Date("2026-06-20T20:00:00Z") },
  { matchNumber: 36, homeTeam: "Ecuador",                 awayTeam: "Curaçao",               group: "E", round: "Group Stage", venue: "Arrowhead Stadium",        city: "Kansas City",        kickoff: new Date("2026-06-21T00:00:00Z") },
  { matchNumber: 37, homeTeam: "Spain",                   awayTeam: "Saudi Arabia",          group: "H", round: "Group Stage", venue: "Mercedes-Benz Stadium",   city: "Atlanta",            kickoff: new Date("2026-06-21T16:00:00Z") },
  { matchNumber: 38, homeTeam: "Belgium",                 awayTeam: "Iran",                  group: "G", round: "Group Stage", venue: "SoFi Stadium",             city: "Los Angeles",        kickoff: new Date("2026-06-21T19:00:00Z") },
  { matchNumber: 39, homeTeam: "Uruguay",                 awayTeam: "Cape Verde",            group: "H", round: "Group Stage", venue: "Hard Rock Stadium",        city: "Miami",              kickoff: new Date("2026-06-21T22:00:00Z") },
  { matchNumber: 40, homeTeam: "New Zealand",             awayTeam: "Egypt",                 group: "G", round: "Group Stage", venue: "BC Place",                 city: "Vancouver",          kickoff: new Date("2026-06-22T01:00:00Z") },
  { matchNumber: 41, homeTeam: "Argentina",               awayTeam: "Austria",               group: "J", round: "Group Stage", venue: "AT&T Stadium",             city: "Dallas",             kickoff: new Date("2026-06-22T17:00:00Z") },
  { matchNumber: 42, homeTeam: "France",                  awayTeam: "Iraq",                  group: "I", round: "Group Stage", venue: "Lincoln Financial Field",  city: "Philadelphia",       kickoff: new Date("2026-06-22T21:00:00Z") },
  { matchNumber: 43, homeTeam: "Norway",                  awayTeam: "Senegal",               group: "I", round: "Group Stage", venue: "MetLife Stadium",          city: "New York/New Jersey", kickoff: new Date("2026-06-23T00:00:00Z") },
  { matchNumber: 44, homeTeam: "Jordan",                  awayTeam: "Algeria",               group: "J", round: "Group Stage", venue: "Levi's Stadium",           city: "San Francisco",      kickoff: new Date("2026-06-23T03:00:00Z") },
  { matchNumber: 45, homeTeam: "Portugal",                awayTeam: "Uzbekistan",            group: "K", round: "Group Stage", venue: "NRG Stadium",              city: "Houston",            kickoff: new Date("2026-06-23T17:00:00Z") },
  { matchNumber: 46, homeTeam: "England",                 awayTeam: "Ghana",                 group: "L", round: "Group Stage", venue: "Gillette Stadium",         city: "Boston",             kickoff: new Date("2026-06-23T20:00:00Z") },
  { matchNumber: 47, homeTeam: "Panama",                  awayTeam: "Croatia",               group: "L", round: "Group Stage", venue: "BMO Field",                city: "Toronto",            kickoff: new Date("2026-06-23T23:00:00Z") },
  { matchNumber: 48, homeTeam: "Colombia",                awayTeam: "DR Congo",              group: "K", round: "Group Stage", venue: "Estadio Akron",            city: "Guadalajara",        kickoff: new Date("2026-06-24T02:00:00Z") },

  // ── MATCH DAY 3 (simultaneous within group) ───────────────────────────────────
  { matchNumber: 49, homeTeam: "Switzerland",             awayTeam: "Canada",                group: "B", round: "Group Stage", venue: "BC Place",                 city: "Vancouver",          kickoff: new Date("2026-06-24T19:00:00Z") },
  { matchNumber: 50, homeTeam: "Bosnia-Herzegovina",      awayTeam: "Qatar",                 group: "B", round: "Group Stage", venue: "Lumen Field",              city: "Seattle",            kickoff: new Date("2026-06-24T19:00:00Z") },
  { matchNumber: 51, homeTeam: "Scotland",                awayTeam: "Brazil",                group: "C", round: "Group Stage", venue: "Hard Rock Stadium",        city: "Miami",              kickoff: new Date("2026-06-24T22:00:00Z") },
  { matchNumber: 52, homeTeam: "Morocco",                 awayTeam: "Haiti",                 group: "C", round: "Group Stage", venue: "Mercedes-Benz Stadium",   city: "Atlanta",            kickoff: new Date("2026-06-24T22:00:00Z") },
  { matchNumber: 53, homeTeam: "Czechia",                 awayTeam: "Mexico",                group: "A", round: "Group Stage", venue: "Estadio Azteca",           city: "Mexico City",        kickoff: new Date("2026-06-25T01:00:00Z") },
  { matchNumber: 54, homeTeam: "South Africa",            awayTeam: "South Korea",           group: "A", round: "Group Stage", venue: "Estadio BBVA",             city: "Monterrey",          kickoff: new Date("2026-06-25T01:00:00Z") },
  { matchNumber: 55, homeTeam: "Curaçao",                 awayTeam: "Ivory Coast",           group: "E", round: "Group Stage", venue: "Lincoln Financial Field",  city: "Philadelphia",       kickoff: new Date("2026-06-25T20:00:00Z") },
  { matchNumber: 56, homeTeam: "Ecuador",                 awayTeam: "Germany",               group: "E", round: "Group Stage", venue: "MetLife Stadium",          city: "New York/New Jersey", kickoff: new Date("2026-06-25T20:00:00Z") },
  { matchNumber: 57, homeTeam: "Japan",                   awayTeam: "Sweden",                group: "F", round: "Group Stage", venue: "AT&T Stadium",             city: "Dallas",             kickoff: new Date("2026-06-25T23:00:00Z") },
  { matchNumber: 58, homeTeam: "Tunisia",                 awayTeam: "Netherlands",           group: "F", round: "Group Stage", venue: "Arrowhead Stadium",        city: "Kansas City",        kickoff: new Date("2026-06-25T23:00:00Z") },
  { matchNumber: 59, homeTeam: "Turkey",                  awayTeam: "United States",         group: "D", round: "Group Stage", venue: "SoFi Stadium",             city: "Los Angeles",        kickoff: new Date("2026-06-26T02:00:00Z") },
  { matchNumber: 60, homeTeam: "Paraguay",                awayTeam: "Australia",             group: "D", round: "Group Stage", venue: "Levi's Stadium",           city: "San Francisco",      kickoff: new Date("2026-06-26T02:00:00Z") },
  { matchNumber: 61, homeTeam: "Norway",                  awayTeam: "France",                group: "I", round: "Group Stage", venue: "Gillette Stadium",         city: "Boston",             kickoff: new Date("2026-06-26T19:00:00Z") },
  { matchNumber: 62, homeTeam: "Senegal",                 awayTeam: "Iraq",                  group: "I", round: "Group Stage", venue: "BMO Field",                city: "Toronto",            kickoff: new Date("2026-06-26T19:00:00Z") },
  { matchNumber: 63, homeTeam: "Cape Verde",              awayTeam: "Saudi Arabia",          group: "H", round: "Group Stage", venue: "NRG Stadium",              city: "Houston",            kickoff: new Date("2026-06-27T00:00:00Z") },
  { matchNumber: 64, homeTeam: "Uruguay",                 awayTeam: "Spain",                 group: "H", round: "Group Stage", venue: "Estadio Akron",            city: "Guadalajara",        kickoff: new Date("2026-06-27T00:00:00Z") },
  { matchNumber: 65, homeTeam: "Egypt",                   awayTeam: "Iran",                  group: "G", round: "Group Stage", venue: "Lumen Field",              city: "Seattle",            kickoff: new Date("2026-06-27T03:00:00Z") },
  { matchNumber: 66, homeTeam: "New Zealand",             awayTeam: "Belgium",               group: "G", round: "Group Stage", venue: "BC Place",                 city: "Vancouver",          kickoff: new Date("2026-06-27T03:00:00Z") },
  { matchNumber: 67, homeTeam: "Panama",                  awayTeam: "England",               group: "L", round: "Group Stage", venue: "MetLife Stadium",          city: "New York/New Jersey", kickoff: new Date("2026-06-27T21:00:00Z") },
  { matchNumber: 68, homeTeam: "Ghana",                   awayTeam: "Croatia",               group: "L", round: "Group Stage", venue: "Lincoln Financial Field",  city: "Philadelphia",       kickoff: new Date("2026-06-27T21:00:00Z") },
  { matchNumber: 69, homeTeam: "Colombia",                awayTeam: "Portugal",              group: "K", round: "Group Stage", venue: "Hard Rock Stadium",        city: "Miami",              kickoff: new Date("2026-06-27T23:30:00Z") },
  { matchNumber: 70, homeTeam: "DR Congo",                awayTeam: "Uzbekistan",            group: "K", round: "Group Stage", venue: "Mercedes-Benz Stadium",   city: "Atlanta",            kickoff: new Date("2026-06-27T23:30:00Z") },
  { matchNumber: 71, homeTeam: "Jordan",                  awayTeam: "Argentina",             group: "J", round: "Group Stage", venue: "AT&T Stadium",             city: "Dallas",             kickoff: new Date("2026-06-28T02:00:00Z") },
  { matchNumber: 72, homeTeam: "Algeria",                 awayTeam: "Austria",               group: "J", round: "Group Stage", venue: "Arrowhead Stadium",        city: "Kansas City",        kickoff: new Date("2026-06-28T02:00:00Z") },

  // ─── ROUND OF 32 (matches 73-88) — TBD teams ─────────────────────────────────
  { matchNumber: 73,  homeTeam: "TBD (1A)", awayTeam: "TBD (2C)", group: null, round: "Round of 32", venue: "AT&T Stadium",             city: "Dallas",             kickoff: new Date("2026-07-03T22:00:00Z") },
  { matchNumber: 74,  homeTeam: "TBD (1B)", awayTeam: "TBD (2D)", group: null, round: "Round of 32", venue: "MetLife Stadium",          city: "New York/New Jersey", kickoff: new Date("2026-07-04T02:00:00Z") },
  { matchNumber: 75,  homeTeam: "TBD (1C)", awayTeam: "TBD (2A)", group: null, round: "Round of 32", venue: "SoFi Stadium",             city: "Los Angeles",        kickoff: new Date("2026-07-04T18:00:00Z") },
  { matchNumber: 76,  homeTeam: "TBD (1D)", awayTeam: "TBD (2B)", group: null, round: "Round of 32", venue: "Hard Rock Stadium",        city: "Miami",              kickoff: new Date("2026-07-04T22:00:00Z") },
  { matchNumber: 77,  homeTeam: "TBD (1E)", awayTeam: "TBD (3A/B/C)", group: null, round: "Round of 32", venue: "Levi's Stadium",       city: "San Francisco",      kickoff: new Date("2026-07-05T02:00:00Z") },
  { matchNumber: 78,  homeTeam: "TBD (1F)", awayTeam: "TBD (3D/E/F)", group: null, round: "Round of 32", venue: "Mercedes-Benz Stadium", city: "Atlanta",           kickoff: new Date("2026-07-05T18:00:00Z") },
  { matchNumber: 79,  homeTeam: "TBD (1G)", awayTeam: "TBD (3G/H/I)", group: null, round: "Round of 32", venue: "Gillette Stadium",     city: "Boston",             kickoff: new Date("2026-07-05T22:00:00Z") },
  { matchNumber: 80,  homeTeam: "TBD (1H)", awayTeam: "TBD (2E)", group: null, round: "Round of 32", venue: "Lincoln Financial Field",  city: "Philadelphia",       kickoff: new Date("2026-07-06T02:00:00Z") },
  { matchNumber: 81,  homeTeam: "TBD (1I)", awayTeam: "TBD (2F)", group: null, round: "Round of 32", venue: "Lumen Field",              city: "Seattle",            kickoff: new Date("2026-07-06T18:00:00Z") },
  { matchNumber: 82,  homeTeam: "TBD (1J)", awayTeam: "TBD (2G)", group: null, round: "Round of 32", venue: "Arrowhead Stadium",        city: "Kansas City",        kickoff: new Date("2026-07-06T22:00:00Z") },
  { matchNumber: 83,  homeTeam: "TBD (1K)", awayTeam: "TBD (2H)", group: null, round: "Round of 32", venue: "BMO Field",                city: "Toronto",            kickoff: new Date("2026-07-07T02:00:00Z") },
  { matchNumber: 84,  homeTeam: "TBD (1L)", awayTeam: "TBD (2I)", group: null, round: "Round of 32", venue: "BC Place",                 city: "Vancouver",          kickoff: new Date("2026-07-07T18:00:00Z") },
  { matchNumber: 85,  homeTeam: "TBD (2J)", awayTeam: "TBD (3J/K/L)", group: null, round: "Round of 32", venue: "Estadio Azteca",       city: "Mexico City",        kickoff: new Date("2026-07-07T22:00:00Z") },
  { matchNumber: 86,  homeTeam: "TBD (2K)", awayTeam: "TBD (3...)", group: null, round: "Round of 32", venue: "Estadio Akron",          city: "Guadalajara",        kickoff: new Date("2026-07-08T02:00:00Z") },
  { matchNumber: 87,  homeTeam: "TBD (2L)", awayTeam: "TBD (3...)", group: null, round: "Round of 32", venue: "Estadio BBVA",            city: "Monterrey",          kickoff: new Date("2026-07-08T18:00:00Z") },
  { matchNumber: 88,  homeTeam: "TBD (3...)", awayTeam: "TBD (3...)", group: null, round: "Round of 32", venue: "NRG Stadium",           city: "Houston",            kickoff: new Date("2026-07-08T22:00:00Z") },

  // ─── ROUND OF 16 (matches 89-96) ─────────────────────────────────────────────
  { matchNumber: 89,  homeTeam: "TBD (W73)", awayTeam: "TBD (W74)", group: null, round: "Round of 16", venue: "MetLife Stadium",         city: "New York/New Jersey", kickoff: new Date("2026-07-11T18:00:00Z") },
  { matchNumber: 90,  homeTeam: "TBD (W75)", awayTeam: "TBD (W76)", group: null, round: "Round of 16", venue: "SoFi Stadium",            city: "Los Angeles",        kickoff: new Date("2026-07-11T22:00:00Z") },
  { matchNumber: 91,  homeTeam: "TBD (W77)", awayTeam: "TBD (W78)", group: null, round: "Round of 16", venue: "AT&T Stadium",            city: "Dallas",             kickoff: new Date("2026-07-12T18:00:00Z") },
  { matchNumber: 92,  homeTeam: "TBD (W79)", awayTeam: "TBD (W80)", group: null, round: "Round of 16", venue: "Hard Rock Stadium",       city: "Miami",              kickoff: new Date("2026-07-12T22:00:00Z") },
  { matchNumber: 93,  homeTeam: "TBD (W81)", awayTeam: "TBD (W82)", group: null, round: "Round of 16", venue: "Estadio Azteca",          city: "Mexico City",        kickoff: new Date("2026-07-13T18:00:00Z") },
  { matchNumber: 94,  homeTeam: "TBD (W83)", awayTeam: "TBD (W84)", group: null, round: "Round of 16", venue: "Mercedes-Benz Stadium",  city: "Atlanta",            kickoff: new Date("2026-07-13T22:00:00Z") },
  { matchNumber: 95,  homeTeam: "TBD (W85)", awayTeam: "TBD (W86)", group: null, round: "Round of 16", venue: "Levi's Stadium",          city: "San Francisco",      kickoff: new Date("2026-07-14T18:00:00Z") },
  { matchNumber: 96,  homeTeam: "TBD (W87)", awayTeam: "TBD (W88)", group: null, round: "Round of 16", venue: "BMO Field",               city: "Toronto",            kickoff: new Date("2026-07-14T22:00:00Z") },

  // ─── QUARTER-FINALS (matches 97-100) ─────────────────────────────────────────
  { matchNumber: 97,  homeTeam: "TBD (W89)", awayTeam: "TBD (W90)", group: null, round: "Quarter-final", venue: "MetLife Stadium",       city: "New York/New Jersey", kickoff: new Date("2026-07-17T18:00:00Z") },
  { matchNumber: 98,  homeTeam: "TBD (W91)", awayTeam: "TBD (W92)", group: null, round: "Quarter-final", venue: "SoFi Stadium",          city: "Los Angeles",        kickoff: new Date("2026-07-17T22:00:00Z") },
  { matchNumber: 99,  homeTeam: "TBD (W93)", awayTeam: "TBD (W94)", group: null, round: "Quarter-final", venue: "AT&T Stadium",          city: "Dallas",             kickoff: new Date("2026-07-18T18:00:00Z") },
  { matchNumber: 100, homeTeam: "TBD (W95)", awayTeam: "TBD (W96)", group: null, round: "Quarter-final", venue: "Hard Rock Stadium",     city: "Miami",              kickoff: new Date("2026-07-18T22:00:00Z") },

  // ─── SEMI-FINALS (matches 101-102) ───────────────────────────────────────────
  { matchNumber: 101, homeTeam: "TBD (W97)",  awayTeam: "TBD (W98)",  group: null, round: "Semi-final", venue: "MetLife Stadium",        city: "New York/New Jersey", kickoff: new Date("2026-07-22T22:00:00Z") },
  { matchNumber: 102, homeTeam: "TBD (W99)",  awayTeam: "TBD (W100)", group: null, round: "Semi-final", venue: "AT&T Stadium",           city: "Dallas",             kickoff: new Date("2026-07-23T22:00:00Z") },

  // ─── THIRD PLACE & FINAL ─────────────────────────────────────────────────────
  { matchNumber: 103, homeTeam: "TBD (L101)", awayTeam: "TBD (L102)", group: null, round: "Third Place Play-off", venue: "Hard Rock Stadium", city: "Miami",           kickoff: new Date("2026-07-25T18:00:00Z") },
  { matchNumber: 104, homeTeam: "TBD (W101)", awayTeam: "TBD (W102)", group: null, round: "Final",               venue: "MetLife Stadium",   city: "New York/New Jersey", kickoff: new Date("2026-07-26T20:00:00Z") },
];

async function main() {
  console.log("Seeding database...");

  await prisma.pointSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", exactMatchPoints: 5, directionMatchPoints: 1, updatedAt: new Date() },
  });

  for (const match of matches) {
    await prisma.match.upsert({
      where: { matchNumber: match.matchNumber },
      update: {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        group: match.group,
        round: match.round,
        venue: match.venue,
        city: match.city,
        kickoff: match.kickoff,
        status: "SCHEDULED",
      },
      create: { ...match, status: "SCHEDULED" },
    });
  }

  console.log(`Seeded ${matches.length} matches.`);

  // Global general predictions (locked 1h before tournament starts)
  const tournamentLock = new Date("2026-06-11T18:00:00Z");
  // Group winner predictions lock before last group stage matches end
  const groupLock = new Date("2026-06-28T12:00:00Z");

  const allTeams = [
    "Mexico","South Africa","South Korea","Czechia",
    "Canada","Bosnia-Herzegovina","Qatar","Switzerland",
    "Brazil","Morocco","Haiti","Scotland",
    "United States","Australia","Turkey","Paraguay",
    "Germany","Ivory Coast","Ecuador","Curaçao",
    "Netherlands","Sweden","Japan","Tunisia",
    "Belgium","Egypt","Iran","New Zealand",
    "Spain","Uruguay","Saudi Arabia","Cape Verde",
    "France","Senegal","Iraq","Norway",
    "Austria","Jordan","Argentina","Algeria",
    "Portugal","Uzbekistan","DR Congo","Colombia",
    "England","Croatia","Ghana","Panama",
  ];

  const groupTeams: Record<string, string[]> = {
    A: ["Mexico","South Africa","South Korea","Czechia"],
    B: ["Canada","Bosnia-Herzegovina","Qatar","Switzerland"],
    C: ["Brazil","Morocco","Haiti","Scotland"],
    D: ["United States","Australia","Turkey","Paraguay"],
    E: ["Germany","Ivory Coast","Ecuador","Curaçao"],
    F: ["Netherlands","Sweden","Japan","Tunisia"],
    G: ["Belgium","Egypt","Iran","New Zealand"],
    H: ["Spain","Uruguay","Saudi Arabia","Cape Verde"],
    I: ["France","Senegal","Iraq","Norway"],
    J: ["Austria","Jordan","Argentina","Algeria"],
    K: ["Portugal","Uzbekistan","DR Congo","Colombia"],
    L: ["England","Croatia","Ghana","Panama"],
  };

  const globalPredictions = [
    {
      question: "Who will win the 2026 World Cup?",
      description: "Pick the team you think will lift the trophy in New Jersey.",
      optionType: "TEAM",
      options: JSON.stringify(allTeams),
      points: 10,
      lockTime: tournamentLock,
    },
    {
      question: "Which team will be the runner-up?",
      description: "Pick the team that reaches the Final but doesn't win.",
      optionType: "TEAM",
      options: JSON.stringify(allTeams),
      points: 7,
      lockTime: tournamentLock,
    },
    {
      question: "Who will win the Golden Boot (top scorer)?",
      description: "Pick the player who scores the most goals.",
      optionType: "PLAYER",
      options: JSON.stringify([]),
      points: 8,
      lockTime: tournamentLock,
    },
    {
      question: "Who will win the Golden Ball (best player)?",
      description: "Pick the player awarded best of the tournament.",
      optionType: "PLAYER",
      options: JSON.stringify([]),
      points: 7,
      lockTime: tournamentLock,
    },
    {
      question: "Who will win the Golden Glove (best goalkeeper)?",
      description: "Pick the goalkeeper awarded best of the tournament.",
      optionType: "PLAYER",
      options: JSON.stringify([]),
      points: 6,
      lockTime: tournamentLock,
    },
    {
      question: "How many total goals will be scored?",
      description: "WC2022 had 172 goals across 64 matches; WC2026 has 104 matches.",
      optionType: "FIXED",
      options: JSON.stringify(["Under 200","200–224","225–249","250–274","275–299","300 or more"]),
      points: 5,
      lockTime: tournamentLock,
    },
    {
      question: "Which host nation will advance furthest?",
      description: "USA, Canada, and Mexico are all hosts. Who goes deepest?",
      optionType: "FIXED",
      options: JSON.stringify(["United States","Canada","Mexico","All eliminated in group stage"]),
      points: 5,
      lockTime: tournamentLock,
    },
    {
      question: "Will the final go to extra time or penalties?",
      optionType: "FIXED",
      options: JSON.stringify(["Yes — extra time or penalties","No — decided in 90 minutes"]),
      points: 4,
      lockTime: tournamentLock,
    },
    ...Object.entries(groupTeams).map(([g, teams]) => ({
      question: `Who will win Group ${g}?`,
      description: teams.join(" · "),
      optionType: "TEAM",
      options: JSON.stringify(teams),
      points: 4,
      lockTime: groupLock,
    })),
  ];

  let seededPredictions = 0;
  for (const pred of globalPredictions) {
    const existing = await prisma.customPrediction.findFirst({
      where: { isGlobal: true, question: pred.question },
    });
    if (!existing) {
      await prisma.customPrediction.create({
        data: { ...pred, isGlobal: true },
      });
      seededPredictions++;
    }
  }
  console.log(`Seeded ${seededPredictions} global predictions (skipped ${globalPredictions.length - seededPredictions} existing).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
