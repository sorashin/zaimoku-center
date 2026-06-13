import { useState } from 'react';

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  redirectTo: string;
}

// supabase モードのログインUI。
// Google OAuth（signInWithOAuth）＋ メール/パスワードのサインイン・サインアップ切替。
// ※ アカウント未作成のため未検証。@supabase/supabase-js のブラウザクライアントを使用。
export function AuthForm({ supabaseUrl, supabaseAnonKey, redirectTo }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function getClient() {
    const { createBrowserClient } = await import('@supabase/ssr');
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  function safeRedirect(): string {
    return redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError('');
    try {
      const client = await getClient();
      const callback = `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(
        safeRedirect()
      )}`;
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback },
      });
      if (error) throw error;
      // signInWithOAuth はリダイレクトするためここには通常到達しない。
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Googleログインに失敗しました。');
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const client = await getClient();
      if (mode === 'signup') {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(
              safeRedirect()
            )}`,
          },
        });
        if (error) throw error;
        setNotice('確認メールを送信しました。メール内のリンクから登録を完了してください。');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = safeRedirect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full box-border h-[50px] rounded-btn border border-border-strong bg-surface px-3.5 text-[15px] text-ink outline-none transition-colors focus:border-ink focus:shadow-[inset_0_0_0_1px_#222222]';

  return (
    <div className="mt-6 flex flex-col gap-4">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-btn border border-border-strong bg-surface text-[15px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" fill="#4285F4" />
          <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 009 18z" fill="#34A853" />
          <path d="M3.97 10.72A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 000 9c0 1.45.35 2.82.96 4.06l3.01-2.34z" fill="#FBBC05" />
          <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 00.96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
        </svg>
        Googleでログイン
      </button>

      <div className="flex items-center gap-3 text-[12px] text-ink-faint">
        <span className="h-px flex-1 bg-hairline" />
        または
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={submitEmail} className="flex flex-col gap-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          autoComplete="email"
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード（6文字以上）"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          className={inputClass}
        />
        {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
        {notice && <p className="text-[13px] font-medium text-ink-sub">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-[50px] w-full rounded-btn bg-primary text-[16px] font-bold text-ink transition-colors hover:bg-primary-active disabled:opacity-60"
        >
          {busy ? '処理中…' : mode === 'signup' ? '新規登録' : 'ログイン'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setError('');
          setNotice('');
        }}
        className="text-[13px] text-ink-sub underline"
      >
        {mode === 'signin' ? 'アカウントをお持ちでない方はこちら（新規登録）' : 'すでにアカウントをお持ちの方はこちら（ログイン）'}
      </button>
    </div>
  );
}
