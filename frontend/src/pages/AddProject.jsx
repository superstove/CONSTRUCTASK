import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { api } from "../api/client.js";

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function getInitialForm() {
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  return {
    name: "",
    location: "",
    start_date: formatDateInput(startDate),
    end_date: formatDateInput(endDate),
    status: "Active",
    risk_score: "Medium"
  };
}

function getErrorMessage(message) {
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed.detail)) {
      return parsed.detail.map((item) => item.msg).join(" ");
    }
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    return message;
  }

  return message;
}

export default function AddProject({ onSuccess }) {
  const [form, setForm] = useState(getInitialForm);
  const [savedProject, setSavedProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.start_date || !form.end_date) {
      setError("Start date and end date are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const project = await api.createProject(form);
      setSavedProject(project);
      setForm(getInitialForm());
      onSuccess?.(project);
    } catch (err) {
      setError(getErrorMessage(err.message));
    } finally {
      setSaving(false);
    }
  }

  if (savedProject) {
    return (
      <section className="page-grid">
        <article className="panel wide-panel success-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Success</p>
              <h2>Project Created</h2>
            </div>
            <PlusCircle size={24} />
          </div>
          <p className="muted-copy">
            <strong>{savedProject.name}</strong> is now saved in the database and available in the active project selector.
          </p>
          <button className="primary-button" type="button" onClick={() => setSavedProject(null)}>
            <PlusCircle size={18} />
            Add another project
          </button>
        </article>
      </section>
    );
  }

  return (
    <section className="page-grid">
      <article className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">New project</p>
            <h2>Create Project</h2>
          </div>
          <PlusCircle size={24} />
        </div>

        {error ? <div className="empty-state">{error}</div> : null}

        <form className="project-form" onSubmit={handleSubmit}>
          <label>
            <span>Project name</span>
            <input name="name" placeholder="NH66 Highway Slope Protection" value={form.name} onChange={handleChange} required />
          </label>

          <label>
            <span>Location</span>
            <input name="location" placeholder="Kerala, India" value={form.location} onChange={handleChange} required />
          </label>

          <div className="form-grid">
            <label>
              <span>Start date</span>
              <input name="start_date" type="date" value={form.start_date} onChange={handleChange} required />
            </label>

            <label>
              <span>End date</span>
              <input name="end_date" type="date" value={form.end_date} onChange={handleChange} required />
            </label>
          </div>

          <div className="form-grid">
            <label>
              <span>Status</span>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </label>

            <label>
              <span>Risk score</span>
              <select name="risk_score" value={form.risk_score} onChange={handleChange}>
                <option value="High">High Risk</option>
                <option value="Medium">Medium Risk</option>
                <option value="Low">Low Risk</option>
              </select>
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={saving}>
            <PlusCircle size={18} />
            {saving ? "Creating..." : "Create Project"}
          </button>
        </form>
      </article>
    </section>
  );
}
