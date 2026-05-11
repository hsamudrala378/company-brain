import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = (process.env.REACT_APP_API_URL || "http://127.0.0.1:8000")
  .trim()
  .split(/\s+/)[0]
  .replace(/\/$/, "");

const welcomeMessage = {
  type: "ai",
  text: "I am Company Brain, your company AI agent. Ask me for help with HR, onboarding, operations, SOPs, customer support, planning, writing, technical documentation, or uploaded company files.",
  sources: [],
  mode: "general",
};

const starterPrompts = [
  "Create an onboarding checklist for a new employee",
  "Draft a professional email to announce a policy change",
  "Help me design a customer support workflow",
  "Summarize the uploaded document in simple language",
];

const navItems = ["Workspace", "Documents", "Analytics", "Settings"];

const getRequestError = (err, fallback) => {
  const detail = err.response?.data?.detail;

  if (detail) {
    return Array.isArray(detail) ? detail.map((item) => item.msg || item).join(", ") : detail;
  }

  if (err.response?.status) {
    return `${fallback} Backend returned ${err.response.status}.`;
  }

  if (err.message) {
    return `${fallback} ${err.message}.`;
  }

  return fallback;
};

function App() {
  const chatPanelRef = useRef(null);
  const composerInputRef = useRef(null);
  const [activeView, setActiveView] = useState("Workspace");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([welcomeMessage]);
  const [history, setHistory] = useState([]);
  const [file, setFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const chunks = documents.reduce((total, doc) => total + (doc.chunks || 0), 0);
    const pages = documents.reduce((total, doc) => total + (doc.pages || 0), 0);

    return [
      { label: "AI chats", value: history.length },
      { label: "Documents", value: documents.length },
      { label: "Pages indexed", value: pages },
      { label: "Knowledge chunks", value: chunks },
    ];
  }, [documents, history]);

  const recentChats = history.slice(-6).reverse();
  const documentAnswers = history.filter((item) => item.sources?.length > 0).length;
  const generalAnswers = Math.max(history.length - documentAnswers, 0);

  useEffect(() => {
    loadDocuments();
    loadHistory();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await axios.get(`${API_URL}/documents`);
      setDocuments(response.data.documents || []);
    } catch (err) {
      setError(getRequestError(err, "Could not sync documents."));
    }
  };

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/history`);
      setHistory(response.data.messages || []);
    } catch (err) {
      setError(getRequestError(err, "Could not load recent chats."));
    }
  };

  const uploadPDF = async (selectedFile = file) => {
    if (!selectedFile) {
      setError("Select a PDF before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    setIsUploading(true);
    setError("");

    try {
      const response = await axios.post(`${API_URL}/upload`, formData);
      setDocuments((prev) => [...prev, response.data.document]);
      setFile(null);
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text: `${response.data.document.name} is indexed. I can now use it when it is relevant, and I can still answer general company questions too.`,
          sources: [],
          mode: "documents",
        },
      ]);
    } catch (err) {
      setError(getRequestError(err, "Upload failed."));
    } finally {
      setIsUploading(false);
    }
  };

  const askQuestion = async (prompt = question) => {
    const trimmedQuestion = prompt.trim();

    if (!trimmedQuestion || isAsking) return;

    setActiveView("Workspace");
    setQuestion("");
    setError("");
    setIsAsking(true);
    setMessages((prev) => [...prev, { type: "user", text: trimmedQuestion, sources: [] }]);

    try {
      const response = await axios.post(`${API_URL}/ask`, { question: trimmedQuestion });
      const aiMessage = {
        type: "ai",
        text: response.data.answer,
        sources: response.data.sources || [],
        mode: response.data.mode || "general",
      };

      setMessages((prev) => [...prev, aiMessage]);
      loadHistory();
    } catch (err) {
      setError(getRequestError(err, "Could not reach Company Brain."));
    } finally {
      setIsAsking(false);
    }
  };

  const openChat = (chat) => {
    setActiveView("Workspace");
    setMessages([
      welcomeMessage,
      { type: "user", text: chat.question, sources: [] },
      {
        type: "ai",
        text: chat.answer,
        sources: chat.sources || [],
        mode: chat.sources?.length ? "documents" : "general",
      },
    ]);
    moveToComposer();
  };

  const startNewChat = () => {
    setActiveView("Workspace");
    setMessages([welcomeMessage]);
    setQuestion("");
    moveToComposer();
  };

  const moveToComposer = () => {
    window.setTimeout(() => {
      chatPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      composerInputRef.current?.focus({ preventScroll: true });
    }, 80);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      uploadPDF(droppedFile);
    }
  };

  const renderChatPanel = () => (
    <section className="chat-panel" ref={chatPanelRef}>
      <div className="panel-header">
        <div>
          <p className="section-label">AI agent</p>
          <h3>Ask anything</h3>
        </div>
        {isAsking && <div className="typing-indicator">Thinking</div>}
      </div>

      <div className="messages">
        {messages.map((msg, index) => (
          <article className={`message ${msg.type}`} key={`${msg.type}-${index}`}>
            <div className="message-avatar">{msg.type === "user" ? "You" : "AI"}</div>
            <div className="message-body">
              {msg.mode && msg.type === "ai" && (
                <span className={`mode-pill ${msg.mode}`}>
                  {msg.mode === "documents" ? "From documents" : "General support"}
                </span>
              )}
              <p>{msg.text}</p>
              {msg.sources?.length > 0 && (
                <div className="sources">
                  {msg.sources.map((source) => (
                    <span key={`${source.chunk_id}-${source.page}`}>
                      {source.source}, page {source.page}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="prompt-row">
        {starterPrompts.map((prompt) => (
          <button key={prompt} onClick={() => askQuestion(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          askQuestion();
        }}
      >
        <input
          ref={composerInputRef}
          type="text"
          placeholder="Message Company Brain..."
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button disabled={isAsking} type="submit">
          {isAsking ? "Answering" : "Ask"}
        </button>
      </form>
    </section>
  );

  const renderUploadPanel = () => (
    <section
      className={`upload-zone ${dragActive ? "drag-active" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <div className="upload-icon">+</div>
      <p className="section-label">Optional knowledge</p>
      <h3>Add company files</h3>
      <p>Upload sample policies, SOPs, onboarding manuals, or guides when you want document-grounded answers.</p>
      <label className="file-picker">
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => setFile(event.target.files[0])}
        />
        {file ? file.name : "Choose PDF"}
      </label>
      <button className="upload-button" disabled={isUploading} onClick={() => uploadPDF()}>
        {isUploading ? "Indexing..." : "Add knowledge"}
      </button>
    </section>
  );

  const renderDocumentList = () => (
    <section className="document-list">
      <div className="panel-header compact">
        <div>
          <p className="section-label">Knowledge base</p>
          <h3>Indexed documents</h3>
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="empty-state">No PDFs indexed yet.</p>
      ) : (
        documents.map((doc) => (
          <article className="document-item" key={doc.id}>
            <div className="doc-icon">PDF</div>
            <div>
              <strong>{doc.name}</strong>
              <span>
                {doc.pages} pages - {doc.chunks} chunks
              </span>
            </div>
          </article>
        ))
      )}
    </section>
  );

  const renderMainView = () => {
    if (activeView === "Documents") {
      return (
        <div className="page-grid">
          {renderUploadPanel()}
          {renderDocumentList()}
        </div>
      );
    }

    if (activeView === "Analytics") {
      return (
        <section className="full-panel">
          <div className="panel-header compact">
            <div>
              <p className="section-label">Agent analytics</p>
              <h3>Workspace activity</h3>
            </div>
          </div>
          <div className="analytics-grid">
            <div className="analytics-card">
              <span>Total chats</span>
              <strong>{history.length}</strong>
            </div>
            <div className="analytics-card">
              <span>Document answers</span>
              <strong>{documentAnswers}</strong>
            </div>
            <div className="analytics-card">
              <span>General support answers</span>
              <strong>{generalAnswers}</strong>
            </div>
            <div className="analytics-card">
              <span>Indexed files</span>
              <strong>{documents.length}</strong>
            </div>
          </div>
          <div className="insight-note">
            Later this can show active employees, most asked topics, unresolved questions, document usage, saved time, and AI cost.
          </div>
        </section>
      );
    }

    if (activeView === "Settings") {
      return (
        <section className="full-panel settings-panel">
          <div className="panel-header compact">
            <div>
              <p className="section-label">Workspace settings</p>
              <h3>Company AI Agent configuration</h3>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <strong>Agent mode</strong>
              <span>Works like a general AI assistant for company work. Uploaded documents are optional extra knowledge.</span>
            </div>
            <div>
              <strong>Demo privacy</strong>
              <span>Use sample or non-confidential PDFs only until authentication, database storage, and document deletion are added.</span>
            </div>
            <div>
              <strong>Backend API</strong>
              <span>{API_URL}</span>
            </div>
          </div>
          <button className="secondary-button" onClick={startNewChat}>
            Start new chat
          </button>
        </section>
      );
    }

    return (
      <div className="content-grid">
        {renderChatPanel()}
        <aside className="knowledge-panel">
          {renderUploadPanel()}
          {renderDocumentList()}
        </aside>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">CB</div>
          <div>
            <p className="eyebrow">Company Brain</p>
            <h1>AI Agent OS</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activeView === item ? "active" : ""}`}
              key={item}
              onClick={() => setActiveView(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <section className="sidebar-section">
          <p className="section-label">Recent chats</p>
          {recentChats.length === 0 ? (
            <p className="empty-state small">No saved chats yet.</p>
          ) : (
            recentChats.map((chat) => (
              <button className="chat-link" key={chat.created_at} onClick={() => openChat(chat)}>
                {chat.question}
              </button>
            ))
          )}
        </section>

        <div className="user-card">
          <div className="avatar">H</div>
          <div>
            <strong>Harshitha</strong>
            <span>Admin workspace</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Company AI agent</p>
            <h2>{activeView === "Workspace" ? "How can I help your team?" : activeView}</h2>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" onClick={startNewChat}>
              New chat
            </button>
            <div className="status-pill">
              <span className="pulse" />
              Live demo
            </div>
          </div>
        </header>

        <section className="mobile-tabs" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <button
              className={activeView === item ? "active" : ""}
              key={item}
              onClick={() => setActiveView(item)}
            >
              {item}
            </button>
          ))}
        </section>

        <section className="insight-strip" aria-label="Workspace metrics">
          {stats.map((stat) => (
            <div className="metric-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </section>

        {error && <div className="error-banner">{error}</div>}

        {renderMainView()}
      </main>
    </div>
  );
}

export default App;
