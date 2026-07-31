import { useEffect, useState } from 'react';
import { getHealth, getSetupStatus, type HealthResponse, type UserResponse } from './api';
import { SetupWizard } from './setup-wizard';

type Phase = 'loading' | 'setup' | 'ready' | 'unreachable';

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [admin, setAdmin] = useState<UserResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    getSetupStatus()
      .then((status) => setPhase(status.required ? 'setup' : 'ready'))
      .catch(() => setPhase('unreachable'));
  }, []);

  useEffect(() => {
    if (phase === 'ready') {
      getHealth()
        .then(setHealth)
        .catch(() => undefined);
    }
  }, [phase]);

  if (phase === 'setup') {
    return (
      <SetupWizard
        onComplete={(user) => {
          setAdmin(user);
          setPhase('ready');
        }}
      />
    );
  }

  return (
    <main className="landing">
      <h1>Swifty</h1>
      <p>Open-source game server control panel.</p>
      <p className="status">
        {phase === 'loading' && 'Checking API…'}
        {phase === 'unreachable' && (
          <>
            API <span className="down">unreachable</span>
          </>
        )}
        {phase === 'ready' && health && (
          <>
            API <span className="ok">online</span> · v{health.panelApiVersion}
          </>
        )}
        {phase === 'ready' && admin && <> · signed in as {admin.username}</>}
      </p>
    </main>
  );
}
