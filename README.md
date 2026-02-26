# Self-Correction-Agent

This repository contains a prototype AI assistant called **Killua AI**.  
The project focuses on one core behavior: the assistant runs internal stages (`thinking`, `verifying`, `correcting`, `finalizing`) before returning a final response.

## Current Scope

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: TypeScript WebSocket server (`ws`)
- UI: chat interface with a placeholder sidebar for past conversations
- Streaming model: status updates first, then final output

## Repository Structure

```text
Self-Correction-Agent/
|-- backend/
|   |-- server.ts
|   |-- agent.ts
|   |-- pinecone.ts
|   `-- package.json
|-- frontend/
|   |-- src/
|   |   |-- App.tsx
|   |   |-- main.tsx
|   |   `-- index.css
|   `-- package.json
`-- README.md
```

## Prerequisites

- Node.js 20+ recommended
- npm

## Setup

### 1. Frontend

```bash
cd frontend
npm install
```

### 2. Backend

The current `backend/package.json` is minimal, so install runtime/dev dependencies manually if needed:

```bash
cd backend
npm install ws
npm install -D typescript ts-node @types/node @types/ws
```

## Run the Project

Start backend (Terminal 1):

```bash
cd backend
npx ts-node server.ts
```

Start frontend (Terminal 2):

```bash
cd frontend
npm run dev
```

Open the Vite URL shown in terminal (typically `http://localhost:5173`).

## WebSocket Contract

### Client to server

```json
{ "type": "start_analysis", "prompt": "Your question here" }
```

### Server to client (status events)

```json
{ "type": "status", "stage": "thinking" }
```

```json
{ "type": "status", "stage": "correcting" }
```

### Server to client (final event)

```json
{
  "type": "final",
  "content": "Backend processed successfully. Placeholder for AI result.",
  "justification": "Logic verified by user-defined constraints."
}
```

## Notes

- `backend/agent.ts` and `backend/pinecone.ts` are currently placeholders.
- Frontend currently simulates the loop in `App.tsx`; `frontend/useSockets.ts` exists and can be wired for live backend streaming.
