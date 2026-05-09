import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = (process.env.REACT_APP_API_URL || "http://127.0.0.1:8000")
  .trim()
  .split(/\s+/)[0]
  .replace(/\/$/, "");

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

const starterPrompts = [
  "Summarize the leave policy for a new employee.",
  "What should a new hire complete in week one?",
  "Which SOP mentions escalation or approvals?",
];

const recentChats = [
  "Onboarding checklist",
  "Security policy summary",
  "Leave approval workflow",
  "Client handoff SOP",
];

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      type: "ai",
      text: "Upload your company PDFs, then ask me anything about policies, SOPs, onboarding, or internal docs. I will answer with document sources when the backend finds them.",
      sources: [],
    },
  ]);
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
      { label: "Documents", value: documents.length },
      { label: "Pages", value: pages },
      { label: "Knowledge chunks", value: chunks },
    ];
  }, [documents]);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await axios.get(`${API_URL}/documents`);
      setDocuments(response.data.documents || []);
    } catch (err) {
      setError(getRequestError(err, "Could not sync documents."));
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
          text: `${response.data.document.name} is indexed and ready for questions.`,
          sources: [],
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

    setQuestion("");
    setError("");
    setIsAsking(true);
    setMessages((prev) => [...prev, { type: "user", text: trimmedQuestion, sources: [] }]);

    try {
      const response = await axios.post(`${API_URL}/ask`, { question: trimmedQuestion });
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text: response.data.answer,
          sources: response.data.sources || [],
        },
      ]);
    } catch (err) {
      setError(getRequestError(err, "Could not reach Company Brain."));
    } finally {
      setIsAsking(false);
    }
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">CB</div>
          <div>
            <p className="eyebrow">Company Brain</p>
            <h1>Knowledge OS</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <button className="nav-item active">Workspace</button>
          <button className="nav-item">Documents</button>
          <button className="nav-item">Analytics</button>
          <button className="nav-item">Settings</button>
        </nav>

        <section className="sidebar-section">
          <p className="section-label">Recent chats</p>
          {recentChats.map((chat) => (
            <button className="chat-link" key={chat}>
              {chat}
            </button>
          ))}
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
            <p className="eyebrow">Private AI assistant</p>
            <h2>Ask across your company knowledge</h2>
          </div>
          <div className="status-pill">
            <span className="pulse" />
            Secure workspace
          </div>
        </header>

        <section className="insight-strip" aria-label="Workspace metrics">
          {stats.map((stat) => (
            <div className="metric-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </section>

        {error && <div className="error-banner">{error}</div>}

        <div className="content-grid">
          <section className="chat-panel">
            <div className="panel-header">
              <div>
                <p className="section-label">AI chat</p>
                <h3>Document-grounded answers</h3>
              </div>
              {isAsking && <div className="typing-indicator">Thinking</div>}
            </div>

            <div className="messages">
              {messages.map((msg, index) => (
                <article className={`message ${msg.type}`} key={`${msg.type}-${index}`}>
                  <div className="message-avatar">{msg.type === "user" ? "You" : "AI"}</div>
                  <div className="message-body">
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
                type="text"
                placeholder="Ask about HR policy, onboarding, SOPs, or technical docs..."
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button disabled={isAsking} type="submit">
                {isAsking ? "Answering" : "Ask"}
              </button>
            </form>
          </section>

          <aside className="knowledge-panel">
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
              <p className="section-label">Upload center</p>
              <h3>Add company PDFs</h3>
              <p>
                Drop policies, onboarding manuals, SOPs, or technical guides to make them searchable.
              </p>
              <label className="file-picker">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setFile(event.target.files[0])}
                />
                {file ? file.name : "Choose PDF"}
              </label>
              <button className="upload-button" disabled={isUploading} onClick={() => uploadPDF()}>
                {isUploading ? "Indexing..." : "Upload and index"}
              </button>
            </section>

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
          </aside>
        </div>
      </main>
    </div>
  );
}

export default App;
