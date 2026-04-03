"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { signOutUser } from "../../lib/auth";
import { generateJoinCode } from "../../lib/utils";

type Profile = {
  id: string;
  full_name: string | null;
  role: "mentor" | "student";
};

type SessionRow = {
  id: string;
  join_code: string;
  status: "pending" | "active" | "ended";
  created_at: string;
  mentor_id: string;
  student_id: string | null;
};

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (profileData.role === "mentor") {
        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select("id, join_code, status, created_at, mentor_id, student_id")
          .eq("mentor_id", user.id)
          .order("created_at", { ascending: false });

        if (!sessionError && sessionData) {
          setSessions(sessionData);
        }
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    await signOutUser();
    router.push("/login");
  }

  async function handleCreateSession() {
    if (!profile) return;

    setCreating(true);
    setMessage("");

    const code = generateJoinCode();

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        mentor_id: profile.id,
        join_code: code,
        status: "pending",
        language: "javascript",
      })
      .select()
      .single();

    if (error || !data) {
      setMessage(error?.message || "Failed to create session.");
      setCreating(false);
      return;
    }

    setSessions((prev) => [data, ...prev]);
    setCreating(false);
    setMessage(`Session created. Join code: ${data.join_code}`);
  }

  async function handleDeleteSession(sessionId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this session?"
    );

    if (!confirmed) return;

    setDeletingSessionId(sessionId);
    setMessage("");

    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);

    if (error) {
      setMessage("Could not delete session.");
      setDeletingSessionId(null);
      return;
    }

    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    setDeletingSessionId(null);
    setMessage("Session deleted successfully.");
  }

  async function handleJoinSession(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const cleanedCode = joinCode.trim().toUpperCase();

    if (!cleanedCode) {
      setMessage("Please enter a join code.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: foundSession, error: findError } = await supabase
      .from("sessions")
      .select("id, status, student_id")
      .eq("join_code", cleanedCode)
      .single();

    if (findError || !foundSession) {
      setMessage("Invalid join code.");
      return;
    }

    if (foundSession.status === "ended") {
      setMessage("This session has already ended.");
      return;
    }

    if (foundSession.student_id) {
      setMessage("This session already has a student.");
      return;
    }

    const { data, error } = await supabase
      .from("sessions")
      .update({
        student_id: user.id,
        status: "active",
      })
      .eq("id", foundSession.id)
      .select()
      .single();

    if (error || !data) {
      setMessage("Could not join session.");
      return;
    }

    router.push(`/session/${data.id}`);
  }

  function openSession(sessionId: string) {
    router.push(`/session/${sessionId}`);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  function getStatusBadge(status: SessionRow["status"]) {
    if (status === "active") {
      return "bg-emerald-500/15 text-emerald-300 border-emerald-400/20";
    }
    if (status === "pending") {
      return "bg-yellow-500/15 text-yellow-300 border-yellow-400/20";
    }
    return "bg-white/10 text-white/70 border-white/10";
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setMessage("Could not copy code.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#071120] text-white flex items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6 shadow-2xl">
          <p className="text-sm text-white/70">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#071120] text-white px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[32px] border border-white/10 bg-[#10192b] px-7 py-6 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">
                Dashboard
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Welcome, {profile?.full_name || "User"}
              </h1>
              <p className="mt-2 text-white/55">
                Role: <span className="text-white">{profile?.role}</span>
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Logout
            </button>
          </div>
        </div>

        {profile?.role === "mentor" ? (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="rounded-[32px] border border-white/10 bg-[#10192b] p-6 shadow-2xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">
                Mentor Actions
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Create new session</h2>
              <p className="mt-2 text-sm text-white/55 leading-6">
                Generate a new code and start a fresh live workspace for your
                student.
              </p>

              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95 disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Session"}
              </button>

              {message && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                  {message}
                </div>
              )}
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[#10192b] p-6 shadow-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">
                    Sessions
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Your sessions</h2>
                </div>

                <span className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                  {sessions.length} total
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/5 px-6 py-12 text-center text-white/45">
                  No sessions created yet.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-3xl border border-white/10 bg-[#0b1322] px-5 py-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-3">
                              <p className="text-2xl font-semibold tracking-wide">
                                {session.join_code}
                              </p>

                              <button
                                onClick={() =>
                                  copyToClipboard(session.join_code, session.id)
                                }
                                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition"
                              >
                                {copiedId === session.id ? "Copied!" : "Copy"}
                              </button>
                            </div>

                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadge(
                                session.status
                              )}`}
                            >
                              {session.status}
                            </span>
                          </div>

                          <p className="text-sm text-white/45">
                            Created: {formatDate(session.created_at)}
                          </p>

                          <p className="text-sm text-white/55">
                            Student joined:{" "}
                            <span className="text-white/80">
                              {session.student_id ? "Yes" : "No"}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => openSession(session.id)}
                            className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                          >
                            Open Session
                          </button>

                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            disabled={deletingSessionId === session.id}
                            className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
                          >
                            {deletingSessionId === session.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[32px] border border-white/10 bg-[#10192b] p-6 shadow-2xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">
              Student Access
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Join a session</h2>
            <p className="mt-2 text-sm text-white/55 leading-6">
              Enter the join code shared by your mentor to access the live
              workspace.
            </p>

            <form onSubmit={handleJoinSession} className="mt-6 space-y-4">
              <input
                type="text"
                placeholder="Enter join code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-4 uppercase outline-none placeholder:text-white/30"
                required
              />

              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95"
              >
                Join Session
              </button>
            </form>

            {message && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                {message}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}