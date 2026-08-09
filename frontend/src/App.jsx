import React, { useState, useEffect, useRef } from 'react';
import { 
  Network, Search, Cpu, Layers, MessageSquare, Zap, 
  Database, Server, ServerOff, Loader2, Code, GitPullRequest, 
  FileText, CheckCircle2, AlertCircle, ShieldAlert, 
  Terminal, History, ExternalLink, HelpCircle, Eye, RefreshCw,
  Clock, Filter, Info, X, ChevronRight, CornerDownRight, Settings, Trash2, Upload
} from 'lucide-react';

// Pre-defined Query Presets
const PRESET_QUERIES = [
  {
    id: "timeout_reason",
    label: "Why is the timeout set to 5000ms in auth.ts?",
    query: "Why is the timeout set to 5000ms in auth.ts?",
    context: "auth.ts, PR #842, Jira AUTH-99, Slack #backend"
  },
  {
    id: "3g_issue",
    label: "Trace Jira ticket AUTH-99 impact",
    query: "What issue was reported in Jira ticket AUTH-99 and how was it solved?",
    context: "Jira AUTH-99, PR #842"
  },
  {
    id: "slack_throttle",
    label: "Why was the auth timeout increased by Sarah?",
    query: "What did Sarah mention in Slack regarding OAuth server throttling?",
    context: "Slack #backend, auth.ts"
  },
  {
    id: "pool_leak",
    label: "Why is db_pool max_overflow set to 0?",
    query: "Why is max_overflow set to 0 in db_pool.py?",
    context: "db_pool.py, PR #901, Jira INFRA-304, Slack #ops"
  },
  {
    id: "redis_oom",
    label: "Why is cache maxmemory_policy set to allkeys-lru?",
    query: "Why is maxmemory_policy set to allkeys-lru in cache_manager.py?",
    context: "cache_manager.py, PR #1012, Jira INFRA-412, Slack #ops"
  }
];

