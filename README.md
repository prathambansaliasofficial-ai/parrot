# Parrot AI

**An agentic study companion that helps students learn by teaching, using their own university's material.**

Parrot AI was developed for **Fetch-A-Thon 3.0** (powered by ASI:1). It combines study resources from [FreeResources.in](https://freeresources.in) with an interactive AI tutor, so students can practise recall, explain concepts, and receive feedback without moving between separate tools.

- **Live demo:** https://parrot-lac.vercel.app
- **Hackathon result:** [Add: outcome announced 28 October 2026, or "Not placed" / "Participant"]
- **Presentation / demo video:** [Add link]

## Problem

Students collect notes, previous-year questions, assignments, reference books and syllabus documents from many places. Using an AI tool on those materials usually means downloading and re-uploading them, which breaks the study flow. A general-purpose chatbot also does not know which topics matter for a particular university's exams.

## Solution

Parrot works alongside the study materials. A student opens a resource and asks Parrot to quiz them. The student explains the answer in their own words; Parrot compares it with the course material, identifies what is correct or missing, and asks a follow-up question.

**Core loop:** open a course resource → request a quiz → explain the answer → receive material-grounded feedback.

## Relationship to FreeResources.in

FreeResources.in is the independent, long-term academic resource platform. Parrot AI is a separate, complementary project built for the hackathon. The two are designed to work together but have distinct scopes. See the [FreeResources repository](https://github.com/prathambansaliasofficial-ai/freesources).

## Project Status

**Working prototype with a real AKTU dataset.** The following components are implemented in this repository:

| Component | Description |
|---|---|
| `freeresources/` | Next.js 16 / React 19 / TypeScript / Tailwind web app: resource catalogue, admin portal, Parrot study widget, AKTU document pipeline |
| `backend/` | FastAPI service (`/api/v1/*`): resource catalogue, tutoring, quiz and teach-back evaluation |
| `agent/` | Fetch.ai uAgent that routes chat requests to the backend tutor endpoints |
| `supabase/migrations/` | Legacy Supabase schema retained for existing deployments |

**Planned, not yet implemented:** integrations with Notion and Google Calendar, an in-site coding practice panel, and OCR of scanned resources. Agent Chat Protocol / MCP tool exposure follows the chosen Agentverse and ASI:One integration path.

> **Note for the author:** an earlier version of this README listed PostgreSQL + pgvector and S3 storage as planned, while the implementation uses Cloudflare D1 and R2. Confirm which is accurate before publishing.

## Architecture and Data Policy

- **Cloudflare D1:** academic metadata (institutions, curricula, subjects, resource records, approval state, audit history).
- **Cloudflare R2:** document binaries (original and optimised AKTU PDFs).
- **GitHub:** source code, migrations, the import/export pipeline and the AKTU metadata manifest (`freeresources/data/aktu/manifest.json`). PDFs, database files and credentials are never committed.

The dataset can be reproduced from the manifest:

```sh
cd freeresources
npm run data:aktu:export   # build the manifest from the audit and local database
npm run data:aktu:verify   # validate hashes, sources, counts and classifications
npm run data:aktu:import   # apply metadata to D1 (local by default)
```

## Deployment

The root `vercel.json` defines two services: `backend` (FastAPI) and `frontend` (Next.js, built from `freeresources/`). Requests to `/api/v1/` are routed to the backend; all other requests are served by the Next.js app.

Required environment variables include `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `CORS_ORIGINS`. Without the D1 variables the deployment renders an empty catalogue. The Fetch.ai uAgent is a persistent process and is hosted separately; set its `PARROT_API_BASE_URL` to the deployed base URL.

Full setup instructions: [`DEVELOPMENT.md`](./DEVELOPMENT.md). Document classification audit: [`freeresources/docs/AKTU-AUDIT.md`](./freeresources/docs/AKTU-AUDIT.md).

## Technology Stack

Next.js, React, TypeScript, Tailwind CSS · Python, FastAPI · Fetch.ai uAgents, Agentverse, ASI:One · Cloudflare D1 and R2 · Vercel

## Responsible Use

- Parrot supports learning and exam preparation; it does not promise exam results.
- Answers are grounded in the selected resources where available, and the tutor indicates when the material does not support a confident answer.
- Only verified academic records are imported. Demonstration data is never placed in the student-facing catalogue, and replies produced without an AI key are labelled as demo mode.

## Team and Contribution

[Add: team members and your specific contribution, e.g. "Developed the FastAPI backend and the Fetch.ai agent integration".]
