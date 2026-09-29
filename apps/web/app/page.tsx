"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type Project = {
  id: string;
  name: string;
  createdAt: string;
  _count: { endpoints: number };
};

type Endpoint = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  createdAt: string;
  _count: { deliveries: number };
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  responseBody: string | null;
  createdAt: string;
  updatedAt: string;
};

async function request<T>(key: string, path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Unauthorized: copy the current TRACEFORGE_API_KEY from .env, then restart pnpm dev if it was already running.",
      );
    }
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return body;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

export default function Dashboard() {
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEndpointId, setSelectedEndpointId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectName, setProjectName] = useState("");
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [eventType, setEventType] = useState("order.created");
  const [eventPayload, setEventPayload] = useState(
    '{\n  "orderId": "ord_123",\n  "total": 49.99\n}',
  );
  const [expandedDeliveryId, setExpandedDeliveryId] = useState("");

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const selectedEndpoint = endpoints.find(
    (endpoint) => endpoint.id === selectedEndpointId,
  );
  const metrics = useMemo(
    () => ({
      total: deliveries.length,
      succeeded: deliveries.filter(
        (delivery) => delivery.status === "succeeded",
      ).length,
      attention: deliveries.filter((delivery) =>
        ["failed", "retrying"].includes(delivery.status),
      ).length,
    }),
    [deliveries],
  );

  const loadProjects = useCallback(async (key: string) => {
    const result = await request<{ projects: Project[] }>(key, "/api/projects");
    setProjects(result.projects);
    setSelectedProjectId((current) => current || result.projects[0]?.id || "");
  }, []);

  const loadEndpoints = useCallback(async (key: string, projectId: string) => {
    if (!projectId) {
      setEndpoints([]);
      setSelectedEndpointId("");
      return;
    }
    const result = await request<{ endpoints: Endpoint[] }>(
      key,
      `/api/projects/${projectId}/endpoints`,
    );
    setEndpoints(result.endpoints);
    setSelectedEndpointId((current) =>
      result.endpoints.some((endpoint) => endpoint.id === current)
        ? current
        : (result.endpoints[0]?.id ?? ""),
    );
  }, []);

  const loadDeliveries = useCallback(
    async (key: string, endpointId: string) => {
      if (!endpointId) {
        setDeliveries([]);
        return;
      }
      const result = await request<{ deliveries: Delivery[] }>(
        key,
        `/api/deliveries?endpointId=${encodeURIComponent(endpointId)}`,
      );
      setDeliveries(result.deliveries);
    },
    [],
  );

  useEffect(() => {
    const savedKey = window.sessionStorage.getItem("traceforge-api-key");
    if (!savedKey) return;
    setApiKey(savedKey);
    setLoading(true);
    loadProjects(savedKey)
      .then(() => setAuthenticated(true))
      .catch(() => {
        window.sessionStorage.removeItem("traceforge-api-key");
        setError("Saved API key was rejected. Enter your key again.");
      })
      .finally(() => setLoading(false));
  }, [loadProjects]);

  useEffect(() => {
    if (!authenticated || !apiKey || !selectedProjectId) return;
    loadEndpoints(apiKey, selectedProjectId).catch((cause: unknown) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load endpoints.",
      ),
    );
  }, [apiKey, authenticated, loadEndpoints, selectedProjectId]);

  useEffect(() => {
    if (!authenticated || !apiKey || !selectedEndpointId) {
      setDeliveries([]);
      return;
    }
    let active = true;
    const refresh = () =>
      loadDeliveries(apiKey, selectedEndpointId).catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not refresh deliveries.",
          );
      });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiKey, authenticated, loadDeliveries, selectedEndpointId]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await loadProjects(keyInput);
      window.sessionStorage.setItem("traceforge-api-key", keyInput);
      setApiKey(keyInput);
      setAuthenticated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      setLoading(false);
    }
  }

  function disconnect() {
    window.sessionStorage.removeItem("traceforge-api-key");
    setApiKey("");
    setAuthenticated(false);
    setProjects([]);
    setEndpoints([]);
    setDeliveries([]);
    setSelectedProjectId("");
    setSelectedEndpointId("");
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await request<{ project: Project }>(
        apiKey,
        "/api/projects",
        { method: "POST", body: JSON.stringify({ name: projectName }) },
      );
      setProjects((current) => [
        { ...result.project, _count: { endpoints: 0 } },
        ...current,
      ]);
      setSelectedProjectId(result.project.id);
      setProjectName("");
      setNotice("Project created.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create project.",
      );
    }
  }

  async function createEndpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setError("");
    try {
      const result = await request<{ endpoint: Endpoint }>(
        apiKey,
        `/api/projects/${selectedProjectId}/endpoints`,
        {
          method: "POST",
          body: JSON.stringify({ name: endpointName, url: endpointUrl }),
        },
      );
      setEndpoints((current) => [
        { ...result.endpoint, _count: { deliveries: 0 } },
        ...current,
      ]);
      setSelectedEndpointId(result.endpoint.id);
      setEndpointName("");
      setEndpointUrl("");
      setNotice("Endpoint created. Its signing secret is stored securely.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create endpoint.",
      );
    }
  }

  async function sendEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEndpointId) return;
    setError("");
    try {
      const payload: unknown = JSON.parse(eventPayload);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Payload must be a JSON object.");
      await request(apiKey, `/api/endpoints/${selectedEndpointId}/events`, {
        method: "POST",
        body: JSON.stringify({ type: eventType, payload }),
      });
      await loadDeliveries(apiKey, selectedEndpointId);
      setNotice("Test event queued for delivery.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send event.",
      );
    }
  }

  if (!authenticated) {
    return (
      <main className="connect-screen">
        <div className="connect-card">
          <div className="brand-mark">T</div>
          <p className="eyebrow">DEVELOPER OBSERVABILITY</p>
          <h1>Welcome to TraceForge</h1>
          <p className="muted">
            Connect your local workspace using the API key from your `.env`
            file. It stays in this browser tab session.
          </p>
          <form onSubmit={connect} className="stack-form">
            <label htmlFor="api-key">Workspace API key</label>
            <input
              id="api-key"
              autoComplete="off"
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Paste TRACEFORGE_API_KEY"
              minLength={32}
              required
            />
            <button className="primary-button" disabled={loading}>
              {loading ? "Connecting…" : "Connect workspace"}
            </button>
          </form>
          {error && <p className="error-message">{error}</p>}
          <p className="hint">
            Find it in `D:\OneDrive\Desktop\Projects\traceforge\.env`
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark small">T</span>
          <span>TraceForge</span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`project-link ${project.id === selectedProjectId ? "active" : ""}`}
              onClick={() => setSelectedProjectId(project.id)}
            >
              <span className="project-dot" />
              {project.name}
              <span className="project-count">{project._count.endpoints}</span>
            </button>
          ))}
          {!projects.length && <p className="sidebar-empty">No projects yet</p>}
        </div>
        <form className="sidebar-create" onSubmit={createProject}>
          <input
            aria-label="New project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="New project name"
            maxLength={100}
            required
          />
          <button aria-label="Create project" title="Create project">
            +
          </button>
        </form>
        <div className="sidebar-spacer" />
        <div className="connection-state">
          <span className="live-dot" /> Connected to local API
        </div>
        <button className="text-button" onClick={disconnect}>
          Disconnect workspace
        </button>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {selectedProject?.name ?? "Overview"}
          </div>
          <div className="topbar-right">
            <span className="live-label">
              <span className="live-dot" /> LIVE
            </span>
            <span className="avatar">TF</span>
          </div>
        </header>
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">WEBHOOK OBSERVABILITY</p>
              <h1>{selectedProject?.name ?? "Your workspace"}</h1>
              <p className="muted">
                Monitor endpoints, inspect deliveries, and test integrations.
              </p>
            </div>
            <span className="environment-tag">
              <span className="live-dot" /> Development
            </span>
          </div>

          {error && (
            <div className="alert error-message">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div className="alert success-message">
              {notice}
              <button onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}

          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-icon cyan">↗</span>
              <span className="metric-label">Recent deliveries</span>
              <strong>{metrics.total}</strong>
              <span className="metric-foot">
                Latest 50 for selected endpoint
              </span>
            </article>
            <article className="metric-card">
              <span className="metric-icon green">✓</span>
              <span className="metric-label">Succeeded</span>
              <strong>{metrics.succeeded}</strong>
              <span className="metric-foot">Successful responses</span>
            </article>
            <article className="metric-card">
              <span className="metric-icon amber">!</span>
              <span className="metric-label">Needs attention</span>
              <strong>{metrics.attention}</strong>
              <span className="metric-foot">Failed or retrying</span>
            </article>
            <article className="metric-card">
              <span className="metric-icon violet">◎</span>
              <span className="metric-label">Endpoints</span>
              <strong>{endpoints.length}</strong>
              <span className="metric-foot">
                In {selectedProject ? "selected project" : "this workspace"}
              </span>
            </article>
          </div>

          <div className="section-heading">
            <div>
              <h2>Endpoints</h2>
              <p>Choose a destination to inspect its event history.</p>
            </div>
            {selectedProject && (
              <span className="subtle-count">
                {endpoints.length} configured
              </span>
            )}
          </div>
          <div className="endpoint-layout">
            <div className="endpoint-list">
              {endpoints.map((endpoint) => (
                <button
                  key={endpoint.id}
                  className={`endpoint-card ${endpoint.id === selectedEndpointId ? "selected" : ""}`}
                  onClick={() => setSelectedEndpointId(endpoint.id)}
                >
                  <span className="endpoint-status">
                    <span
                      className={endpoint.enabled ? "live-dot" : "offline-dot"}
                    />
                  </span>
                  <span className="endpoint-info">
                    <strong>{endpoint.name}</strong>
                    <small>{endpoint.url}</small>
                  </span>
                  <span className="endpoint-deliveries">
                    {endpoint._count.deliveries}
                  </span>
                </button>
              ))}
              {!endpoints.length && (
                <div className="empty-inline">
                  <strong>No endpoint connected</strong>
                  <span>
                    Create a destination below to start tracking deliveries.
                  </span>
                </div>
              )}
              {selectedProject && (
                <form className="create-endpoint" onSubmit={createEndpoint}>
                  <div className="form-title">Add endpoint</div>
                  <input
                    aria-label="Endpoint name"
                    value={endpointName}
                    onChange={(event) => setEndpointName(event.target.value)}
                    placeholder="Production webhook"
                    maxLength={100}
                    required
                  />
                  <input
                    aria-label="Endpoint URL"
                    type="url"
                    value={endpointUrl}
                    onChange={(event) => setEndpointUrl(event.target.value)}
                    placeholder="https://api.example.com/webhooks"
                    required
                  />
                  <button className="secondary-button">Add endpoint</button>
                </form>
              )}
            </div>

            <form className="event-card" onSubmit={sendEvent}>
              <div className="card-heading">
                <div>
                  <p className="eyebrow">DEVELOPER TOOL</p>
                  <h3>Send a test event</h3>
                </div>
                <span className="code-icon">{}</span>
              </div>
              <label htmlFor="event-type">Event type</label>
              <input
                id="event-type"
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                maxLength={200}
                required
                disabled={!selectedEndpointId}
              />
              <label htmlFor="event-payload">JSON payload</label>
              <textarea
                id="event-payload"
                value={eventPayload}
                onChange={(event) => setEventPayload(event.target.value)}
                spellCheck={false}
                disabled={!selectedEndpointId}
              />
              <button className="primary-button" disabled={!selectedEndpointId}>
                Queue test delivery <span>→</span>
              </button>
              <p className="form-caption">
                Payload is signed with the endpoint secret.
              </p>
            </form>
          </div>

          <div className="section-heading delivery-heading">
            <div>
              <h2>Recent deliveries</h2>
              <p>
                {selectedEndpoint
                  ? `Activity for ${selectedEndpoint.name}`
                  : "Select an endpoint to view activity"}
              </p>
            </div>
            <span className="refresh-label">
              <span className="live-dot" /> Refreshes every 5 sec
            </span>
          </div>
          <div className="delivery-table-wrap">
            <table className="delivery-table">
              <thead>
                <tr>
                  <th>EVENT</th>
                  <th>STATUS</th>
                  <th>HTTP</th>
                  <th>ATTEMPTS</th>
                  <th>CREATED</th>
                  <th>DETAILS</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <Fragment key={delivery.id}>
                    <tr
                      onClick={() =>
                        setExpandedDeliveryId((current) =>
                          current === delivery.id ? "" : delivery.id,
                        )
                      }
                      className="delivery-row"
                    >
                      <td>
                        <span className="event-name">{delivery.eventType}</span>
                        <code>{delivery.id.slice(-12)}</code>
                      </td>
                      <td>
                        <StatusBadge status={delivery.status} />
                      </td>
                      <td>
                        {delivery.lastStatusCode ?? (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{delivery.attemptCount}</td>
                      <td>{formatTime(delivery.createdAt)}</td>
                      <td>
                        <button className="details-button">
                          {expandedDeliveryId === delivery.id
                            ? "Hide"
                            : "Inspect"}
                        </button>
                      </td>
                    </tr>
                    {expandedDeliveryId === delivery.id && (
                      <tr className="details-row">
                        <td colSpan={6}>
                          <div className="delivery-details">
                            {delivery.lastError && (
                              <p className="error-message">
                                {delivery.lastError}
                              </p>
                            )}
                            <strong>Response</strong>
                            <pre>
                              {delivery.responseBody ||
                                "No response body recorded."}
                            </pre>
                            <span>Delivery ID: {delivery.id}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!deliveries.length && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-table">
                        <span className="empty-icon">↗</span>
                        <strong>
                          {selectedEndpoint
                            ? "No deliveries yet"
                            : "Choose an endpoint"}
                        </strong>
                        <span>
                          {selectedEndpoint
                            ? "Send a test event to see its delivery lifecycle here."
                            : "Delivery history appears after you select an endpoint."}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="dashboard-footer">
            <span>TraceForge · Webhook reliability workspace</span>
            <span>Local development</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
