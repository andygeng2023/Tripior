# Tripior Research Engine

Phase 1 implementation of Tripior's reusable destination research layer.

## What is implemented

- Destination resolution via OpenStreetMap Nominatim.
- Provider abstraction and Overpass discovery.
- Research profiles and research runs.
- Raw provider evidence retention.
- Basic entity resolution into canonical places.
- Provider IDs linked to canonical places.
- Universal quality signals with component storage.
- Versioned research snapshots.
- PostgreSQL schema in Supabase.
- Responsive React/Vite research workspace.
- Fastify/TypeScript API suitable for the Oracle Cloud VM.

This is deliberately a Phase 1 foundation. The later phases in your design should add tiered enrichment, date-aware temporal facts, events, geographic cells, routing enrichment, review analysis, provider fallback, queues, retries, monitoring and automated refresh.

## Architecture

`web/` is the React UI.

`research-engine/` is the backend API and research pipeline.

Supabase PostgreSQL is the primary research database. The InfinityFree MySQL database is intentionally not part of the research data path; using two databases for the same canonical research records would create unnecessary synchronization problems.

The Oracle Cloud VM should run the backend. InfinityFree can host the static React build if its hosting plan supports the required static files.

## 1. Create the Supabase database

Create or use your Supabase project.

Open **Supabase → SQL Editor** and run:

`research-engine/sql/001_initial.sql`

The schema creates the core research tables, raw evidence store, taxonomy tables, temporal tables, relationship tables, cache, and snapshot model.

Important: this first migration intentionally uses ordinary latitude/longitude columns instead of requiring PostGIS. That keeps the initial deployment portable.

## 2. Backend environment

On your development machine:

```bash
cd research-engine
npm install
cp .env.example .env
```

Set:

```
DATABASE_URL=your Supabase PostgreSQL connection string
CORS_ORIGIN=http://localhost:5173
NOMINATIM_USER_AGENT=TripiorResearchEngine/0.1 (your-contact-email)
OVERPASS_URL=https://overpass-api.de/api/interpreter
PORT=8080
```

Do not commit `.env`.

You do not need a Supabase browser key for this backend because it connects directly to PostgreSQL. If you later use Supabase Auth or Storage, keep privileged keys server-side.

Run:

```bash
npm run db:migrate
npm run dev
```

The API should be available at `http://localhost:8080`.

## 3. Frontend

In another terminal:

```bash
cd web
npm install
cp .env.example .env
```

Set:

```
VITE_API_URL=http://localhost:8080
```

Then:

```bash
npm run dev
```

The UI provides the first research workflow: destination, interests, research radius, run request, and snapshot result.

## 4. Oracle Cloud VM

Install Node.js 20 or newer.

On the VM:

```bash
git clone https://github.com/andygeng2023/Tripior.git
cd Tripior/research-engine
npm ci
npm run build
```

Create the production environment file outside Git:

```
DATABASE_URL=your Supabase PostgreSQL connection string
CORS_ORIGIN=https://your-frontend-domain
NOMINATIM_USER_AGENT=TripiorResearchEngine/0.1 (your-contact-email)
OVERPASS_URL=https://overpass-api.de/api/interpreter
PORT=8080
```

Run:

```bash
npm run db:migrate
npm start
```

Put Nginx or Caddy in front of port 8080 and use HTTPS. Only expose the reverse proxy publicly.

Before making the endpoint public, add authentication and rate limiting. The current Phase 1 endpoint is not intended to be an unauthenticated public API.

## 5. InfinityFree frontend

Build the React app:

```bash
cd web
npm install
```

Create `.env.production`:

```
VITE_API_URL=https://api.your-domain.example
```

Then:

```bash
npm run build
```

Upload the contents of `web/dist/` to the InfinityFree web root.

If InfinityFree is configured for a normal static site, the React application will load from the generated files. If your InfinityFree configuration requires rewrite rules for client-side routes, add the appropriate SPA fallback; the current Phase 1 UI does not depend on client-side routing.

## 6. InfinityFree MySQL

Do not add the research schema to the InfinityFree MySQL database.

Use Supabase PostgreSQL as the source of truth for:

- destinations
- research profiles
- research runs
- raw evidence
- canonical places
- provider IDs
- facts
- hours
- events
- media
- relationships
- taxonomy
- snapshots
- cache entries

If the existing Tripior application already uses InfinityFree MySQL for unrelated legacy/application data, keep that data there until it is deliberately migrated.

## 7. Provider API keys

Phase 1 does not require a paid Places API key.

Later, when adding Google Places or another commercial provider, create the key in that provider's console and store it only on the Oracle VM. Never put it in `VITE_*` variables or React source.

The provider implementation should:

1. Resolve destinations.
2. Discover candidates.
3. Fetch tier-specific details.
4. Return normalized provider data.
5. Persist the untouched response in `research_raw_results`.
6. Persist provider IDs in `place_provider_ids`.
7. Record provider failures and request metadata.

## 8. Git safety

Add a root `.gitignore` containing at least:

```
.env
.env.*
!.env.example
node_modules/
dist/
.DS_Store
```

Never commit database passwords, Supabase service-role keys, commercial API keys, SSH keys, or Oracle credentials.

## 9. Current API

`GET /health`

`POST /api/research/runs`

Example request:

```json
{
  "destination": "Kyoto, Japan",
  "travelStart": "2027-04-10",
  "travelEnd": "2027-04-15",
  "travellerCount": 2,
  "interests": ["history", "food", "architecture"],
  "maxGeographicRangeKm": 15
}
```

`GET /api/research/runs/:id`

`GET /api/research/snapshots/:id/places`

## Important limitation

The current discovery provider is OpenStreetMap/Overpass. It is not a substitute for complete commercial place research. The UI currently reports the result as complete because the Phase 1 pipeline completed its configured provider operation; the production version should distinguish provider-complete from destination-complete coverage and report geographic/provider limitations explicitly.

## Next build order

1. Seed Tripior taxonomy and provider mappings.
2. Add a geographic-cell research planner instead of one radius.
3. Add tier 1/2/3 enrichment with explicit field sets.
4. Add source/conflict resolution and confidence calculations.
5. Add date-aware hours, closures, events and seasonal conditions.
6. Add traveller-specific scoring separately from universal scoring.
7. Add diversity and lesser-known derived classifications.
8. Add provider fallback.
9. Move runs into an asynchronous job queue with retries.
10. Add authentication, rate limits, observability and cost tracking.
11. Add snapshot reproducibility and invalidation rules.
12. Connect the Recommendation Engine only through the Research Snapshot contract.
