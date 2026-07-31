import { type FormEvent, useState } from 'react';
import { ApiError, completeSetup, type UserResponse } from './api';

interface SetupWizardProps {
  onComplete: (admin: UserResponse) => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [setupCode, setSetupCode] = useState('');
  const [panelName, setPanelName] = useState('Swifty');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    setPending(true);
    setErrors([]);
    try {
      const admin = await completeSetup({
        setupCode: setupCode.trim(),
        panelName: panelName.trim(),
        admin: { email: email.trim(), username: username.trim(), password },
      });
      onComplete(admin);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setErrors(error.fieldErrors.map((e) => `${e.path}: ${e.message}`));
      } else if (error instanceof ApiError) {
        setErrors([error.message]);
      } else {
        setErrors(['Could not reach the panel API']);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="wizard">
      <h1>Welcome to Swifty</h1>
      <p>Let’s set up your panel. This only happens once.</p>

      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label>
            Setup code
            <input
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              placeholder="setup_…"
              autoComplete="off"
              required
            />
            <small>Printed in the panel API console when it started.</small>
          </label>

          <label>
            Panel name
            <input
              value={panelName}
              onChange={(e) => setPanelName(e.target.value)}
              maxLength={64}
              required
            />
          </label>

          <label>
            Admin email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            Admin username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-z0-9][a-z0-9_-]*"
              minLength={3}
              maxLength={32}
              required
            />
            <small>Lowercase letters, digits, dashes and underscores.</small>
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
            />
            <small>At least 12 characters.</small>
          </label>

          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={12}
              required
            />
          </label>

          {errors.length > 0 && (
            <ul className="errors">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          <button type="submit">{pending ? 'Setting up…' : 'Create panel'}</button>
        </fieldset>
      </form>
    </main>
  );
}
