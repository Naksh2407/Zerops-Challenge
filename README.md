# The Codebase Archaeologist

A submission for the **WeMakeDevs Zerops Hackathon**.

This project solves the "AI Amnesia" problem in legacy codebases. Standard AI assistants can read code, but they forget the history (Pull Requests, Slack debates, Jira tickets) that led to that code. We use Cognee to build a permanent, hybrid graph-vector memory of the codebase history.

## Architecture & Zerops Integration

This project is built using a modern decoupled architecture, specifically designed to run highly available and scalable on **Zerops**.

*   **Frontend (React + TailwindCSS + Vite):** An interactive visualizer of the Cognee memory state. It's deployed as a highly optimized **Static Service** on Zerops.
*   **Backend (Python + FastAPI + Cognee):** The brain of the operation, handling data ingestion and graph traversal. It runs as a **Python 3.12 Service** on Zerops, providing a robust API layer for the frontend.

By using Zerops, we abstract away the complex infrastructure required to run a Python AI backend and a Node-built static frontend simultaneously, defining the entire pipeline in a single `zerops.yml` file.

## 🚀 How to Deploy on Zerops (For Judges)

We have configured a `zerops.yml` file to make deployment instantaneous. 

### Step 1: Create a Project
1. Log into your [Zerops Dashboard](https://app.zerops.io/).
2. Create a new project named `codebase-archaeologist`.

### Step 2: Import the Repository
1. In your new project, click on **Add Service**.
2. Select **Import from GitHub** (or GitLab/Bitbucket depending on where you host this).
3. Connect this repository. 
4. Zerops will automatically detect the `zerops.yml` in the root of the repository and create both the `backend` and `frontend` services.

### Step 3: Configure Environment Variables
Before triggering the build, you need to set up the LLM API Key on the backend. We recommend using a free Gemini key!
1. Go to the `backend` service in the Zerops GUI.
2. Navigate to **Environment variables**.
3. Add a new variable: `GEMINI_API_KEY` with your free Google AI Studio key.
4. Save and trigger the build.

### Step 4: Link Frontend to Backend
1. Once the `backend` service is running, go to its settings and **Enable Public Access**. Copy the public URL (e.g., `https://backend-1234.zerops.app`).
2. Go to the `frontend` service in the Zerops GUI.
3. Navigate to **Environment variables**.
4. Add a new variable: `VITE_API_URL` and paste the backend's public URL.
5. Re-trigger the `frontend` build so Vite bakes the URL into the static assets.

### Step 5: Demo Time!
1. Enable Public Access on the `frontend` service and click the link to open the app.
2. Toggle the "Live Local Backend" switch to ON (this now connects to the live Zerops backend).
3. Click "1. Ingest Data" to send mock history to Cognee and watch the graph map!
4. Click "2. Synthesize" to watch the LLM successfully connect code to Jira and Slack.

---

## Local Development Setup

If you want to run this locally instead of on Zerops:

1. **Backend:** Navigate to `backend`, run `python -m venv venv`, activate it, `pip install -r requirements.txt`, set `export GEMINI_API_KEY="your-key"`, and start with `uvicorn main:app --reload`.
2. **Frontend:** Navigate to `frontend`, run `npm install`, set your `.env` (or default to localhost:8000), and start with `npm run dev`.