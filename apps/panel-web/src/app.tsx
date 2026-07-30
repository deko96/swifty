import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  uptimeSeconds: number;
  panelApiVersion: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => setError(true));
  }, []);

  return (
    <main className="landing">
      <h1>Swifty</h1>
      <p>Open-source game server control panel.</p>
      <p className="status">
        {health && (
          <>
            API <span className="ok">online</span> · v{health.panelApiVersion}
          </>
        )}
        {error && (
          <>
            API <span className="down">unreachable</span>
          </>
        )}
        {!health && !error && 'Checking API…'}
      </p>
    </main>
  );
}
