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
      ...(key ? { authorization: `Bearer ${key}` } : {}),
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
  const [sessionChecked, setSessionChecked] = useState(false);
  const [publicReadOnly, setPublicReadOnly] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
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
  const [sendingEvent, setSendingEvent] = useState(false);
  const canManageWorkspace = !publicReadOnly || Boolean(apiKey);

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
    setLoading(true);
    let active = true;
    async function initialize() {
      try {
        const sessionResponse = await fetch("/api/session");
        const session = (await sessionResponse.json()) as {
          publicReadOnly: boolean;
        };
        const savedKey = window.sessionStorage.getItem("traceforge-api-key");
        if (!active) return;
        setPublicReadOnly(session.publicReadOnly);
        if (!savedKey && !session.publicReadOnly) return;
        try {
          await loadProjects(savedKey ?? "");
          if (active) {
            setApiKey(savedKey ?? "");
            setAuthenticated(true);
          }
        } catch {
          window.sessionStorage.removeItem("traceforge-api-key");
          if (!session.publicReadOnly) {
            setError("Saved API key was rejected. Enter your key again.");
            return;
          }
          await loadProjects("");
          if (active) {
            setApiKey("");
            setAuthenticated(true);
          }
        }
      } catch {
        setError("Could not connect to the TraceForge workspace.");
      } finally {
        if (active) {
          setSessionChecked(true);
          setLoading(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!authenticated || (!apiKey && !publicReadOnly) || !selectedProjectId)
      return;
    loadEndpoints(apiKey, selectedProjectId).catch((cause: unknown) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load endpoints.",
      ),
    );
  }, [apiKey, authenticated, loadEndpoints, publicReadOnly, selectedProjectId]);

  useEffect(() => {
    if (!authenticated || (!apiKey && !publicReadOnly) || !selectedEndpointId) {
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
  }, [
    apiKey,
    authenticated,
    loadDeliveries,
    publicReadOnly,
    selectedEndpointId,
  ]);

  useEffect(() => {
    if (!notice && !error) return;
    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [error, notice]);

  useEffect(() => {
    if (!authenticated || (!apiKey && !publicReadOnly) || !selectedProjectId)
      return;
    const refreshEndpointCounts = async () => {
      try {
        const result = await request<{ endpoints: Endpoint[] }>(
          apiKey,
          `/api/projects/${selectedProjectId}/endpoints`,
        );
        setEndpoints((current) =>
          current.map((endpoint) => {
            const updated = result.endpoints.find(
              (item) => item.id === endpoint.id,
            );
            return updated ? { ...endpoint, _count: updated._count } : endpoint;
          }),
        );
      } catch {
        return;
      }
    };
    const timer = window.setInterval(() => void refreshEndpointCounts(), 5_000);
    return () => window.clearInterval(timer);
  }, [apiKey, authenticated, publicReadOnly, selectedProjectId]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await loadProjects(keyInput);
      window.sessionStorage.setItem("traceforge-api-key", keyInput);
      setApiKey(keyInput);
      setAuthenticated(true);
      setShowAdminLogin(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      setLoading(false);
    }
  }

  function disconnect() {
    window.sessionStorage.removeItem("traceforge-api-key");
    setApiKey("");
    setShowAdminLogin(false);
    if (publicReadOnly) {
      void loadProjects("").catch(() =>
        setError("Could not load the public workspace."),
      );
      return;
    }
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
    if (!selectedEndpointId || sendingEvent) return;
    setError("");
    setNotice("Sending event to the queue…");
    setSendingEvent(true);
    try {
      const payload: unknown = JSON.parse(eventPayload);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Payload must be a JSON object.");
      const result = await request<{ deliveryId: string }>(
        apiKey,
        `/api/endpoints/${selectedEndpointId}/events`,
        {
          method: "POST",
          body: JSON.stringify({ type: eventType, payload }),
        },
      );
      await loadDeliveries(apiKey, selectedEndpointId);
      setExpandedDeliveryId(result.deliveryId);
      setNotice("Event queued. Delivery status will refresh automatically.");
    } catch (cause) {
      setNotice("");
      setError(
        cause instanceof Error ? cause.message : "Could not send event.",
      );
    } finally {
      setSendingEvent(false);
    }
  }

  if (!sessionChecked || (loading && !authenticated)) {
    return (
      <main className="connect-screen">
        <div className="connect-card">
          <div className="brand-mark">T</div>
          <p className="eyebrow">WEBHOOK RELIABILITY</p>
          <h1>Connecting workspace</h1>
          <p className="muted">Checking workspace access…</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="connect-screen">
        <div className="connect-card">
          <div className="brand-mark">T</div>
          <p className="eyebrow">WEBHOOK RELIABILITY</p>
          <h1>Welcome to TraceForge</h1>
          <p className="muted">Connect to the workspace using its API key.</p>
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
            The workspace owner provides this key securely.
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
        {canManageWorkspace && (
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
        )}
        <div className="sidebar-spacer" />
        <div className="connection-state">
          <span className="live-dot" />
          {publicReadOnly && !apiKey
            ? "Public read-only access"
            : "Connected to private workspace"}
        </div>
        {publicReadOnly && !apiKey ? (
          <button
            className="text-button"
            onClick={() => setShowAdminLogin(true)}
          >
            Admin sign in
          </button>
        ) : (
          <button className="text-button" onClick={disconnect}>
            Disconnect workspace
          </button>
        )}
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
              <p className="eyebrow">WEBHOOK RELIABILITY</p>
              <h1>{selectedProject?.name ?? "Your workspace"}</h1>
              <p className="muted">
                Monitor endpoints, inspect deliveries, and test integrations.
              </p>
            </div>
            <span className="environment-tag">
              <span className="live-dot" />
              {publicReadOnly && !apiKey ? "Public read-only" : "Workspace"}
            </span>
          </div>

          {error && (
            <div className="alert error-message">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div
              className={`alert ${sendingEvent ? "info-message" : "success-message"}`}
              role="status"
              aria-live="polite"
            >
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
                    {canManageWorkspace
                      ? "Create a destination below to start tracking deliveries."
                      : "No endpoint has been added to this workspace yet."}
                  </span>
                </div>
              )}
              {selectedProject && canManageWorkspace && (
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

            {canManageWorkspace ? (
              <form className="event-card" onSubmit={sendEvent}>
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">EVENT DELIVERY</p>
                    <h3>Send an event</h3>
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
                <button
                  className="primary-button"
                  disabled={!selectedEndpointId || sendingEvent}
                >
                  {sendingEvent ? "Queueing…" : "Queue event"} <span>→</span>
                </button>
                <p className="form-caption">
                  Payload is signed with the endpoint secret.
                </p>
              </form>
            ) : (
              <article className="event-card readonly-card">
                <p className="eyebrow">PUBLIC VIEW</p>
                <h3>Read-only workspace</h3>
                <p>
                  Delivery history is visible. Sending events and changing
                  workspace settings require owner access.
                </p>
              </article>
            )}
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
                            ? "Send an event to see its delivery lifecycle here."
                            : "Delivery history appears after you select an endpoint."}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {publicReadOnly && !apiKey && !projects.length && (
            <p className="muted public-empty-note">
              This workspace has no published project yet.
            </p>
          )}
          <footer className="dashboard-footer">
            <span>TraceForge · Webhook reliability workspace</span>
            <span>Local development</span>
          </footer>
        </div>
      </section>
      {showAdminLogin && (
        <div className="public-access-overlay">
          <form className="connect-card" onSubmit={connect}>
            <button
              className="text-button modal-close"
              type="button"
              onClick={() => setShowAdminLogin(false)}
            >
              Close
            </button>
            <div className="brand-mark">T</div>
            <p className="eyebrow">OWNER ACCESS</p>
            <h1>Manage workspace</h1>
            <p className="muted">
              Sign in with the private workspace API key to create projects,
              endpoints, and deliveries.
            </p>
            <label htmlFor="admin-api-key">Workspace API key</label>
            <input
              id="admin-api-key"
              autoComplete="off"
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Paste the private API key"
              minLength={32}
              required
            />
            {error && <p className="error-message">{error}</p>}
            <button className="primary-button" disabled={loading}>
              {loading ? "Connecting…" : "Sign in"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
