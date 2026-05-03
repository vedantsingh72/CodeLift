import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL;
const STATUS_URL = process.env.REACT_APP_STATUS_URL;
const PREVIEW_URL = process.env.REACT_APP_PREVIEW_URL;

const statusLabels = {
  uploaded: "Uploaded. Waiting for builder...",
  downloading: "Downloading source from S3...",
  building: "Building static files...",
  uploading: "Uploading converted files...",
  deployed: "Deployed",
  failed: "Failed"
};

function buildPreviewUrl(id) {
  return `${PREVIEW_URL.replace(/\/$/, "")}/?id=${encodeURIComponent(id)}`;
}

function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [deployment, setDeployment] = useState(null);
  const [status, setStatus] = useState("idle");
  const [buildStatus, setBuildStatus] = useState("");
  const [error, setError] = useState("");

  const previewUrl = useMemo(() => {
    if (!deployment?.id) return "";
    return deployment.deploymentUrl || buildPreviewUrl(deployment.id);
  }, [deployment]);

  const canPreview = buildStatus === "deployed";
  const statusText = statusLabels[buildStatus] || deployment?.message || "";

  useEffect(() => {
    if (!deployment?.id || canPreview || buildStatus === "failed") return undefined;

    const pollStatus = async () => {
      try {
        const response = await fetch(`${STATUS_URL}?id=${deployment.id}`);
        const data = await response.json();

        if (data.status) {
          setBuildStatus(data.status);
        }

        if (data.deploymentUrl) {
          setDeployment((currentDeployment) => {
            if (!currentDeployment) return currentDeployment;
            return {
              ...currentDeployment,
              deploymentUrl: data.deploymentUrl
            };
          });
        }
      } catch (err) {
        console.error("Failed to fetch deploy status:", err);
      }
    };

    pollStatus();
    const intervalId = window.setInterval(pollStatus, 2500);

    return () => window.clearInterval(intervalId);
  }, [buildStatus, canPreview, deployment]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setDeployment(null);
    setBuildStatus("");

    const trimmedRepoUrl = repoUrl.trim();

    if (!trimmedRepoUrl) {
      setError("Enter a GitHub repository URL.");
      return;
    }

    try {
      setStatus("deploying");

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ repoUrl: trimmedRepoUrl })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Deployment failed.");
      }

      setDeployment({
        ...data,
        deploymentUrl: data.deploymentUrl || buildPreviewUrl(data.id)
      });
      setBuildStatus("uploaded");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong.");
    }
  }

  return (
    <main className="page-shell">
      <section className="deploy-panel">
        <div className="panel-header">
          <p className="eyebrow">CodeLift</p>
          <h1>Deploy a frontend Project</h1>
          <p className="lede">
            Upload a GitHub project, and get your deployed link.
          </p>
        </div>

        <form className="deploy-form" onSubmit={handleSubmit}>
          <label htmlFor="repoUrl">GitHub repository URL</label>
          <div className="input-row">
            <input
              id="repoUrl"
              type="url"
              value={repoUrl}
              placeholder="https://github.com/user/react-app"
              onChange={(event) => setRepoUrl(event.target.value)}
            />
            <button type="submit" disabled={status === "deploying"}>
              {status === "deploying" ? "Deploying..." : "Deploy"}
            </button>
          </div>
        </form>

        {error && <p className="message error">{error}</p>}

        {deployment && (
          <div className="result">
            <div>
              <span>Deploy id</span>
              <strong>{deployment.id}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{statusText}</strong>
            </div>
            {canPreview ? (
              <a href={previewUrl} target="_blank" rel="noreferrer">
                Open preview
              </a>
            ) : (
              <button type="button" disabled>
                Preparing
              </button>
            )}
          </div>
        )}

        <div className="steps">
          <div>
            <span>1</span>
            <p>CodeLift uploads source files to S3.</p>
          </div>
          <div>
            <span>2</span>
            <p>CodeLift Deploy builds and uploads converted files.</p>
          </div>
          <div>
            <span>3</span>
            <p>CodeLift Request serves the converted output.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
