The Codebase Archaeologist

A submission for "The Hangover Part AI: Where’s My Context?" Hackathon

This project solves the "AI Amnesia" problem in legacy codebases. Standard AI assistants can read code, but they forget the history (Pull Requests, Slack debates, Jira tickets) that led to that code. We use Cognee to build a permanent, hybrid graph-vector memory of the codebase history.

Architecture

Frontend: React + TailwindCSS (Interactive visualizer of the Cognee memory state)

Backend: Python + FastAPI + Cognee (Handles ingestion and graph traversal)

🚀 Setup Instructions

1. Run the Python Backend (The Brain)

Open a terminal and navigate to the backend folder.

Create and activate a virtual environment:

python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate


Install the required packages:

pip install -r requirements.txt


Crucial: Cognee requires an LLM to generate embeddings and map relationships. Export your OpenAI or Gemini key:

export OPENAI_API_KEY="your-api-key-here"


Start the FastAPI server:

uvicorn main:app --reload


The server is now running on http://localhost:8000.

2. Run the React Frontend (The Visualizer)

If you are running this in a Next.js or Vite environment:

Paste the App.jsx code into your main component file.

Ensure you have lucide-react and tailwindcss installed in your frontend package.

Start your frontend development server (e.g., npm run dev).

3. How to Demo for the Judges

Open the Frontend UI in your browser.

Toggle the "Live Local Backend" switch to ON in the control panel.

Click the "1. Ingest Data" button. This sends our mock history to Cognee, triggering cognee.add() and cognee.cognify(). Watch the terminal running the backend to see Cognee mapping the graph!

Click "2. Synthesize". The React app will hit the /ask endpoint.

Show the judges the graph nodes lighting up, and point out how the LLM successfully connected the code to the Jira ticket and Slack message!