// Dynamic registry initial documents list
const INITIAL_DOCUMENTS = [
  // Auth Timeout Case
  { id: "code_auth", filename: "auth.ts", type: "code snippet", category: "code", label: "auth.ts (Line 42)", color: "text-blue-400 border-blue-500/30", content: `// Legacy authentication endpoint configuration
const authConfig = {
  url: "https://auth.legacy-service.internal/v2",
  retryCount: 3,
  // Bumping timeout to avoid OAuth handshake failures on slower networks
  timeout: 5000; // Hardcoded timeout for legacy auth server. Originally 2000ms.
};` },
  { id: "pr_842", filename: "PR #842", type: "git pull request", category: "pr", label: "Pull Request #842", color: "text-purple-400 border-purple-500/30", content: `Author: @mark_dev
Title: Hotfix: Increase authentication timeout
Branch: hotfix/auth-timeout -> main
Status: Merged

Description:
- Modified auth.ts to increase OAuth timeout from 2000ms to 5000ms.
- This is a temporary bypass for legacy auth latency.
- Linked Issue: Jira AUTH-99` },
  { id: "jira_99", filename: "Jira AUTH-99", type: "issue tracker", category: "jira", label: "AUTH-99", color: "text-yellow-400 border-yellow-500/30", content: `Key: AUTH-99
Priority: High
Reporter: Quality Assurance
Assignee: @mark_dev
Status: Closed

Summary: OAuth handshake dropping connections on mobile clients
Description:
Users on 3G and high-latency mobile networks are experiencing connection drops
during the OAuth authorization handshake phase. Need to increase read buffers
and timeouts to handle the lag.` },
  { id: "slack_backend", filename: "Slack #backend-dev", type: "chat message", category: "slack", label: "#backend-dev", color: "text-emerald-400 border-emerald-500/30", content: `[@sarah_dev] [10:42 AM]:
"Hey guys, the third-party OAuth provider is throttling our legacy server again.
Let's bump the timeout in auth.ts to 5s (5000ms) for now so requests stop failing.
Otherwise mobile auth will keep failing with handshakes timeouts."` },

  // DB Pool Leak Case
  { id: "code_db_pool", filename: "db_pool.py", type: "code snippet", category: "code", label: "db_pool.py (Line 18)", color: "text-blue-400 border-blue-500/30", content: `# db_pool.py - Production Database Connection Pool Config
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql://prod_db_replica:5432/main",
    pool_size=20,
    # Bumping max_overflow to 0 temporarily to prevent Postgres connection exhaustion.
    # Originally max_overflow=10. See Jira INFRA-304.
    max_overflow=0,
    pool_recycle=1800
);` },
  { id: "pr_901", filename: "PR #901", type: "git pull request", category: "pr", label: "Pull Request #901", color: "text-purple-400 border-purple-500/30", content: `Author: @mark_dev
Title: Hotfix: Disable connection pool overflow
Branch: hotfix/db-overflow-leak -> main
Status: Merged

Description:
- Modified db_pool.py to set max_overflow to 0.
- Prevents PostgreSQL connection limits from being breached under spike load.
- Linked Issue: Jira INFRA-304` },
  { id: "jira_304", filename: "Jira INFRA-304", type: "issue tracker", category: "jira", label: "INFRA-304", color: "text-yellow-400 border-yellow-500/30", content: `Key: INFRA-304
Priority: Critical
Reporter: @pete_ops
Assignee: @mark_dev
Status: Closed

Summary: Postgres replica reaching max connection limit of 500
Description:
During high traffic hours, the replica db pool is hitting max connections,
causing 500 Internal Server Errors. We suspect connection leaking from
celery tasks that don't correctly return connections to the pool.` },
  { id: "slack_ops", filename: "Slack #ops-alerts", type: "chat message", category: "slack", label: "#ops-alerts", color: "text-emerald-400 border-emerald-500/30", content: `[@pete_ops] [4:15 PM]:
"We hit max connections on the staging database. It seems the pool overflow was
creating too many idle sessions that weren't cleaned up quickly. Mark, let's set
max_overflow to 0 for now until we implement proper connection release in celery workers."` },

  // Redis OOM Case
  { id: "code_cache", filename: "cache_manager.py", type: "code snippet", category: "code", label: "cache_manager.py (Line 12)", color: "text-blue-400 border-blue-500/30", content: `# cache_manager.py - Cache Configuration
import redis

cache_pool = redis.ConnectionPool(host='redis-cache-cluster', port=6379, db=0)

# Switching maxmemory eviction policy to prevent OOM
# Originally maxmemory_policy='volatile-lru'
# See Jira INFRA-412 for details on session keys missing TTLs.
maxmemory_policy = "allkeys-lru";` },
  { id: "pr_1012", filename: "PR #1012", type: "git pull request", category: "pr", label: "Pull Request #1012", color: "text-purple-400 border-purple-500/30", content: `Author: @mark_dev
Title: Hotfix: Switch Redis eviction policy to allkeys-lru
Branch: hotfix/redis-oom-fix -> main
Status: Merged

Description:
- Modified cache_manager.py to change maxmemory_policy to allkeys-lru.
- This forces eviction of any key under LRU algorithm when Redis memory limit is reached.
- Linked Issue: Jira INFRA-412` },
  { id: "jira_412", filename: "Jira INFRA-412", type: "issue tracker", category: "jira", label: "INFRA-412", color: "text-yellow-400 border-yellow-500/30", content: `Key: INFRA-412
Priority: Critical
Reporter: @alex_infra
Assignee: @mark_dev
Status: Closed

Summary: Redis cluster experiencing Out of Memory (OOM) errors under load
Description:
Under heavy API load, our Redis caching layer reaches its configured maximum memory.
Because many API session tokens are set without explicit expiration TTLs, the current
volatile-lru policy is unable to evict them, causing nodes to crash.` },
  { id: "slack_cache", filename: "Slack #ops-alerts (Redis)", type: "chat message", category: "slack", label: "#ops-alerts", color: "text-emerald-400 border-emerald-500/30", content: `[@alex_infra] [2:30 PM]:
"Redis crashed again due to OOM. The volatile-lru eviction policy is useless because
our session keys are written without TTLs. Mark, let's set maxmemory_policy to allkeys-lru
in cache_manager.py immediately to force eviction of any LRU keys when we hit the memory limit."` }
];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  // Pipeline Toggles
  const [vectorOn, setVectorOn] = useState(true);
  const [graphOn, setGraphOn] = useState(true);
  const [llmOn, setLlmOn] = useState(true);
  const [useLocalBackend, setUseLocalBackend] = useState(false);
  const [viewMode, setViewMode] = useState('pipeline'); // 'pipeline' or 'graph'
  const [activePage, setActivePage] = useState('oracle'); // 'oracle', 'graph', 'vault', 'trace', 'console'

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyRedacted, setApiKeyRedacted] = useState("Not configured");
  const [apiKeyValid, setApiKeyValid] = useState(false);
  
  // Cognee Cloud Settings State
  const [cogneeServiceUrlInput, setCogneeServiceUrlInput] = useState("");
  const [cogneeApiKeyInput, setCogneeApiKeyInput] = useState("");
  const [cogneeServiceUrl, setCogneeServiceUrl] = useState("");
  const [cogneeApiKeyRedacted, setCogneeApiKeyRedacted] = useState("Not configured");
  const [cogneeConnected, setCogneeConnected] = useState(false);
  
  // Workspace tabs
  const [workspaceTab, setWorkspaceTab] = useState("query"); // "query" or "ingest"
  
  // Dynamic traces state
  const [dynamicTraces, setDynamicTraces] = useState(null);
  
  // Custom file form state
  const [customFilename, setCustomFilename] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [customType, setCustomType] = useState("code snippet"); // default

  // Filter state for the Interactive Graph
  const [activeFilters, setActiveFilters] = useState({
    code: true,
    pr: true,
    jira: true,
    slack: true
  });

  // Dynamic Ingestion Registry State
  const [ingestedDocuments, setIngestedDocuments] = useState(INITIAL_DOCUMENTS);
  const [selectedDocId, setSelectedDocId] = useState("code_auth");
  const [queryHistory, setQueryHistory] = useState([
    { query: "Why is the timeout set to 5000ms in auth.ts?", timestamp: new Date().toLocaleTimeString().substring(0, 5) }
  ]);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState(999);

  // UI State
  const [selectedNode, setSelectedNode] = useState('user');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentQueryId, setCurrentQueryId] = useState(null);
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState("code");

  // Data State
  const [userQuery, setUserQuery] = useState("Why is the timeout set to 5000ms in auth.ts?");
  const [vectorDataStr, setVectorDataStr] = useState("Found 1 match:\n- file: frontend/auth.ts (Line 42)\n- similarity: 0.94\n- content: 'const timeout = 5000;'");
  const [graphDataStr, setGraphDataStr] = useState("Path Traversed:\n1. (auth.ts) modified in (PR #842)\n2. (PR #842) fixes (Jira AUTH-99)\n3. (Jira AUTH-99) debated in (Slack #backend)");
  const [llmResponse, setLlmResponse] = useState("");
  const [ingestStatus, setIngestStatus] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    { type: 'info', text: 'Initializing Archeologist Console...' },
    { type: 'success', text: 'Console active. Ready for excavation.' }
  ]);

  const logContainerRef = useRef(null);

  // Auto Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Terminal Logging Helper
  const addLog = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev, { text: `[${timestamp}] ${text}`, type }]);
  };

  // Load current config from backend on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/config`);
        if (res.ok) {
          const data = await res.json();
          setApiKeyRedacted(data.api_key_status);
          setApiKeyValid(data.is_valid);
          setCogneeServiceUrl(data.cognee_service_url || "");
          setCogneeApiKeyRedacted(data.cognee_api_key_status || "Not configured");
          setCogneeConnected(data.cognee_connected || false);
          
          if (data.cognee_service_url) {
            setCogneeServiceUrlInput(data.cognee_service_url);
          }
          
          if (data.is_valid) {
            setUseLocalBackend(true);
            addLog("Verified live backend LLM credentials. Operational mode set to Live Oracle.", "success");
          } else {
            addLog("Warning: Live backend LLM credentials are unconfigured or invalid. Defaulting to Simulated Sandbox.", "error");
          }
          if (data.cognee_connected) {
            addLog(`Grounded database is routed to Cognee Cloud at ${data.cognee_service_url}`, "success");
          }
        }
      } catch (err) {
        console.log("Could not contact backend config:", err);
      }
    };
    fetchConfig();
  }, []);

  const handleReset = async () => {
    setIsProcessing(true);
    addLog(`Sending POST request to FastAPI: ${API_URL}/reset`, "info");
    addLog("Purging all vector indices, graphs, and cached databases...", "info");
    
    try {
      if (useLocalBackend) {
        const res = await fetch(`${API_URL}/reset`, { method: 'POST' });
        if (!res.ok) throw new Error("Backend reset failed.");
        const data = await res.json();
        addLog(`Cognee backend: ${data.message}`, "success");
      } else {
        addLog("Cognee backend simulator: Memory pruned. Reset complete.", "success");
      }
      setDynamicTraces(null);
      setLlmResponse("");
      setIngestStatus("");
      setVectorDataStr("No matches found. Memory cleared.");
      setGraphDataStr("No relational nodes traversed. Memory cleared.");
      setIngestedDocuments(INITIAL_DOCUMENTS);
      setSelectedDocId("code_auth");
      addLog("Excavation site has been cleared back to bare bedrock.", "success");
    } catch (err) {
      addLog(`Reset Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCustomIngest = async () => {
    if (!customFilename.trim() || !customContent.trim()) {
      addLog("Custom Ingest Error: Filename and Content are required.", "error");
      return;
    }
    setIsProcessing(true);
    setIngestStatus("");
    addLog(`Ingesting custom ${customType} artifact: "${customFilename}"...`, "info");
    
    try {
      // Add custom document to the dynamic registry in the frontend
      const catMap = {
        "code snippet": "code",
        "git pull request": "pr",
        "issue tracker": "jira",
        "chat message": "slack"
      };
      const typeMap = {
        "code snippet": "Source Code File",
        "git pull request": "Git Pull Request",
        "issue tracker": "Jira Issue Tracker",
        "chat message": "Slack Chat Message"
      };
      const colorMap = {
        "code snippet": "text-blue-400 border-blue-500/30",
        "git pull request": "text-purple-400 border-purple-500/30",
        "issue tracker": "text-yellow-400 border-yellow-500/30",
        "chat message": "text-emerald-400 border-emerald-500/30"
      };
      const newDoc = {
        id: `custom_${Date.now()}`,
        filename: customFilename,
        type: typeMap[customType] || customType,
        category: catMap[customType] || "code",
        label: customFilename,
        color: colorMap[customType] || "text-slate-400 border-slate-500/30",
        content: customContent
      };
      setIngestedDocuments(prev => [...prev, newDoc]);
      setSelectedDocId(newDoc.id);

      if (useLocalBackend) {
        const res = await fetch(`${API_URL}/ingest-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: customFilename,
            content: customContent,
            type: customType
          })
        });
        if (!res.ok) throw new Error("Backend custom file ingestion failed.");
        const data = await res.json();
        addLog(`Cognee Ingestion: ${data.message}`, data.status === 'success' ? 'success' : 'info');
        setIngestStatus(`Custom Ingested: ${customFilename}`);
      } else {
        // Simulated Custom Ingest
        setTimeout(() => {
          addLog(`Inferred entity: ${customFilename}. Mapping dynamic graph nodes...`, "info");
          addLog(`Vis.js dynamically updated with custom ${customType}!`, "success");
          setIngestStatus(`Success (Sim): Ingested ${customFilename}`);
          setIsProcessing(false);
        }, 1200);
        return;
      }
    } catch (err) {
      addLog(`Custom Ingestion Error: ${err.message}`, "error");
      setIngestStatus(`Error: ${err.message}`);
    } finally {
      setCustomFilename("");
      setCustomContent("");
      setIsProcessing(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsProcessing(true);
    addLog("Saving active configuration to backend...", "info");
    
    try {
      const res = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKeyInput,
          cognee_service_url: cogneeServiceUrlInput,
          cognee_api_key: cogneeApiKeyInput
        })
      });
      if (!res.ok) throw new Error("Failed to save backend configuration.");
      const data = await res.json();
      
      if (data.status === "success") {
        setApiKeyValid(true);
        setUseLocalBackend(true);
        addLog("Active LLM API key verified and operational.", "success");
      } else {
        setApiKeyValid(false);
        addLog("Warning: LLM API key validation failed on backend.", "error");
      }
      
      if (apiKeyInput.trim()) {
        const redacted = apiKeyInput.trim();
        setApiKeyRedacted(redacted.substring(0, 6) + "..." + redacted.substring(redacted.length - 4));
      }
      
      if (data.cognee_status === "connected") {
        setCogneeConnected(true);
        setCogneeServiceUrl(cogneeServiceUrlInput.trim());
        if (cogneeApiKeyInput.trim()) {
          const redacted = cogneeApiKeyInput.trim();
          setCogneeApiKeyRedacted(redacted.substring(0, 6) + "..." + redacted.substring(redacted.length - 4));
        }
        addLog(`Successfully connected to Cognee Cloud at: ${cogneeServiceUrlInput}`, "success");
      } else {
        setCogneeConnected(false);
        setCogneeServiceUrl("");
        setCogneeApiKeyRedacted("Not configured");
        addLog("Reverted Cognee database storage to local/self-hosted mode.", "info");
      }
      
      setShowSettingsModal(false);
      setApiKeyInput("");
      setCogneeApiKeyInput("");
    } catch (err) {
      addLog(`Config Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Ingest Data (Calls local Python server)
  const handleIngest = async () => {
    setIsProcessing(true);
    setIngestStatus("");
    addLog("Initiating data ingestion pipeline...", "info");
    addLog("Scanning workspace directories...", "info");
    addLog("Indexing repository: main.py, App.jsx, README.md", "info");

    const repoFiles = [
      {
        id: "repo_readme",
        filename: "README.md",
        type: "Source Code File",
        category: "code",
        label: "README.md",
        color: "text-blue-400 border-blue-500/30",
        content: `# Codebase Archaeologist - AI Forensic Engine\nThis hackathon project solves the "AI Amnesia" problem by loading repository context and developer histories into Cognee.`
      },
      {
        id: "repo_main",
        filename: "main.py",
        type: "Source Code File",
        category: "code",
        label: "main.py (FastAPI)",
        color: "text-blue-400 border-blue-500/30",
        content: `import os\nfrom fastapi import FastAPI\nimport cognee\n\napp = FastAPI(title="Codebase Archaeologist API")\n\n@app.post("/ask")\nasync def ask_agent(payload: QueryPayload):\n    # Core Cognee Recall Reasoning Core...`
      },
      {
        id: "repo_app",
        filename: "App.jsx",
        type: "Source Code File",
        category: "code",
        label: "App.jsx (React)",
        color: "text-blue-400 border-blue-500/30",
        content: `import React, { useState } from 'react';\nimport { Database, Search } from 'lucide-react';\n\nexport default function App() {\n  const [ingestedDocuments, setIngestedDocuments] = useState(INITIAL_DOCUMENTS);\n  # Ingest and dynamic graph mapping...`
      }
    ];
    setIngestedDocuments(prev => {
      const filtered = prev.filter(d => !d.id.startsWith("repo_"));
      return [...filtered, ...repoFiles];
    });

    if (!useLocalBackend) {
      // Simulate Sandbox Ingestion
      setTimeout(() => {
        addLog("Loaded 4 local mock historical elements.", "info");
        addLog("Processing Cognee Graph Mapping & Embeddings generation...", "info");
        setTimeout(() => {
          addLog("Cognee cognify complete: Created hybrid vector/graph map.", "success");
          setIngestStatus("Success: (Simulation) Ingested mock data and mapped relationships!");
          setIsProcessing(false);
        }, 1500);
      }, 1000);
      return;
    }

    // Call Real Backend
    try {
      addLog(`Sending POST request to FastAPI: ${API_URL}/ingest`, "info");
      const res = await fetch(`${API_URL}/ingest`, { method: 'POST' });
      if (!res.ok) throw new Error("FastAPI backend failed.");
      const data = await res.json();
      addLog(`Cognee backend: ${data.message}`, "success");
      setIngestStatus(`Success: ${data.message}`);
    } catch (error) {
      addLog(`Error: ${error.message}. Is backend running on port 8000?`, "error");
      setIngestStatus(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Synthesize (Calls local server or runs Simulated Response)
  const handleSynthesize = async (queryToUse = userQuery) => {
    if (!llmOn) return;
    setIsProcessing(true);
    setLlmResponse("");
    setSelectedNode('llm');
    addLog(`Synthesizing context trace for query: "${queryToUse}"`, "info");

    if (useLocalBackend) {
      // CALL LIVE PYTHON/COGNEE BACKEND
      try {
        addLog("Retrieving hybrid context from Cognee (/ask)...", "info");
        const res = await fetch(`${API_URL}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryToUse })
        });
        if (!res.ok) throw new Error("Backend API failed.");
        const data = await res.json();

        // Update UI with real Cognee data
        addLog("Retrieved vector similarity context chunks.", "success");
        setVectorDataStr(JSON.stringify(data.retrieved_context, null, 2));
        addLog("Traversed graph relationships successfully.", "success");
        setGraphDataStr("Data mapped via Cognee API traversal.");
        
        // Simulating writing response
        setLlmResponse(data.synthesized_answer);
        addLog("LLM synthesized grounded answer successfully.", "success");

        if (data.dynamic_traces) {
          setDynamicTraces({
            code: {
              title: "Code Files",
              type: "Source Code",
              icon: Code,
              color: "text-blue-400 border-blue-500/30",
              content: data.dynamic_traces.code.join("\n\n---\n\n") || "No source code grounding retrieved."
            },
            pr: {
              title: "Pull Requests",
              type: "Git Pull Request",
              icon: GitPullRequest,
              color: "text-purple-400 border-purple-500/30",
              content: data.dynamic_traces.pr.join("\n\n---\n\n") || "No pull request grounding retrieved."
            },
            jira: {
              title: "Jira Tickets",
              type: "Jira Issue Tracker",
              icon: FileText,
              color: "text-yellow-400 border-yellow-500/30",
              content: data.dynamic_traces.jira.join("\n\n---\n\n") || "No Jira issues grounding retrieved."
            },
            slack: {
              title: "Slack Chats",
              type: "Slack Chat Message",
              icon: MessageSquare,
              color: "text-emerald-400 border-emerald-500/30",
              content: data.dynamic_traces.slack.join("\n\n---\n\n") || "No Slack chat grounding retrieved."
            }
          });
        } else {
          setDynamicTraces(null);
        }
      } catch (error) {
        addLog(`Error connecting to ask endpoint: ${error.message}`, "error");
        setLlmResponse(`Error: ${error.message}. Ensure Python server is running.`);
        setDynamicTraces(null);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // SIMULATED/GEMINI SANDBOX MODE
      addLog("Running in sandbox preview. Indexing document registry...", "info");
      setTimeout(() => {
        // Tokenize query
        const queryLower = queryToUse.toLowerCase();
        const tokens = queryLower
          .split(/\W+/)
          .filter(t => t.length > 2 && !["what", "explain", "why", "where", "the", "and", "for", "with", "this", "that", "how", "was", "set", "get", "use"].includes(t));

        // Find matching documents
        const scoredDocs = ingestedDocuments.map(doc => {
          let score = 0;
          const filenameLower = doc.filename.toLowerCase();
          const contentLower = doc.content.toLowerCase();
          
          tokens.forEach(token => {
            if (filenameLower.includes(token)) score += 10; // High match score for title
            const regex = new RegExp(token, 'g');
            const matches = contentLower.match(regex);
            if (matches) score += matches.length; // 1 point per keyword occurrence
          });
          
          return { doc, score };
        }).filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score);

        let response = "";
        let foundDocs = [];
        
        if (scoredDocs.length > 0) {
          foundDocs = scoredDocs.slice(0, 3).map(item => item.doc);
          const topDoc = foundDocs[0];
          
          // Select the top document in the evidence locker automatically!
          setSelectedDocId(topDoc.id);

          response = `### [Sandbox Reasoning Engine - Grounded Answer]\n\nBased on your query, the following matching evidence was recovered from the knowledge base:\n\n`;
          
          foundDocs.forEach((doc, idx) => {
            // Extract a relevant sentence containing keywords
            const lines = doc.content.split('\n');
            const matchingLines = lines.filter(line => 
              tokens.some(t => line.toLowerCase().includes(t))
            ).slice(0, 2);
            
            response += `#### ${idx + 1}. ${doc.type}: ${doc.filename}\n`;
            if (matchingLines.length > 0) {
              response += `* "... ${matchingLines.join('\n  ... ')} ..."\n\n`;
            } else {
              response += `* (Referenced as a core source document)\n\n`;
            }
          });

          // Generate a custom contextual summary
          if (queryLower.includes("timeout") || queryLower.includes("5000")) {
            response += `**Forensic Summary:** auth.ts (Line 42) has the OAuth server timeout configured to 5000ms. This hotfix was merged in PR #842 by Mark Dev to resolve handshake drops on high-latency mobile networks reported in ticket AUTH-99, following Sarah's recommendation in Slack chats.`;
          } else if (queryLower.includes("overflow") || queryLower.includes("pool") || queryLower.includes("max_overflow")) {
            response += `**Forensic Summary:** db_pool.py (Line 18) sets max_overflow to 0. This change was committed in PR #901 to resolve connection replica drops (INFRA-304) after Pete Ops alerted that idle connections from Celery task tasks were exhausting connections.`;
          } else if (queryLower.includes("cache") || queryLower.includes("redis") || queryLower.includes("oom") || queryLower.includes("allkeys")) {
            response += `**Forensic Summary:** cache_manager.py (Line 12) switched the eviction policy to allkeys-lru in PR #1012. This was done to fix Redis cluster OOM exceptions (INFRA-412) since session cache keys were written without expirations, as noted by Alex Infra.`;
          } else {
            response += `**Forensic Summary:** General keyword matching has retrieved relevance inside ${topDoc.filename}. The system found multiple semantic overlaps. Double check this evidence inside the **Evidence Locker** tab.`;
          }

          setVectorDataStr(`Semantic Lookup: Found ${scoredDocs.length} matches.\n` + scoredDocs.map(item => `- ${item.doc.filename} (relevance score: ${item.score})`).join('\n'));
          setGraphDataStr(`Relational Graph: Traversed ${foundDocs.length} connected files.\n` + foundDocs.map(d => `${d.filename} [${d.type}]`).join(' -> '));

        } else {
          // Fallback if no matching keywords found
          response = `### [Sandbox Reasoning Engine]\n\nNo high-relevance evidence was found in the current document registry for "${queryToUse}". \n\n* **Tip:** Go to the **Knowledge Vault** tab to upload relevant codebase scripts, pull requests, or Slack chat history logs to populate the database.`;
          setVectorDataStr("No semantic matches found.");
          setGraphDataStr("No relational path traversed.");
        }

        // Add to query history
        setQueryHistory(prev => {
          // Avoid duplicates in history
          const filtered = prev.filter(h => h.query !== queryToUse);
          return [
            { query: queryToUse, timestamp: new Date().toLocaleTimeString().substring(0, 5) },
            ...filtered.slice(0, 9)
          ];
        });

        setLlmResponse(response);
        addLog("Simulated query complete.", "success");
        setIsProcessing(false);
      }, 1200);
    }
  };

  // Handle Preset Clicks
  const handleSelectPreset = (preset) => {
    setCurrentQueryId(preset.id);
    setUserQuery(preset.query);
    addLog(`Excavation preset selected: "${preset.label}"`, "info");
    handleSynthesize(preset.query);
  };

  // Helper for layout node state
  const getContextData = () => {
    const data = {};
    if (vectorOn) data.vector_retrieval = vectorDataStr;
    if (graphOn) data.graph_paths = graphDataStr;
    return JSON.stringify(data, null, 2);
  };

  const getLlmData = () => {
    if (!llmOn) return "Grounded synthesis is turned off.";
    if (isProcessing) return "Consulting Cognee memory blocks...";
    if (llmResponse) return llmResponse;
    return `Console idling. Select a preset query or click 'Synthesize' to search.`;
  };

  // Node details setup
  const nodes = {
    user: {
      id: 'user', title: "Excavation Query",
      icon: HelpCircle, active: true,
      color: "from-blue-500/20 to-blue-600/30 border-blue-500 text-blue-400 neon-border-blue",
      desc: "Developer queries the legacy codebase history to solve mystery parameters.",
      data: `User Query:\n"${userQuery}"`
    },
    vector: {
      id: 'vector', title: "Vector Memory Index",
      icon: Search, active: vectorOn,
      color: vectorOn ? "from-purple-500/20 to-purple-600/30 border-purple-500 text-purple-400 neon-border-purple" : "from-slate-900 to-slate-950 border-slate-800 text-slate-600",
      desc: "Performs semantic lookup for matching terms in codebase documents.",
      data: vectorOn ? vectorDataStr : "Feature Disabled."
    },
    graph: {
      id: 'graph', title: "Relational Knowledge Graph",
      icon: Network, active: graphOn,
      color: graphOn ? "from-emerald-500/20 to-emerald-600/30 border-emerald-500 text-emerald-400 neon-border-emerald" : "from-slate-900 to-slate-950 border-slate-800 text-slate-600",
      desc: "Cognee maps links between Git, Slack, Jira, and file assets.",
      data: graphOn ? graphDataStr : "Feature Disabled."
    },
    context: {
      id: 'context', title: "Context Aggregator",
      icon: Layers, active: vectorOn || graphOn,
      color: (vectorOn || graphOn) ? "from-amber-500/20 to-amber-600/30 border-amber-500 text-amber-400" : "from-slate-900 to-slate-950 border-slate-800 text-slate-600",
      desc: "Merges semantic chunks and relational paths into a cohesive LLM prompt context.",
      data: getContextData()
    },
    llm: {
      id: 'llm', title: "Cognee Augmented LLM",
      icon: Cpu, active: llmOn,
      color: llmOn ? "from-pink-500/20 to-pink-600/30 border-pink-500 text-pink-400 neon-border-pink" : "from-slate-900 to-slate-950 border-slate-800 text-slate-600",
      desc: "Grounded LLM synthesizes historical context, bypassing hallucination risks.",
      data: getLlmData()
    }
  };

  const getSelectedNodeData = () => {
    if (viewMode === 'graph' && activePage === 'graph') {
      if (selectedGraphNodeId === 999) {
        return {
          title: "Search Query Node",
          desc: "The root query focal point representing the developer search vector in Cognee memory.",
          data: `Query Input:\n"${userQuery}"\n\nActive Filter Layers:\n` + Object.entries(activeFilters).map(([k, v]) => `- ${k.toUpperCase()}: ${v ? 'Active' : 'Muted'}`).join('\n')
        };
      }
      // Find the document corresponding to the node index (docId is idx + 1)
      const docIndex = selectedGraphNodeId - 1;
      const docsToDisplay = ingestedDocuments.filter(d => activeFilters[d.category]);
      const doc = docsToDisplay[docIndex];
      if (doc) {
        return {
          title: `${doc.type}: ${doc.filename}`,
          desc: `Ingested memory block categorized under "${doc.category.toUpperCase()}". Grounding vector similarity matches can check contents below.`,
          data: doc.content
        };
      }
    }
    return nodes[selectedNode] || nodes.user;
  };

  const selectedNodeData = getSelectedNodeData();

  // Derived state to check if user query refers to connection pool configuration
  const isDbPoolQuery = userQuery.toLowerCase().includes("overflow") || userQuery.toLowerCase().includes("304") || userQuery.toLowerCase().includes("pool");
  const isCacheQuery = userQuery.toLowerCase().includes("cache") || userQuery.toLowerCase().includes("redis") || userQuery.toLowerCase().includes("oom") || userQuery.toLowerCase().includes("412") || userQuery.toLowerCase().includes("lru");

  // Dynamic Vis.js Knowledge Graph builder
  const getDynamicGraphData = () => {
    const nodes = [
      { id: 999, label: 'Search Query', category: 'query', title: `Query: "${userQuery}"`, x: 350, y: 240, info: `Root focal point of dynamic retrieval graph.` }
    ];
    const edges = [];
    
    const centerX = 350;
    const centerY = 240;
    const radius = 160;

    // Filter registry based on active graph filters
    const docsToDisplay = ingestedDocuments.filter(d => activeFilters[d.category]);
    
    docsToDisplay.forEach((doc, idx) => {
      const angle = (idx / docsToDisplay.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      const docId = idx + 1; // numeric node ids for Vis.js simulation
      
      nodes.push({
        id: docId,
        label: doc.filename,
        category: doc.category,
        title: `${doc.type}: ${doc.filename}`,
        x: Math.round(x),
        y: Math.round(y),
        info: doc.content.substring(0, 150) + "..."
      });
      
      edges.push({
        from: 999,
        to: docId,
        label: 'grounded'
      });
    });

    // Cross-link nodes that reference each other
    for (let i = 0; i < docsToDisplay.length; i++) {
      for (let j = i + 1; j < docsToDisplay.length; j++) {
        const docA = docsToDisplay[i];
        const docB = docsToDisplay[j];
        
        const keyA = docA.filename.toLowerCase().replace("pull request #", "pr #").replace("jira ", "");
        const keyB = docB.filename.toLowerCase().replace("pull request #", "pr #").replace("jira ", "");
        
        if (docA.content.toLowerCase().includes(keyB) || docB.content.toLowerCase().includes(keyA)) {
          edges.push({
            from: i + 1,
            to: j + 1,
            label: 'references'
          });
        }
      }
    }
    
    return { nodes, edges };
  };

  const { nodes: MOCK_GRAPH_NODES, edges: MOCK_GRAPH_EDGES } = getDynamicGraphData();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none cyber-grid scanline relative">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Orbitron:wght@400..900&family=Outfit:wght@100..900&display=swap');
        
        body {
          background-color: #04050d;
        }

        .font-sans {
          font-family: 'Outfit', sans-serif;
        }
        .font-mono {
          font-family: 'JetBrains Mono', monospace;
        }
        .font-orbitron {
          font-family: 'Orbitron', sans-serif;
        }

        /* Custom scrollbar */
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(9, 11, 26, 0.3);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.22);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.45);
        }

        @keyframes flow { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        .flowing-line { animation: flow 0.8s linear infinite; }
        
        @keyframes blink { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
        .animate-blink { animation: blink 1s infinite; }
        
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .glass-card {
          background: rgba(9, 11, 26, 0.45);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(99, 102, 241, 0.08);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
        }
        .glass-card-hover:hover {
          background: rgba(15, 18, 42, 0.65);
          border-color: rgba(99, 102, 241, 0.25);
          transform: translateY(-2px);
          box-shadow: 0 10px 40px rgba(99, 102, 241, 0.06);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes float-glow-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(60px, 40px) scale(1.1); }
        }
        @keyframes float-glow-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-50px, -60px) scale(0.9); }
        }
        @keyframes float-glow-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(40px, -30px) scale(1.15); }
        }
        .ambient-glow-1 {
          animation: float-glow-1 15s infinite ease-in-out;
        }
        .ambient-glow-2 {
          animation: float-glow-2 20s infinite ease-in-out;
        }
        .ambient-glow-3 {
          animation: float-glow-3 25s infinite ease-in-out;
        }
      `}</style>

      {/* GLOWING AMBIENT BACKGROUNDS */}
      <div className="absolute top-[-15%] left-[-10%] w-[65%] h-[65%] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none z-0 ambient-glow-1" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[65%] h-[65%] bg-purple-600/8 rounded-full blur-[150px] pointer-events-none z-0 ambient-glow-2" />
      <div className="absolute top-[30%] left-[30%] w-[45%] h-[45%] bg-cyan-600/6 rounded-full blur-[140px] pointer-events-none z-0 ambient-glow-3" />

      {/* PERMANENT LEFT SIDEBAR */}
      <aside className="w-64 flex flex-col border-r border-slate-900/60 bg-slate-950/70 backdrop-blur-2xl z-30 shrink-0 select-none shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        {/* LOGO AREA */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-900/60">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-950 to-slate-950 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)] pulsing-glow flex items-center justify-center">
            <Database className="text-indigo-400 w-4.5 h-4.5 neon-glow-indigo" />
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 font-orbitron select-none">
              ARCHAEOLOGIST
            </h1>
            <p className="text-[8px] tracking-wider text-indigo-400/80 font-bold uppercase font-mono">AI Forensic Layer</p>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { id: 'oracle', label: 'Oracle Hub', icon: MessageSquare, desc: 'Query amnesia history', color: 'text-purple-400', activeBg: 'bg-purple-950/20 border-purple-500/20 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.03)]' },
            { id: 'graph', label: 'Cognitive Graph', icon: Network, desc: 'Visual relational maps', color: 'text-emerald-400', activeBg: 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.03)]' },
            { id: 'vault', label: 'Knowledge Vault', icon: Database, desc: 'Ingestion pipeline data', color: 'text-amber-400', activeBg: 'bg-amber-950/20 border-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.03)]' },
            { id: 'trace', label: 'Evidence Locker', icon: Eye, desc: 'Trace grounding elements', color: 'text-cyan-400', activeBg: 'bg-cyan-950/20 border-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.03)]' },
            { id: 'console', label: 'System Console', icon: Terminal, desc: 'Execution logs & configs', color: 'text-rose-400', activeBg: 'bg-rose-950/20 border-rose-500/20 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.03)]' }
          ].map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-300 group ${isActive ? item.activeBg : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'}`}
              >
                <div className="relative shrink-0">
                  <item.icon className={`w-4 h-4 transition-transform duration-300 group-hover:scale-110 ${isActive ? item.color : 'text-slate-500 group-hover:text-slate-400'}`} />
                  {isActive && <span className={`absolute -right-1 -top-1 w-1.5 h-1.5 rounded-full ${item.color.replace('text-', 'bg-')}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono font-bold tracking-wide leading-none">{item.label}</div>
                  <div className="text-[9px] text-slate-500 font-sans mt-1.5 truncate leading-none">{item.desc}</div>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* CONNECTION & SYSTEM FOOTER */}
        <div className="p-4 border-t border-slate-900/60 bg-slate-950/40 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest">Environment</span>
            <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full uppercase font-black tracking-wide ${useLocalBackend ? 'bg-emerald-950/50 border border-emerald-500/20 text-emerald-400' : 'bg-amber-950/50 border border-amber-500/20 text-amber-400'}`}>
              {useLocalBackend ? 'Live Oracle' : 'Sim Sandbox'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${useLocalBackend ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${useLocalBackend ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            <span className="text-[10px] font-bold font-mono text-slate-400 truncate leading-none">
              {useLocalBackend ? 'Sync Active' : 'Sandbox Preview'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center justify-center gap-1.5 py-2 px-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80 text-[9px] font-black font-mono text-indigo-300 uppercase rounded-lg transition-all duration-200"
              title="Configure API Keys"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              CONFIG
            </button>
            <button 
              onClick={handleReset}
              disabled={isProcessing}
              className="flex items-center justify-center gap-1.5 py-2 px-2 bg-rose-950/15 hover:bg-rose-900/30 border border-rose-950/50 disabled:opacity-50 text-[9px] font-black font-mono text-rose-300 uppercase rounded-lg transition-all duration-200"
              title="Reset Memory Core"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              RESET
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN SCREEN WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden z-10">
        
        {/* VIEW: ORACLE HUB */}
        {activePage === 'oracle' && (
          <div className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
            {/* Page Header */}
            <div className="mb-6 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-black tracking-wide text-indigo-200 font-orbitron">ORACLE CHAT CORE</h2>
                <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-1">Grounded LLM Querying Platform powered by Cognee Relational Knowledge Memory</p>
              </div>
              
              <div className="flex gap-2">
                {/* Active settings indicators */}
                <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-xl text-[9px] font-mono text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  <span>Vector Index: <b>{vectorOn ? 'ON' : 'OFF'}</b></span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-xl text-[9px] font-mono text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Graph Index: <b>{graphOn ? 'ON' : 'OFF'}</b></span>
                </div>
              </div>
            </div>

            {/* Conversation Grid layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
              
              {/* Presets / Case studies panel (1/3 width) */}
              <div className="lg:col-span-1 flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl p-4">
                <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
                  
                  <div>
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest block mb-3 px-1">
                      Case Study Presets
                    </span>
                    <div className="space-y-2">
                      {PRESET_QUERIES.map((preset) => {
                        const isActive = currentQueryId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handleSelectPreset(preset)}
                            className={`w-full text-left p-3 rounded-xl border text-[11px] font-medium transition-all duration-300 flex flex-col gap-2 relative overflow-hidden group ${isActive ? 'bg-indigo-950/20 border-indigo-500/40 text-indigo-300' : 'bg-slate-900/20 border-slate-900/60 text-slate-400 hover:bg-slate-900/50 hover:border-slate-800 hover:text-slate-300'}`}
                          >
                            <div className="flex items-center gap-2">
                              <History className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400 animate-pulse' : 'text-slate-600 group-hover:text-slate-400'}`} />
                              <span className="font-mono font-bold leading-tight truncate">{preset.label}</span>
                            </div>
                            <div className="flex justify-between items-center mt-0.5">
                              <span className="text-[8px] font-mono text-slate-500 bg-slate-950/50 border border-slate-900 px-2 py-0.5 rounded truncate max-w-[200px]">{preset.context}</span>
                              <span className={`text-[8px] font-mono tracking-widest font-black uppercase transition-opacity duration-300 ${isActive ? 'opacity-100 text-indigo-400' : 'opacity-0 group-hover:opacity-100 text-slate-500'}`}>Investigate</span>
                            </div>
                            {isActive && <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {queryHistory.length > 0 && (
                    <div className="border-t border-slate-900/60 pt-4">
                      <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest block mb-3 px-1 flex justify-between items-center">
                        <span>Recent Searches</span>
                        <button 
                          onClick={() => setQueryHistory([])}
                          className="text-[8px] text-rose-500/80 hover:text-rose-450 font-mono tracking-wide"
                        >
                          CLEAR
                        </button>
                      </span>
                      <div className="space-y-1.5">
                        {queryHistory.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setUserQuery(item.query);
                              handleSynthesize(item.query);
                            }}
                            className="w-full text-left px-3.5 py-2.5 bg-slate-900/10 hover:bg-slate-900/30 border border-slate-900/40 hover:border-slate-800 rounded-xl text-[10px] font-mono text-slate-400 hover:text-slate-300 flex justify-between items-center transition-all duration-200"
                          >
                            <span className="truncate flex-1 pr-3">{item.query}</span>
                            <span className="text-[8px] text-slate-600 shrink-0 font-sans">{item.timestamp}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Chat & Response pane (2/3 width) */}
              <div className="lg:col-span-2 flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl overflow-hidden relative">
                
                {/* Search Form Panel */}
                <div className="p-4 border-b border-slate-900/60 bg-slate-950/60 backdrop-blur-xl flex flex-col gap-3 shrink-0">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={userQuery} 
                      onChange={(e) => {
                        setUserQuery(e.target.value);
                        setCurrentQueryId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && userQuery.trim() && !isProcessing) {
                          handleSynthesize(userQuery);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl py-3 pl-4 pr-24 text-xs font-semibold focus:outline-none focus:border-indigo-500/80 text-slate-200 transition-colors placeholder:text-slate-700 font-mono shadow-inner"
                      placeholder="Enter a query regarding codebase history, PR comments, or Slack threads..."
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      <button 
                        onClick={() => handleSynthesize(userQuery)}
                        disabled={isProcessing || !userQuery.trim()}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[10px] font-bold font-mono tracking-wider text-white border border-indigo-400/20 rounded-lg transition-colors flex items-center gap-1"
                        title="Query Oracle"
                      >
                        <span>ASK</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Response Slate */}
                <div className="flex-1 p-5 overflow-y-auto min-h-0 custom-scrollbar relative">
                  
                  {isProcessing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/50 backdrop-blur-sm z-10">
                      <div className="p-4 rounded-full bg-indigo-950/30 border border-indigo-500/20 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)] pulsing-glow flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                      </div>
                      <div className="text-center font-mono space-y-1.5">
                        <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider animate-pulse">Running Grounded Synthesis</p>
                        <p className="text-[9px] text-slate-500">Traversing knowledge relations and compiling code context...</p>
                      </div>
                    </div>
                  ) : null}

                  {llmResponse ? (
                    <div className="space-y-5 animate-fadeIn">
                      
                      {/* Synthesized Response Document */}
                      <div className="glass-card rounded-xl p-5 border border-indigo-500/10 shadow-lg relative">
                        {/* Title bar */}
                        <div className="flex items-center justify-between border-b border-slate-900/60 pb-3 mb-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-indigo-400" />
                            <span className="text-[10px] font-black font-mono uppercase tracking-widest text-indigo-300">
                              SYNTHESIZED FORENSIC REPORT
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-2 py-0.5 rounded uppercase font-black leading-none">
                              Cognee Verified
                            </span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(llmResponse);
                                addLog("Copied forensic report to clipboard.", "success");
                              }}
                              className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-colors text-[9px] font-mono leading-none"
                              title="Copy Answer"
                            >
                              COPY
                            </button>
                          </div>
                        </div>

                        {/* Text */}
                        <div className="font-sans text-xs leading-relaxed text-slate-200 whitespace-pre-wrap select-text selection:bg-indigo-500/20 pr-1">
                          {llmResponse}
                        </div>
                      </div>

                      {/* Quick Evidence Links */}
                      <div className="bg-slate-900/10 border border-slate-900 rounded-xl p-4">
                        <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block mb-2.5">
                          Linked Trace Grounding Evidence
                        </span>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { key: 'code', label: 'Source File', icon: Code, color: 'hover:border-blue-500/30 text-blue-400 hover:bg-blue-950/10' },
                            { key: 'pr', label: 'Git Pull Request', icon: GitPullRequest, color: 'hover:border-purple-500/30 text-purple-400 hover:bg-purple-950/10' },
                            { key: 'jira', label: 'Jira Issue Ticket', icon: FileText, color: 'hover:border-yellow-500/30 text-yellow-400 hover:bg-yellow-950/10' },
                            { key: 'slack', label: 'Slack Discussion', icon: MessageSquare, color: 'hover:border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/10' }
                          ].map((evidence) => (
                            <button
                              key={evidence.key}
                              onClick={() => {
                                setSelectedEvidenceKey(evidence.key);
                                setActivePage('trace');
                                addLog(`Navigated to Evidence Locker tab to inspect: ${evidence.key.toUpperCase()}`, 'info');
                              }}
                              className={`flex items-center gap-2 p-2.5 border border-slate-900 rounded-xl bg-slate-950/40 text-[10px] font-mono font-bold tracking-wide text-left transition-all duration-300 ${evidence.color}`}
                            >
                              <evidence.icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{evidence.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                      <div className="p-4 rounded-full bg-slate-900/50 border border-slate-900 text-slate-600 mb-4 flex items-center justify-center">
                        <MessageSquare className="w-8 h-8 text-slate-500" />
                      </div>
                      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">Oracle Hub Idle</h3>
                      <p className="text-[10px] text-slate-600 max-w-sm mt-2 leading-relaxed">
                        Select one of the case studies on the left panel or input a custom codebase question in the search bar above to trigger amnesia forensics.
                      </p>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW: COGNITIVE GRAPH */}
        {activePage === 'graph' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {/* View Selector Headers */}
            <div className="px-6 py-4 border-b border-slate-900/60 bg-slate-950/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-lg font-black tracking-wide text-emerald-200 font-orbitron">COGNITIVE GRAPH VIEWER</h2>
                <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-1">Visualize Cognee structured knowledge nodes and search pipeline flows</p>
              </div>

              <div className="flex items-center gap-3">
                {/* View toggles */}
                <div className="flex bg-slate-950/80 border border-slate-800 rounded-full p-0.5 shadow-lg">
                  <button
                    className={`text-[9px] font-black font-mono uppercase tracking-widest px-4 py-2 rounded-full transition-all duration-200 ${viewMode === 'pipeline' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    onClick={() => setViewMode('pipeline')}
                  >
                    Pipeline Flow
                  </button>
                  <button
                    className={`text-[9px] font-black font-mono uppercase tracking-widest px-4 py-2 rounded-full transition-all duration-200 ${viewMode === 'graph' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    onClick={() => setViewMode('graph')}
                  >
                    Knowledge Graph
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Area and Inspector split layout */}
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">
              
              {/* Canvas workspace (take up left part) */}
              <div className="flex-1 relative flex flex-col min-h-0 border-r border-slate-900/60">
                {viewMode === 'pipeline' ? (
                  /* PIPELINE MAP VIEWER */
                  <div className="flex-1 relative w-full h-full flex flex-col justify-center items-center p-6 select-none">
                    <div className="absolute top-6 left-6 text-slate-400 max-w-[280px]">
                      <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">Pipeline Flow Monitor</h3>
                      <p className="text-[9px] text-slate-500 mt-1 leading-normal font-mono">
                        Visualizing queries routed through the hybrid search indexing graph. Click nodes to inspect variables.
                      </p>
                    </div>

                    <div className="relative w-full max-w-xl aspect-square md:aspect-auto md:h-[450px] flex items-center justify-center">
                      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                        <defs>
                          <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
                          </linearGradient>
                          <linearGradient id="gradient-purple" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.8" />
                          </linearGradient>
                          <linearGradient id="gradient-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#34d399" stopOpacity="0.8" />
                          </linearGradient>
                          <linearGradient id="gradient-pink" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.8" />
                          </linearGradient>
                        </defs>
                        <line x1="50%" y1="12%" x2="20%" y2="40%" stroke={vectorOn ? "url(#gradient-purple)" : "#1e293b"} strokeWidth={vectorOn ? "2" : "1"} strokeDasharray={vectorOn ? "6 6" : "none"} className={vectorOn ? "flowing-line" : ""} />
                        <line x1="50%" y1="12%" x2="80%" y2="40%" stroke={graphOn ? "url(#gradient-emerald)" : "#1e293b"} strokeWidth={graphOn ? "2" : "1"} strokeDasharray={graphOn ? "6 6" : "none"} className={graphOn ? "flowing-line" : ""} />
                        <line x1="20%" y1="40%" x2="50%" y2="65%" stroke={vectorOn ? "url(#gradient-purple)" : "#1e293b"} strokeWidth={vectorOn ? "2" : "1"} strokeDasharray={vectorOn ? "6 6" : "none"} className={vectorOn ? "flowing-line" : ""} />
                        <line x1="80%" y1="40%" x2="50%" y2="65%" stroke={graphOn ? "url(#gradient-emerald)" : "#1e293b"} strokeWidth={graphOn ? "2" : "1"} strokeDasharray={graphOn ? "6 6" : "none"} className={graphOn ? "flowing-line" : ""} />
                        <line x1="50%" y1="65%" x2="50%" y2="88%" stroke={(vectorOn || graphOn) && llmOn ? "url(#gradient-pink)" : "#1e293b"} strokeWidth={(vectorOn || graphOn) && llmOn ? "2" : "1"} strokeDasharray={(vectorOn || graphOn) && llmOn ? "6 6" : "none"} className={(vectorOn || graphOn) && llmOn ? "flowing-line" : ""} />
                      </svg>

                      {/* CSS animation definitions */}
                      <style>{`
                        @keyframes flow { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
                        .flowing-line { animation: flow 0.8s linear infinite; }
                      `}</style>

                      {/* Nodes */}
                      {[
                        { id: 'user', label: 'Query Input', x: '50%', top: '12%', icon: HelpCircle, color: 'selectedNode === "user" ? "border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.35)]" : "border-slate-800 hover:border-slate-700"', textCol: 'text-blue-400', active: true },
                        { id: 'vector', label: 'Vector Index', x: '20%', top: '40%', icon: Search, color: 'selectedNode === "vector" ? "border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.35)]" : "border-slate-800 hover:border-slate-700"', textCol: 'text-purple-400', active: vectorOn },
                        { id: 'graph', label: 'Graph DB Core', x: '80%', top: '40%', icon: Network, color: 'selectedNode === "graph" ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]" : "border-slate-800 hover:border-slate-700"', textCol: 'text-emerald-400', active: graphOn },
                        { id: 'context', label: 'Aggregator', x: '50%', top: '65%', icon: Layers, color: 'selectedNode === "context" ? "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]" : "border-slate-800 hover:border-slate-700"', textCol: 'text-amber-400', active: vectorOn || graphOn },
                        { id: 'llm', label: 'Grounded LLM', x: '50%', top: '88%', icon: Cpu, color: 'selectedNode === "llm" ? "border-pink-500 shadow-[0_0_20px_rgba(244,63,94,0.35)]" : "border-slate-800 hover:border-slate-700"', textCol: 'text-pink-400', active: llmOn }
                      ].map((node, index) => {
                        const isNodeSelected = selectedNode === node.id;
                        return (
                          <div 
                            key={node.id}
                            className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 cursor-pointer transition-all duration-300 z-10 floating-node ${!node.active && 'opacity-30 bg-slate-950/20'}`}
                            style={{ left: node.x, top: node.top, animationDelay: `${index * 0.4}s` }}
                            onClick={() => setSelectedNode(node.id)}
                          >
                            <div className={`p-4 rounded-full border-2 bg-slate-950 transition-all duration-300 ${isNodeSelected ? 'scale-110' : 'hover:scale-105'} ${isNodeSelected ? (node.id === 'user' ? 'border-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.3)]' : node.id === 'vector' ? 'border-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.3)]' : node.id === 'graph' ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]' : node.id === 'context' ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.3)]' : 'border-pink-500 shadow-[0_0_25px_rgba(244,63,94,0.3)]') : 'border-slate-800 hover:border-slate-700'}`}>
                              <node.icon className={`w-5 h-5 ${isNodeSelected ? node.textCol : node.active ? 'text-slate-400' : 'text-slate-700'}`} />
                            </div>
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest px-2.5 py-0.5 bg-slate-950 border border-slate-850 rounded shadow-md leading-none">{node.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* KNOWLEDGE GRAPH VISUALIZER CANVAS */
                  <div className="flex-1 p-5 flex flex-col h-full overflow-hidden">
                    {/* Filters Toolbar */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-900 rounded-xl mb-4 z-10 shadow-lg shrink-0">
                      <div className="flex items-center gap-2 px-1">
                        <Filter className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                        <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest">Active Layers</span>
                      </div>

                      <div className="flex gap-2">
                        {Object.entries({
                          code: { label: "Files", color: "border-blue-500/20 text-blue-400 hover:bg-blue-950/15" },
                          pr: { label: "PRs", color: "border-purple-500/20 text-purple-400 hover:bg-purple-950/15" },
                          jira: { label: "Tickets", color: "border-yellow-500/20 text-yellow-400 hover:bg-yellow-950/15" },
                          slack: { label: "Chats", color: "border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/15" }
                        }).map(([key, item]) => (
                          <label 
                            key={key} 
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black font-mono cursor-pointer transition-all duration-205 select-none ${activeFilters[key] ? `bg-slate-900/60 border-indigo-500/30 ${item.color}` : 'bg-transparent border-transparent text-slate-600 hover:text-slate-400'}`}
                            onClick={() => {
                              const nextFilters = { ...activeFilters, [key]: !activeFilters[key] };
                              setActiveFilters(nextFilters);
                              addLog(`Graph filter updated: ${key.toUpperCase()} layer ${!activeFilters[key] ? 'ENABLED' : 'DISABLED'}`, 'info');
                            }}
                          >
                            <input type="checkbox" checked={activeFilters[key]} readOnly className="hidden" />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Canvas Canvas */}
                    <div className="flex-1 relative border border-slate-900 rounded-2xl bg-slate-950/60 overflow-hidden shadow-2xl flex items-center justify-center">
                      {useLocalBackend ? (
                        <iframe
                          src={`${API_URL}/graph`}
                          className="w-full h-full border-none"
                          title="Cognee Knowledge Graph Visualizer"
                        />
                      ) : (
                        /* Simulated Interactive Canvas */
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                          <div className="relative w-full h-full border border-slate-900/40 bg-slate-950/30 rounded-xl overflow-hidden shadow-inner">
                            <div className="absolute top-4 left-4 z-10 pointer-events-none select-none">
                              <span className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">Relational Canvas Node Map</span>
                            </div>

                            {/* Lines */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                              {MOCK_GRAPH_EDGES.map((edge, i) => {
                                const fromNode = MOCK_GRAPH_NODES.find(n => n.id === edge.from);
                                const toNode = MOCK_GRAPH_NODES.find(n => n.id === edge.to);
                                if (!fromNode || !toNode) return null;
                                
                                const isFromActive = fromNode.category === 'query' || activeFilters[fromNode.category];
                                const isToActive = toNode.category === 'query' || activeFilters[toNode.category];
                                if (!isFromActive || !isToActive) return null;

                                return (
                                  <g key={i}>
                                    <line x1={fromNode.x} y1={fromNode.y} x2={toNode.x} y2={toNode.y} stroke="#1e293b" strokeWidth="1.5" />
                                    <text 
                                      x={(fromNode.x + toNode.x) / 2} 
                                      y={(fromNode.y + toNode.y) / 2 - 5}
                                      fill="#475569" 
                                      fontSize="8"
                                      textAnchor="middle"
                                      fontFamily="monospace"
                                    >
                                      {edge.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>

                            {/* Node cards */}
                            {MOCK_GRAPH_NODES.map((node) => {
                              const isNodeActive = node.category === 'query' || activeFilters[node.category];
                              if (!isNodeActive) return null;
                              const isSelected = selectedGraphNodeId === node.id;
                              
                              return (
                                <div
                                  key={node.id}
                                  className={`absolute p-3 rounded-xl border bg-slate-950 hover:bg-slate-900 cursor-pointer transition-all duration-300 select-none shadow-md ${isSelected ? 'border-indigo-500 scale-105 shadow-[0_0_15px_rgba(99,102,241,0.25)]' : 'border-slate-900'}`}
                                  style={{ left: node.x - 60, top: node.y - 20 }}
                                  onClick={() => {
                                    setSelectedGraphNodeId(node.id);
                                    if (node.category !== 'query') {
                                      setSelectedEvidenceKey(node.category);
                                    }
                                    addLog(`Selected Graph node: ${node.label} (${node.category.toUpperCase()})`, 'info');
                                  }}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${node.category === 'query' ? 'bg-pink-500 animate-pulse' : node.category === 'code' ? 'bg-blue-500 animate-pulse' : node.category === 'pr' ? 'bg-purple-500' : node.category === 'jira' ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                                    <span className="text-[10px] font-bold font-mono text-slate-300">{node.label}</span>
                                  </div>
                                  <div className="text-[8px] text-slate-500 mt-1.5 font-sans leading-none">{node.title}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Node Inspector Side Panel (1/3 width, drawer) */}
              <div className="w-full lg:w-[350px] shrink-0 p-5 flex flex-col min-h-0 bg-slate-950/60 border-l border-slate-900/60 backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-3.5">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-bold font-mono text-slate-300 uppercase tracking-widest">
                    Node Inspector: {selectedNodeData.title}
                  </span>
                </div>
                
                <p className="text-[10px] text-slate-500 font-sans italic mb-4 leading-normal">
                  {selectedNodeData.desc}
                </p>

                <div className="flex-1 bg-slate-950/80 border border-slate-900 rounded-2xl p-4 overflow-y-auto custom-scrollbar relative shadow-inner">
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedNodeData.data);
                        addLog(`Copied Inspector node details: ${selectedNodeData.title}`, 'success');
                      }}
                      className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 text-slate-500 hover:text-slate-300 border border-slate-800/85 text-[8px] font-mono rounded transition-colors"
                      title="Copy Data"
                    >
                      COPY
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {selectedNodeData.data}
                  </pre>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW: KNOWLEDGE VAULT */}
        {activePage === 'vault' && (
          <div className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
            {/* Page Header */}
            <div className="mb-6 shrink-0">
              <h2 className="text-lg font-black tracking-wide text-amber-200 font-orbitron">KNOWLEDGE VAULT PIPELINE</h2>
              <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-1">Ingest codebase directories, histories, PR files, and logs into the Cognee backend memory</p>
            </div>

            {/* Split panels grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
              
              {/* Primary repository indexing (left card) */}
              <div className="flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl p-5 justify-between">
                <div>
                  <div className="flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
                    <Database className="w-4 h-4 text-amber-400" />
                    <span className="text-[10px] font-bold font-mono text-slate-300 uppercase tracking-widest">Workspace Indexer</span>
                  </div>

                  <p className="text-xs text-slate-400 font-sans leading-relaxed">
                    Instantly index active project folders into Cognee. The indexer scans files to create semantic connection vectors and relational database entries, linking your source files directly to historical context.
                  </p>

                  <div className="mt-5 space-y-3">
                    <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">Core Workspace Targets:</span>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { name: 'README.md', size: '2.04 KB', path: './README.md' },
                        { name: 'main.py', size: '29.98 KB', path: './backend/main.py' },
                        { name: 'App.jsx', size: '78.07 KB', path: './frontend/src/App.jsx' }
                      ].map((item) => (
                        <div key={item.name} className="flex justify-between items-center bg-slate-900/35 border border-slate-900 p-3 rounded-xl font-mono text-[10px]">
                          <div className="flex items-center gap-2">
                            <Code className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-slate-300 font-bold">{item.name}</span>
                            <span className="text-slate-600">({item.path})</span>
                          </div>
                          <span className="text-slate-500">{item.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-900/60 space-y-4">
                  {ingestStatus && (
                    <div className="p-3 bg-emerald-950/15 border border-emerald-500/25 rounded-xl flex items-start gap-2.5 shadow animate-pulse">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="font-mono text-[10px] leading-tight">
                        <span className="text-emerald-400 font-bold block mb-0.5">Ingestion Status:</span>
                        <span className="text-emerald-300 leading-normal">{ingestStatus}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleIngest}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-[10px] font-black font-mono tracking-widest text-white rounded-xl transition-all duration-300 border border-amber-400/20 shadow-[0_4px_15px_rgba(245,158,11,0.1)] hover:shadow-[0_4px_15px_rgba(245,158,11,0.25)]"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Database className="w-4 h-4 animate-pulse" />}
                    INGEST & INDEX REPOSITORY DATA
                  </button>
                </div>
              </div>

              {/* Custom artifacts indexing (right card) */}
              <div className="flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 border-b border-slate-900 pb-3 mb-4 shrink-0">
                  <CornerDownRight className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] font-bold font-mono text-slate-300 uppercase tracking-widest">Inject Custom Evidence Artifact</span>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
                  {/* File Drag and Drop Box */}
                  <div className="border border-dashed border-slate-800 hover:border-amber-500/40 rounded-xl p-5 text-center cursor-pointer transition-colors relative bg-slate-900/10">
                    <input
                      type="file"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setCustomFilename(file.name);
                            setCustomContent(event.target.result);
                            // Auto-detect type based on extension
                            const ext = file.name.split('.').pop().toLowerCase();
                            if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'html', 'css', 'json', 'md'].includes(ext)) {
                              setCustomType("code snippet");
                            } else if (file.name.toLowerCase().includes('pr') || file.name.toLowerCase().includes('pull')) {
                              setCustomType("git pull request");
                            } else if (file.name.toLowerCase().includes('jira') || file.name.toLowerCase().includes('bug') || file.name.toLowerCase().includes('issue') || file.name.toLowerCase().includes('task')) {
                              setCustomType("issue tracker");
                            } else {
                              setCustomType("chat message");
                            }
                            addLog(`Loaded local file "${file.name}" into Custom Artifact editor.`, "success");
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                    <Upload className="w-5 h-5 text-amber-500/80 mx-auto mb-2" />
                    <span className="text-[10px] font-mono text-slate-400 block font-bold">DRAG & DROP OR CLICK TO LOAD FILE</span>
                    <span className="text-[8px] text-slate-600 block mt-1">Supports code files, markdown logs, or chat transcripts (.txt, .md, .py, etc.)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Artifact Category</label>
                      <select
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 focus:outline-none focus:border-amber-500 text-slate-300 font-mono text-[10px]"
                      >
                        <option value="code snippet">Source Code File</option>
                        <option value="git pull request">Git Pull Request</option>
                        <option value="issue tracker">Jira Issue Ticket</option>
                        <option value="chat message">Slack Chat Message</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Filename / Identifier</label>
                      <input
                        type="text"
                        placeholder="e.g., helper.py, PR #99, Jira AUTH-100"
                        value={customFilename}
                        onChange={(e) => setCustomFilename(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 focus:outline-none focus:border-amber-500 text-slate-300 font-mono text-[10px] placeholder:text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col flex-1">
                    <label className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Artifact Logs / Contents</label>
                    <textarea
                      rows={8}
                      placeholder="Paste details of files, git diffs, ticket descriptions, or Slack conversation transcripts here..."
                      value={customContent}
                      onChange={(e) => setCustomContent(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 focus:outline-none focus:border-amber-500 text-slate-300 font-mono text-[10px] h-48 resize-none leading-relaxed placeholder:text-slate-700 custom-scrollbar"
                    />
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-900/60 shrink-0">
                  <button
                    onClick={handleCustomIngest}
                    disabled={isProcessing || !customFilename.trim() || !customContent.trim()}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-[10px] font-black font-mono tracking-widest text-amber-400 border border-amber-500/20 rounded-xl transition-all duration-200"
                  >
                    {isProcessing ? "PROCESSING INGESTION..." : "INGEST & COGNIFY CUSTOM ARTIFACT"}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW: EVIDENCE LOCKER */}
        {activePage === 'trace' && (() => {
          const activeDoc = ingestedDocuments.find(d => d.id === selectedDocId) || ingestedDocuments[0] || INITIAL_DOCUMENTS[0];
          return (
            <div className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
              {/* Page Header */}
              <div className="mb-6 shrink-0">
                <h2 className="text-lg font-black tracking-wide text-cyan-200 font-orbitron">EVIDENCE LOCKER</h2>
                <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-1">Inspect original grounding evidence linked to active forensic cases</p>
              </div>

              {/* Editor Workspace Split Grid */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
                
                {/* Document List Navigation Tree (1/4 width) */}
                <div className="lg:col-span-1 flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl p-4">
                  <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest block mb-4">
                    Document tree explorer
                  </span>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                    {[
                      { key: 'code', label: 'Source Files', icon: Code, color: 'text-blue-400' },
                      { key: 'pr', label: 'Pull Requests', icon: GitPullRequest, color: 'text-purple-400' },
                      { key: 'jira', label: 'Jira Issues', icon: FileText, color: 'text-yellow-400' },
                      { key: 'slack', label: 'Slack Chats', icon: MessageSquare, color: 'text-emerald-400' }
                    ].map((cat) => {
                      const catDocs = ingestedDocuments.filter(d => d.category === cat.key);
                      if (catDocs.length === 0) return null;
                      return (
                        <div key={cat.key} className="space-y-1.5">
                          <div className="flex items-center gap-1.5 px-1 py-0.5 text-[9px] font-black font-mono text-slate-500 uppercase tracking-widest">
                            <ChevronRight className="w-3 h-3 text-slate-600" />
                            <span>{cat.label}</span>
                          </div>
                          
                          <div className="space-y-1 pl-3 border-l border-slate-900/60 ml-2.5">
                            {catDocs.map((doc) => {
                              const isSelected = selectedDocId === doc.id;
                              return (
                                <button
                                  key={doc.id}
                                  onClick={() => {
                                    setSelectedDocId(doc.id);
                                    addLog(`Selected trace document: ${doc.filename}`, 'info');
                                  }}
                                  className={`w-full text-left p-2 rounded-lg border text-[10px] font-mono transition-all duration-200 flex items-center gap-2 relative overflow-hidden group ${isSelected ? 'bg-cyan-950/15 border-cyan-500/30 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.03)] font-bold' : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-350'}`}
                                >
                                  <cat.icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? cat.color : 'text-slate-650'}`} />
                                  <span className="truncate flex-1">{doc.filename}</span>
                                  {isSelected && <div className="absolute right-0 top-0 w-0.5 h-full bg-cyan-400" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* IDE Editor Mockup Panel (3/4 width) */}
                <div className="lg:col-span-3 flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl overflow-hidden relative">
                  
                  {/* Editor Top Bar Chrome */}
                  <div className="px-5 py-3.5 border-b border-slate-900/60 bg-slate-950/60 backdrop-blur-xl flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      {/* Corner Dots */}
                      <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 bg-rose-500/80 rounded-full" />
                        <span className="w-2.5 h-2.5 bg-amber-500/80 rounded-full" />
                        <span className="w-2.5 h-2.5 bg-emerald-500/80 rounded-full" />
                      </div>
                      <div className="h-4 w-[1px] bg-slate-800/80 mx-1" />
                      
                      <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        {activeDoc.type} 
                        <span className="text-slate-600 text-[8px] font-normal font-sans">/</span> 
                        <span className="text-slate-300 font-black">{activeDoc.filename}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-500 animate-pulse" />
                        COGNEE INDEXED
                      </span>
                      
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(activeDoc.content);
                          addLog(`Copied content of: ${activeDoc.filename}`, 'success');
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-colors text-[9px] font-mono leading-none"
                      >
                        COPY DOC
                      </button>
                    </div>
                  </div>

                  {/* Editor File Display Area */}
                  <div className="flex-1 p-5 overflow-y-auto min-h-0 bg-slate-950/40 custom-scrollbar">
                    <div className={`p-5 rounded-2xl border bg-slate-950 h-full flex flex-col shadow-xl min-h-[300px] border-slate-850`}>
                      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap select-text pr-2 scrollbar-style custom-scrollbar">
                        {activeDoc.content}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* VIEW: SYSTEM CONSOLE */}
        {activePage === 'console' && (
          <div className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
            {/* Page Header */}
            <div className="mb-6 shrink-0">
              <h2 className="text-lg font-black tracking-wide text-rose-200 font-orbitron">SYSTEM CONSOLE</h2>
              <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-1">Real-time system logging outputs, local backend connectivity toggles, and LLM setup parameters</p>
            </div>

            {/* Split layout: Console Logger Left, Config Params Right */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
              
              {/* Terminal Logs (2/3 width) */}
              <div className="lg:col-span-2 flex flex-col min-h-0 bg-slate-950/40 border border-slate-900 rounded-2xl overflow-hidden scanner-line">
                <div className="px-5 py-4 border-b border-slate-900/60 flex items-center justify-between shrink-0 bg-slate-900/10">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-rose-400 animate-pulse" />
                    <span className="text-[10px] font-bold font-mono text-slate-350 uppercase tracking-widest">Excavator Execution Logger</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setTerminalLogs([{ type: 'info', text: 'Console cleared.' }])}
                      className="text-[9px] font-bold font-mono text-indigo-400 hover:text-indigo-300 uppercase transition-colors"
                    >
                      Clear Logs
                    </button>
                  </div>
                </div>

                {/* Console Logs list */}
                <div 
                  ref={logContainerRef}
                  className="flex-1 p-5 overflow-y-auto font-mono text-[10px] space-y-2.5 leading-relaxed selection:bg-indigo-500/20 text-slate-300 custom-scrollbar"
                >
                  {terminalLogs.map((log, index) => (
                    <div key={index} className="flex items-start gap-2.5">
                      <span className={`shrink-0 select-none ${log.type === 'error' ? 'text-rose-500' : log.type === 'success' ? 'text-emerald-400' : 'text-indigo-400'}`}>
                        {log.type === 'error' ? '✖' : log.type === 'success' ? '✔' : '❯'}
                      </span>
                      <span className={log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-300' : 'text-slate-300'}>
                        {log.text}
                      </span>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex items-center gap-2 text-indigo-400/50 animate-pulse font-bold">
                      <span>❯</span>
                      <span>Traversing hybrid memory indices...</span>
                      <span className="w-1.5 h-3.5 bg-indigo-500 animate-blink" />
                    </div>
                  )}
                </div>
              </div>

              {/* Backend configurations (1/3 width) */}
              <div className="lg:col-span-1 flex flex-col min-h-0 space-y-6">
                
                {/* Mode Selector Panel */}
                <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                  <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest block border-b border-slate-900 pb-2.5">
                    Backend Connection Parameters
                  </span>

                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    By default, the Archaeologist engine operates in a simulated sandbox mockup. Enable live database integrations to run a FastAPI Cognee instance on port 8000.
                  </p>

                  <div className="flex items-center justify-between p-3.5 bg-slate-900/25 border border-slate-900 rounded-xl">
                    <span className="text-[10px] font-mono font-bold text-slate-300">Live FastAPI Connection</span>
                    <button
                      onClick={() => {
                        setUseLocalBackend(!useLocalBackend);
                        addLog(`Switched operational mode to ${!useLocalBackend ? 'Live Local API' : 'Simulated Sandbox'}`, 'info');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black font-mono transition-all duration-200 ${useLocalBackend ? 'bg-emerald-950 border border-emerald-500/20 text-emerald-400' : 'bg-slate-950 border border-slate-880 text-slate-500 hover:text-slate-400'}`}
                    >
                      <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                      {useLocalBackend ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                  </div>
                </div>

                {/* API configuration Panel */}
                <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest">
                      LLM & Cognee Sync
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-mono">
                      <span className={`w-1.5 h-1.5 rounded-full ${apiKeyValid ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      <b className={apiKeyValid ? "text-emerald-400" : "text-amber-500"}>{apiKeyValid ? 'LLM Validated' : 'LLM Unverified'}</b>
                    </span>
                  </div>

                  <div className="space-y-3.5 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-500 block mb-1 text-[9px]">Gemini API Key:</span>
                      <div className="bg-slate-900/35 border border-slate-900 p-2.5 rounded-lg text-slate-400 truncate">
                        {apiKeyRedacted}
                      </div>
                    </div>

                    <div className="border-t border-slate-900/40 pt-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-500 text-[9px]">Cognee Cloud URL:</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-black ${cogneeConnected ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/10' : 'bg-slate-900 text-slate-500'}`}>
                          {cogneeConnected ? 'CLOUD ACTIVE' : 'LOCAL ENGINE'}
                        </span>
                      </div>
                      <div className="bg-slate-900/35 border border-slate-900 p-2.5 rounded-lg text-slate-400 truncate">
                        {cogneeServiceUrl || "Local / Self-hosted"}
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block mb-1 text-[9px]">Cognee Cloud API Key:</span>
                      <div className="bg-slate-900/35 border border-slate-900 p-2.5 rounded-lg text-slate-400 truncate">
                        {cogneeApiKeyRedacted}
                      </div>
                    </div>

                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/25 text-[10px] font-bold tracking-widest text-indigo-300 rounded-lg transition-all"
                    >
                      LAUNCH SETUP DIALOG
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

      </main>

      {/* SETTINGS MODAL OVERLAY */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowSettingsModal(false)}
              className="absolute right-4 top-4 p-1.5 hover:bg-slate-850 rounded-lg text-slate-500 hover:text-slate-355 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-indigo-950 border border-indigo-500/30 rounded-lg text-indigo-400">
                <Settings className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <h3 className="text-sm font-black font-mono tracking-wider text-slate-100 uppercase">System Settings</h3>
                <p className="text-[10px] text-slate-500 font-mono tracking-wider">Cognee Memory configuration and API setup</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Gemini API Key</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="sk-proj-..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors placeholder:text-slate-700 font-mono"
                  />
                </div>
                <div className="flex justify-between items-center mt-2.5 text-[10px] font-mono text-slate-500">
                  <span>Status: <b className={apiKeyValid ? "text-emerald-400" : "text-amber-500"}>{apiKeyRedacted}</b></span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${apiKeyValid ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    {apiKeyValid ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-800/85 pt-3">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Cognee Cloud Service URL</label>
                <input
                  type="text"
                  placeholder="https://your-tenant.aws.cognee.ai"
                  value={cogneeServiceUrlInput}
                  onChange={(e) => setCogneeServiceUrlInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors placeholder:text-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Cognee Cloud API Key</label>
                <input
                  type="password"
                  placeholder="ck_..."
                  value={cogneeApiKeyInput}
                  onChange={(e) => setCogneeApiKeyInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors placeholder:text-slate-700 font-mono"
                />
                <div className="flex justify-between items-center mt-2.5 text-[10px] font-mono text-slate-500">
                  <span>Cloud: <b className={cogneeConnected ? "text-emerald-400" : "text-slate-500"}>{cogneeConnected ? "CONNECTED" : "LOCAL MODE"}</b></span>
                </div>
              </div>

              <div className="p-3 bg-indigo-950/20 border border-indigo-500/10 rounded-lg text-[10px] text-indigo-300/80 font-mono leading-relaxed">
                ☁️ <b>Cognee Cloud:</b> Create an account at <a href="https://platform.cognee.ai/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline inline-flex items-center gap-0.5">platform.cognee.ai <ExternalLink className="w-2.5 h-2.5 inline" /></a>. Generate an API Key, and enter your Tenant URL to connect.
                <br /><span className="text-amber-400/90 font-bold">🎁 Use promo code COGNEE-35 for free cloud credits!</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-bold font-mono tracking-widest text-slate-400 rounded-lg transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-xs font-bold font-mono tracking-widest text-white rounded-lg transition-colors border border-indigo-400/20 shadow-md"
                >
                  SAVE & VERIFY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}