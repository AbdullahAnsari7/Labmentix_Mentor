"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUpUser } from "../../lib/auth";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"mentor" | "student">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await signUpUser({
      fullName,
      email,
      password,
      role,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Signup successful. Please check your email if confirmation is enabled.");
    setLoading(false);
    router.push("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-sm"
      >
        <h1 className="text-3xl font-bold">Create account</h1>

        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border px-4 py-3"
          required
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "mentor" | "student")}
          className="w-full rounded-lg border px-4 py-3"
        >
          <option value="student">Student</option>
          <option value="mentor">Mentor</option>
        </select>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border px-4 py-3"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border px-4 py-3"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>

        {message && <p className="text-sm text-gray-600">{message}</p>}
      </form>
    </main>
  );
}