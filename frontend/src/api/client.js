const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  listProjects: () => request("/api/projects/"),
  createProject: (data) =>
    request("/api/projects/", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  dashboard: (projectId) => request(`/api/projects/${projectId}/dashboard`),
  readiness: (projectId) => request(`/api/projects/${projectId}/readiness`),
  actionQueue: (projectId) => request(`/api/projects/${projectId}/actions`),
  evidence: (projectId) => request(`/api/projects/${projectId}/evidence`),
  activity: (projectId) => request(`/api/projects/${projectId}/activity`),
  verifyQR: (qr_code, scanned_by, location, project_id = 1) =>
    request(`/api/materials/verify?${new URLSearchParams({ qr_code, scanned_by, location, project_id: String(project_id) })}`, {
      method: "POST"
    }),
  allScans: (projectId) => request(`/api/materials/scans/all?project_id=${projectId}`),
  scanWarnings: (projectId) => request(`/api/materials/scans/warnings?project_id=${projectId}`),
  materials: (projectId, status = "all") => request(`/api/materials/?project_id=${projectId}&status=${status}`),
  materialEvidence: (projectId) => request(`/api/materials/evidence?project_id=${projectId}`),
  materialScans: (materialId) => request(`/api/materials/${materialId}/scans`),
  approvals: (projectId) => request(`/api/approvals/?project_id=${projectId}`),
  compliance: (projectId) => request(`/api/compliance/?project_id=${projectId}`),
  chat: (question, projectId) =>
    request("/api/chat/", {
      method: "POST",
      body: JSON.stringify({ question, project_id: projectId })
    })
};

export { API_URL };
