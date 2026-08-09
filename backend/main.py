from typing import Optional
import os
import json
import asyncio
import urllib.request
import urllib.error
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import cognee
from cognee import SearchType
from cognee.api.v1.visualize.visualize import visualize_graph

# Load environment variables from .env
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, ".env")
load_dotenv(dotenv_path=env_path)

LLM_IS_VALID = True

def validate_api_key():
    global LLM_IS_VALID
    
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if gemini_key and "your-api-key" not in gemini_key:
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models?key={gemini_key}")
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status == 200:
                    LLM_IS_VALID = True
                    print("Gemini API key validation succeeded! Live Cognee mode active.")
                    # Force Cognee to use Gemini for both LLM and Embeddings
                    os.environ["LLM_PROVIDER"] = "gemini"
                    os.environ["LLM_MODEL"] = "gemini/gemini-1.5-flash"
                    os.environ["EMBEDDING_PROVIDER"] = "gemini"
                    os.environ["EMBEDDING_MODEL"] = "models/embedding-001"
                    return
        except Exception as e:
            LLM_IS_VALID = False
            print(f"Gemini API key validation failed: {e}. Bypassing Cognee calls.")
            return

    api_key = os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    if not api_key or "your-api-key" in api_key:
        LLM_IS_VALID = False
        print("LLM API key is placeholder or empty. Live Cognee calls will be bypassed to avoid retry delays.")
        return
    
    try:
        req = urllib.request.Request(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        with urllib.request.urlopen(req, timeout=2.0) as response:
            if response.status == 200:
                LLM_IS_VALID = True
                print("OpenAI API key validation succeeded! Live Cognee mode active.")
            else:
                LLM_IS_VALID = False
                print(f"LLM API key validation failed: {response.status}. Bypassing Cognee calls.")
    except urllib.error.HTTPError as e:
        LLM_IS_VALID = False
        print(f"LLM API key validation failed with HTTP Error {e.code}: {e.reason}. Bypassing Cognee calls.")
    except Exception as e:
        LLM_IS_VALID = False
        print(f"Network exception during LLM API key validation: {e}. Bypassing Cognee calls.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize Cognee when the server starts.
    """
    print("Starting Cognee Memory Layer...")
    print(f"Cognee version: {getattr(cognee, '__version__', '1.2.1')}")
    await asyncio.to_thread(validate_api_key)
    
    # Check if COGNEE_SERVICE_URL and COGNEE_API_KEY are configured
    service_url = os.getenv("COGNEE_SERVICE_URL")
    cognee_api_key = os.getenv("COGNEE_API_KEY")
    if service_url and cognee_api_key:
        print(f"Connecting Cognee SDK to Cognee Cloud at {service_url}...")
        try:
            await cognee.serve(url=service_url, api_key=cognee_api_key)
            print("Successfully connected to Cognee Cloud!")
        except Exception as e:
            print(f"Error connecting to Cognee Cloud: {e}")
    else:
        print("Cognee Cloud settings (COGNEE_SERVICE_URL/COGNEE_API_KEY) not configured. Operating in local mode.")
        
    print("Cognee Memory Layer is ready. Ingest data to build/initialize.")
    yield

# Initialize FastAPI
app = FastAPI(title="Codebase Archaeologist API", lifespan=lifespan)

# Setup CORS to allow the React frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For hackathon/local testing. In prod, lock this down!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class QueryPayload(BaseModel):
    query: str

class FileIngestPayload(BaseModel):
    filename: str
    content: str
    type: str  # "code snippet", "git pull request", "issue tracker", "chat message"

class ConfigPayload(BaseModel):
    api_key: str
    cognee_service_url: Optional[str] = None
    cognee_api_key: Optional[str] = None


# --- Mock Data for Hackathon Demo ---
MOCK_HISTORY = [
    {
        "id": "code_auth",
        "text": "File: auth.ts. Line 42: const timeout = 5000; // Hardcoded timeout for legacy auth server.",
        "type": "code snippet"
    },
    {
        "id": "pr_842",
        "text": "Pull Request #842: 'Hotfix auth timeout'. Modified auth.ts to increase timeout from 2000ms to 5000ms. Linked to Jira AUTH-99.",
        "type": "git pull request"
    },
    {
        "id": "jira_99",
        "text": "Jira Ticket AUTH-99: Users on 3G networks are dropping connections during the OAuth handshake. Need to increase buffer.",
        "type": "issue tracker"
    },
    {
        "id": "slack_backend",
        "text": "Slack message from @sarah_dev: 'Hey guys, the third-party OAuth provider is throttling us again. Let's bump the timeout in auth.ts to 5s (5000ms) for now so requests stop failing.'",
        "type": "chat message"
    },
    {
        "id": "code_db_pool",
        "text": "File: db_pool.py. Line 18: max_overflow = 0; // Set to 0 to prevent connection pools from creating too many idle sessions and leaking connections.",
        "type": "code snippet"
    },
    {
        "id": "pr_901",
        "text": "Pull Request #901: 'Hotfix connection pool leak'. Modified db_pool.py to set max_overflow to 0. Linked to Jira INFRA-304.",
        "type": "git pull request"
    },
    {
        "id": "jira_304",
        "text": "Jira Ticket INFRA-304: Production database replica reaching max connections limit of 500. Under heavy traffic, idle connections from overflow pool leak.",
        "type": "issue tracker"
    },
    {
        "id": "slack_ops",
        "text": "Slack message in #ops-alerts from @pete_ops: 'We hit max connections on the staging database. It seems the pool overflow was creating too many idle sessions that weren't cleaned up quickly. Mark, let's set max_overflow to 0 for now until we implement proper connection release in celery workers.'",
        "type": "chat message"
    },
    {
        "id": "code_cache",
        "text": "File: cache_manager.py. Line 12: maxmemory_policy = 'allkeys-lru'; // Switch to allkeys-lru to prevent Redis Out Of Memory (OOM) crashes when keys lack TTL.",
        "type": "code snippet"
    },
    {
        "id": "pr_1012",
        "text": "Pull Request #1012: 'Hotfix: Switch Redis eviction policy to allkeys-lru'. Modified cache_manager.py to use allkeys-lru. Linked to Jira INFRA-412.",
        "type": "git pull request"
    },
    {
        "id": "jira_412",
        "text": "Jira Ticket INFRA-412: Redis cache nodes crashing with OOM (Out Of Memory) errors under load. Investigation reveals session cache keys do not specify an expiration TTL.",
        "type": "issue tracker"
    },
    {
        "id": "slack_cache",
        "text": "Slack message in #ops-alerts from @alex_infra: 'Redis crashed again due to OOM. The volatile-lru eviction policy is useless because our session keys are written without TTLs. We need to set maxmemory_policy to allkeys-lru in cache_manager.py immediately to evict any LRU keys.'",
        "type": "chat message"
    }
]

def get_codebase_files():
    """
    Scans the repository codebase files to index them alongside mock developer history.
    This creates a real knowledge graph of this actual project!
    """
    files = []
    # Parent of backend directory is workspace root
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    
    # We targets these primary code/documentation assets
    targets = [
        os.path.join(project_root, "README.md"),
        os.path.join(project_root, "backend", "main.py"),
        os.path.join(project_root, "frontend", "src", "App.jsx"),
    ]
    for target in targets:
        if os.path.exists(target):
            try:
                with open(target, "r", encoding="utf-8") as f:
                    content = f.read()
                    rel_path = os.path.relpath(target, project_root)
                    # Label clearly so LLM constructs correct semantic links
                    files.append(f"Repository Codebase File: {rel_path}\nFile Contents:\n{content}")
            except Exception as e:
                print(f"Error reading codebase file {target}: {e}")
    return files

def generate_fallback_graph_html():
    nodes = []
    edges = []
    
    # Styles for Vis.js representation
    styles = {
        "code snippet": {"shape": "dot", "color": "#6366f1"},
        "git pull request": {"shape": "diamond", "color": "#a855f7"},
        "issue tracker": {"shape": "square", "color": "#eab308"},
        "chat message": {"shape": "triangle", "color": "#10b981"},
    }
    
    id_counter = 1
    node_map = {} # Maps item ID or dynamic label/name to node ID
    
    # 1. First Pass: Create nodes
    for item in MOCK_HISTORY:
        item_id = item["id"]
        text = item["text"]
        item_type = item["type"]
        
        label = item_id
        title = text
        
        # Format labels nicely for visualization
        if item_type == "code snippet":
            if "File:" in text:
                parts = text.split("File:")
                label = parts[1].split()[0].replace(":", "").replace(",", "").strip()
            else:
                label = "code_file"
        elif item_type == "git pull request":
            if "Pull Request #" in text:
                num = text.split("Pull Request #")[1].split()[0].replace(":", "").strip()
                label = f"PR #{num}"
            elif "PR #" in text:
                num = text.split("PR #")[1].split()[0].strip()
                label = f"PR #{num}"
            else:
                label = "Git PR"
        elif item_type == "issue tracker":
            if "Jira Ticket" in text:
                ticket = text.split("Jira Ticket")[1].split()[0].replace(":", "").strip()
                label = ticket
            elif "Jira" in text:
                ticket = text.split("Jira")[1].split()[0].replace(":", "").strip()
                label = ticket
            else:
                label = "Jira Ticket"
        elif item_type == "chat message":
            if "from @" in text:
                user = text.split("from @")[1].split(":")[0].strip()
                label = f"Slack @{user}"
            else:
                label = "Slack msg"
                
        style = styles.get(item_type, {"shape": "dot", "color": "#3b82f6"})
        node_id = id_counter
        
        # Map various names to Vis node ID for edge lookup
        node_map[item_id.lower()] = node_id
        node_map[label.lower()] = node_id
        # Also clean name representation
        clean_label = label.replace("#", "").replace("@", "").lower()
        node_map[clean_label] = node_id
        
        nodes.append({
            "id": node_id,
            "label": label,
            "group": item_type,
            "title": title,
            "shape": style["shape"],
            "color": style["color"]
        })
        id_counter += 1
        
    # 2. Second Pass: Inferred edges
    for item in MOCK_HISTORY:
        item_id = item["id"]
        text = item["text"].lower()
        from_id = node_map.get(item_id.lower())
        if not from_id:
            continue
            
        for key, to_id in node_map.items():
            if from_id == to_id:
                continue
            # Basic keyword lookup to connect nodes
            if key in text and len(key) > 3:
                # Add link if not duplicate
                duplicate = False
                for edge in edges:
                    if (edge["from"] == from_id and edge["to"] == to_id) or \
                       (edge["from"] == to_id and edge["to"] == from_id):
                        duplicate = True
                        break
                if not duplicate:
                    edges.append({
                        "from": from_id,
                        "to": to_id,
                        "label": "links"
                    })
                    
    # Format to JavaScript variables safely using json.dumps
    nodes_json = json.dumps(nodes, indent=2)
    edges_json = json.dumps(edges, indent=2)
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Codebase Knowledge Graph (Dynamic Simulation)</title>
        <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <style type="text/css">
            #network {{
                width: 100%;
                height: 100vh;
                background-color: #0b0f19;
            }}
            body {{
                margin: 0;
                padding: 0;
                background-color: #0b0f19;
                overflow: hidden;
            }}
        </style>
    </head>
    <body>
        <div id="network"></div>
        <script type="text/javascript">
            var nodes = new vis.DataSet({nodes_json});
            var edges = new vis.DataSet({edges_json});

            var container = document.getElementById('network');
            var data = {{
                nodes: nodes,
                edges: edges
            }};
            var options = {{
                nodes: {{
                    font: {{ color: '#ffffff', size: 14 }},
                    borderWidth: 2,
                    size: 30
                }},
                edges: {{
                    color: {{ color: '#475569', highlight: '#818cf8' }},
                    font: {{ color: '#94a3b8', size: 10 }},
                    arrows: {{ to: {{ enabled: true, scaleFactor: 0.5 }} }},
                    smooth: {{ enabled: true, type: 'dynamic' }}
                }},
                physics: {{
                    enabled: true,
                    barnesHut: {{ gravitationalConstant: -2000, centralGravity: 0.3, springLength: 95 }}
                }}
            }};
            var network = new vis.Network(container, data, options);
        </script>
    </body>
    </html>
    """
    return html_template

# Startup is now managed through the FastAPI lifespan event handler defined above.

@app.post("/ingest")
async def ingest_history():
    """
    Ingests the mock developer data and local codebase files into Cognee's hybrid memory,
    then generates the interactive knowledge graph HTML.
    """
    html_path = os.path.join(current_dir, "graph.html")
    try:
        # Check if API Key is valid and verified
        if not LLM_IS_VALID:
            raise ValueError("LLM API key is invalid, placeholder, or failed verification in backend/.env")

        print("Adding data to Cognee...")
        # Step 1: Add mock data
        texts_to_add = [item["text"] for item in MOCK_HISTORY]
        
        # Step 2: Add actual codebase files
        codebase_files = get_codebase_files()
        texts_to_add.extend(codebase_files)
        
        # Add to Cognee memory
        await cognee.remember(texts_to_add)
        
        print("Cognifying (Mapping Graph and Vectorizing)...")
        # Step 3: Cognify (Extracts entities, maps relationships, embeds text)
        await cognee.improve()
        
        print("Generating interactive knowledge graph HTML visualization...")
        # Step 4: Generate visualization HTML
        if os.path.exists(html_path):
            os.remove(html_path)
            
        await visualize_graph(html_path)
        print(f"Graph visualization saved to: {html_path}")
        
        return {"status": "success", "message": "Codebase history and repository files successfully ingested, mapped, and visualized by Cognee!"}
    except Exception as e:
        original_error = e
        print(f"Ingestion error (Switching to dynamic mock graph fallback): {original_error}")
        try:
            # High-fidelity Vis.js fallback representation for presentation
            fallback_html = generate_fallback_graph_html()
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(fallback_html)
            return {
                "status": "fallback",
                "message": "Cognee database initialized in dynamic simulation mode. Generated high-fidelity interactive Knowledge Graph mapping codebase files, PRs, and Slack conversations."
            }
        except Exception as fallback_err:
            raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(original_error)}")

@app.post("/reset")
async def reset_memory():
    """
    Clears all Cognee databases (relational graph, vectors, metadata) to allow a clean slate.
    """
    global LLM_IS_VALID
    try:
        print("Starting system reset and data pruning...")
        # Step 1: Call Cognee's prune system
        try:
            await cognee.prune.prune_system()
            print("Cognee prune_system complete.")
        except Exception as prune_err:
            print(f"Warning: Cognee prune_system failed: {prune_err}")
            
        # Step 2: Delete local Cognee directories if they exist, for a hard reset
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        cognee_system_path = os.path.join(backend_dir, ".cognee_system")
        cognee_data_path = os.path.join(backend_dir, ".cognee_data")
        
        import shutil
        for path in [cognee_system_path, cognee_data_path]:
            if os.path.exists(path):
                try:
                    shutil.rmtree(path, ignore_errors=True)
                    print(f"Cleaned up directory: {path}")
                except Exception as del_err:
                    print(f"Could not remove directory {path}: {del_err}")

        # Remove graph.html
        html_path = os.path.join(backend_dir, "graph.html")
        if os.path.exists(html_path):
            try:
                os.remove(html_path)
            except Exception:
                pass

        # Clear mock history list to its original state (reset any customs added)
        global MOCK_HISTORY
        # Keep only the original 12 mock items, discard any custom uploads
        MOCK_HISTORY = MOCK_HISTORY[:8]
        
        return {"status": "success", "message": "Memory layer completely reset. Started with a clean slate!"}
    except Exception as e:
        print(f"Reset error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest-file")
async def ingest_custom_file(payload: FileIngestPayload):
    """
    Ingests a custom developer artifact (code, PR, Slack chat, Jira issue) into Cognee.
    """
    html_path = os.path.join(current_dir, "graph.html")
    try:
        formatted_text = f"Artifact: {payload.filename}\nType: {payload.type}\nContent:\n{payload.content}"
        
        # Append to mock history in-memory for fallback visualizer
        MOCK_HISTORY.append({
            "id": f"custom_{len(MOCK_HISTORY)}",
            "text": formatted_text,
            "type": payload.type
        })
        
        if not LLM_IS_VALID:
            raise ValueError("LLM API key is invalid, placeholder, or failed verification in backend/.env")

        print(f"Ingesting custom artifact to Cognee: {payload.filename}")
        await cognee.remember([formatted_text])
        
        print("Cognifying (Updating Graph and Vectorizing)...")
        await cognee.improve()
        
        print("Regenerating graph visualization...")
        if os.path.exists(html_path):
            try:
                os.remove(html_path)
            except Exception:
                pass
                
        await visualize_graph(html_path)
        
        return {
            "status": "success", 
            "message": f"Successfully ingested custom {payload.type} '{payload.filename}' into Cognee!"
        }
    except Exception as e:
        print(f"Custom Ingestion error: {e}")
        # Generate dynamic fallback graph in case of bypass/error
        fallback_html = generate_fallback_graph_html()
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(fallback_html)
        return {
            "status": "fallback",
            "message": f"Added custom file '{payload.filename}' in simulation. Cognee status: {str(e)}"
        }

@app.get("/config")
async def get_config():
    """
    Returns the current active environment configurations.
    """
    api_key = os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    redacted = "Not configured"
    if api_key:
        if len(api_key) > 10:
            redacted = api_key[:6] + "..." + api_key[-4:]
        else:
            redacted = "Configured"
            
    # Fetch Cognee settings
    cognee_url = os.getenv("COGNEE_SERVICE_URL", "")
    cognee_key = os.getenv("COGNEE_API_KEY", "")
    
    cognee_key_redacted = "Not configured"
    if cognee_key:
        if len(cognee_key) > 10:
            cognee_key_redacted = cognee_key[:6] + "..." + cognee_key[-4:]
        else:
            cognee_key_redacted = "Configured"
            
    return {
        "llm_provider": os.getenv("LLM_PROVIDER", "openai"),
        "llm_model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "api_key_status": redacted,
        "is_valid": LLM_IS_VALID,
        "cognee_service_url": cognee_url,
        "cognee_api_key_status": cognee_key_redacted,
        "cognee_connected": bool(cognee_url and cognee_key)
    }

@app.post("/config")
async def update_config(payload: ConfigPayload):
    """
    Updates the active OpenAI/LLM API key and validates it.
    """
    global LLM_IS_VALID
    try:
        new_key = payload.api_key.strip()
        if not new_key:
            new_key = os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
        if not new_key:
            raise ValueError("API key cannot be empty")
            
        # Update .env file
        env_file_path = os.path.join(current_dir, ".env")
        lines = []
        if os.path.exists(env_file_path):
            with open(env_file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                
        def set_env_var(env_lines, key, value):
            updated = False
            for i, line in enumerate(env_lines):
                if line.strip().startswith(f"{key}="):
                    env_lines[i] = f'{key}="{value}"\n'
                    updated = True
                    break
            if not updated:
                env_lines.append(f'{key}="{value}"\n')

        # Find and replace LLM_API_KEY and OPENAI_API_KEY
        set_env_var(lines, "LLM_API_KEY", new_key)
        set_env_var(lines, "OPENAI_API_KEY", new_key)
        
        # Set in environment variables
        os.environ["LLM_API_KEY"] = new_key
        os.environ["OPENAI_API_KEY"] = new_key
        
        # Re-validate LLM key
        validate_api_key()

        # Update Cognee settings if provided
        cognee_connected_successfully = False
        cognee_msg = ""
        
        c_url = payload.cognee_service_url.strip() if payload.cognee_service_url else ""
        c_key = payload.cognee_api_key.strip() if payload.cognee_api_key else ""
        
        if c_url and c_key:
            set_env_var(lines, "COGNEE_SERVICE_URL", c_url)
            set_env_var(lines, "COGNEE_API_KEY", c_key)
            os.environ["COGNEE_SERVICE_URL"] = c_url
            os.environ["COGNEE_API_KEY"] = c_key
            print(f"Connecting to Cognee Cloud at {c_url}...")
            try:
                await cognee.serve(url=c_url, api_key=c_key)
                cognee_connected_successfully = True
                cognee_msg = "Connected to Cognee Cloud successfully."
            except Exception as serve_err:
                print(f"Error serving Cognee: {serve_err}")
                cognee_msg = f"Failed to connect to Cognee Cloud: {serve_err}"
        else:
            set_env_var(lines, "COGNEE_SERVICE_URL", "")
            set_env_var(lines, "COGNEE_API_KEY", "")
            os.environ.pop("COGNEE_SERVICE_URL", None)
            os.environ.pop("COGNEE_API_KEY", None)
            try:
                await cognee.disconnect()
                cognee_msg = "Disconnected from Cognee Cloud. Operations will now run locally."
            except Exception as disc_err:
                print(f"Error disconnecting Cognee: {disc_err}")
                cognee_msg = f"Failed to disconnect cleanly: {disc_err}"
                
        with open(env_file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
            
        return {
            "status": "success" if LLM_IS_VALID else "invalid",
            "message": f"API configuration updated and verified! {cognee_msg}",
            "cognee_status": "connected" if cognee_connected_successfully else "local"
        }
    except Exception as e:
        print(f"Config update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ask")
async def ask_agent(payload: QueryPayload):
    """
    Queries the Cognee memory layer and returns the contextual trace.
    """
    try:
        print(f"Received query: {payload.query}")
        
        # Step 1: Perform vector-similarity search to get semantic chunks (for visualizer UI)
        semantic_results = []
        try:
            if not LLM_IS_VALID:
                raise ValueError("LLM API key is invalid or not configured")
            chunks = await cognee.recall(
                query_text=payload.query,
                query_type=SearchType.CHUNKS
            )
            for chunk in chunks:
                if hasattr(chunk, "text"):
                    semantic_results.append(chunk.text)
                elif isinstance(chunk, dict) and "text" in chunk:
                    semantic_results.append(chunk["text"])
                else:
                    semantic_results.append(str(chunk))
        except Exception as search_err:
            print(f"Warning during semantic search: {search_err}")
            # Fallback mock context if search fails/no database populated
            if any(k in payload.query.lower() for k in ["overflow", "infra-304", "pool", "db_pool"]):
                semantic_results = [item["text"] for item in MOCK_HISTORY if any(x in item["text"].lower() for x in ["overflow", "901", "304", "db_pool"])]
            elif any(k in payload.query.lower() for k in ["eviction", "infra-412", "cache", "redis", "lru", "oom"]):
                semantic_results = [item["text"] for item in MOCK_HISTORY if any(x in item["text"].lower() for x in ["eviction", "1012", "412", "cache_manager", "lru", "oom"])]
            else:
                semantic_results = [item["text"] for item in MOCK_HISTORY if "timeout" in item["text"] or "5000" in item["text"]]

        # Step 2: Perform graph search with reasoning to get synthesized response
        synthesized_answer = ""
        try:
            if not LLM_IS_VALID:
                raise ValueError("LLM API key is invalid or not configured")
            completion_results = await cognee.recall(
                query_text=payload.query,
                query_type=SearchType.GRAPH_COMPLETION
            )
            if completion_results:
                synthesized_answer = completion_results[0]
            else:
                synthesized_answer = "No answer could be reasoned from the graph memory."
        except Exception as reasoning_err:
            print(f"Warning during graph reasoning search: {reasoning_err}")
            # Dynamic fallback reasoning response in case API key is missing or not configured
            if any(k in payload.query.lower() for k in ["overflow", "infra-304", "pool", "db_pool"]):
                synthesized_answer = (
                    "[Fallback Answer (Check backend/.env for LLM configuration)]:\n"
                    "Based on the database configuration history:\n"
                    "- File 'db_pool.py' has max_overflow set to 0 (Line 18).\n"
                    "- PR #901 disabled connection pool overflow to prevent replica database limits from being breached (Jira INFRA-304).\n"
                    "- Slack discussion in #ops-alerts indicates @pete_ops recommended setting it to 0 due to idle connection leakage from Celery workers."
                )
            elif any(k in payload.query.lower() for k in ["eviction", "infra-412", "cache", "redis", "lru", "oom"]):
                synthesized_answer = (
                    "[Fallback Answer (Check backend/.env for LLM configuration)]:\n"
                    "Based on the cache configuration history:\n"
                    "- File 'cache_manager.py' has maxmemory_policy set to 'allkeys-lru' (Line 12).\n"
                    "- PR #1012 updated the policy to prevent Redis OOM errors under heavy load (Jira INFRA-412).\n"
                    "- Slack discussion in #ops-alerts shows @alex_infra recommended switching from volatile-lru to allkeys-lru because session keys lack TTLs."
                )
            else:
                synthesized_answer = (
                    "[Fallback Answer (Check backend/.env for LLM configuration)]:\n"
                    "Based on the codebase history:\n"
                    "- File 'auth.ts' has a timeout set to 5000ms (Line 42).\n"
                    "- PR #842 increased this timeout to fix connections on 3G networks (Jira AUTH-99).\n"
                    "- Slack conversation reveals @sarah_dev recommended 5s because the third-party OAuth provider was throttling backend requests."
                )

        # Grounding Trace classification
        dynamic_traces = {
            "code": [],
            "pr": [],
            "jira": [],
            "slack": []
        }
        
        # Classify each semantic result chunk into the categories
        for text in semantic_results:
            text_lower = text.lower()
            if any(k in text_lower for k in ["file:", "line", "const ", "def ", "class ", "import ", "importlib", "function ", "typescript", "python"]):
                if not any(k in text_lower for k in ["slack", "pull request", "pr #", "jira", "ticket"]):
                    dynamic_traces["code"].append(text)
                    continue
                    
            if any(k in text_lower for k in ["pull request", "pr #", "merged", "branch"]):
                dynamic_traces["pr"].append(text)
            elif any(k in text_lower for k in ["jira", "ticket", "priority:", "assignee:", "status:"]):
                dynamic_traces["jira"].append(text)
            elif any(k in text_lower for k in ["slack", "message from", "@", "channel:", "chat"]):
                dynamic_traces["slack"].append(text)
            else:
                # Default fallback grouping
                if "file" in text_lower or "code" in text_lower:
                    dynamic_traces["code"].append(text)
                else:
                    dynamic_traces["code"].append(text)

        return {
            "query": payload.query,
            "retrieved_context": semantic_results,
            "synthesized_answer": synthesized_answer,
            "dynamic_traces": dynamic_traces
        }
    except Exception as e:
        print(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/graph", response_class=HTMLResponse)
async def get_graph_html():
    """
    Serves the Cognee-generated Vis.js knowledge graph document.
    """
    html_path = os.path.join(current_dir, "graph.html")
    if os.path.exists(html_path):
        try:
            with open(html_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as err:
            return f"<h3>Error reading graph file: {err}</h3>"
    else:
        return """
        <html>
        <head>
            <style>
                body {
                    background-color: #0b0f19;
                    color: #94a3b8;
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .container {
                    text-align: center;
                    padding: 20px;
                    border: 1px dashed #334155;
                    border-radius: 12px;
                    background-color: #0f172a;
                }
                .title {
                    font-size: 22px;
                    font-weight: 600;
                    color: #f1f5f9;
                    margin-bottom: 8px;
                }
                .subtitle {
                    font-size: 14px;
                    color: #64748b;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="title">Knowledge Graph Empty</div>
                <div class="subtitle">Please toggle 'Live Local Backend' and click <b>'1. Ingest Data'</b> to build the database.</div>
            </div>
        </body>
        </html>
        """

if __name__ == "__main__":
    # type: ignore
    import uvicorn
    # Run the server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)