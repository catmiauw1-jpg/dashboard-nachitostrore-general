"use client";

import type { Session } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/browserSupabase";

const Dashboard = dynamic(
  () => import("@/components/Dashboard").then((module) => module.Dashboard),
  {
    ssr: false,
    loading: () => (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="section-kicker">Admin</span>
          <h1>Cargando panel</h1>
          <p>Estamos preparando tus datos de administracion.</p>
        </section>
      </main>
    )
  }
);

export function AdminGate() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Cargando acceso...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setMessage("Supabase no esta configurado.");
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setMessage("");
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setMessage("");
      setIsLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      setMessage("Correo o contrasena incorrectos.");
      setIsSubmitting(false);
      return;
    }

    setPassword("");
    setIsSubmitting(false);
  };

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  if (isLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="section-kicker">Admin</span>
          <h1>Verificando acceso</h1>
          <p>Estamos preparando tu panel seguro.</p>
        </section>
      </main>
    );
  }

  if (session?.access_token) {
    return (
      <Dashboard
        accessToken={session.access_token}
        adminEmail={session.user.email ?? "Admin"}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="section-kicker">PoleraFlow Admin</span>
        <h1>Iniciar sesion</h1>
        <p>Accede para administrar productos, stock, pedidos y configuracion de Nachito Store.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Correo administrador</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu-correo@gmail.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>Contrasena</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu contrasena segura"
              required
              type="password"
              value={password}
            />
          </label>

          {message ? <p className="auth-message">{message}</p> : null}

          <button className="btn primary auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Entrando..." : "Entrar al panel"}
          </button>
        </form>
      </section>
    </main>
  );
}
