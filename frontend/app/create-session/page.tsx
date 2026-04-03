"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/sessions";

export default function CreateSessionPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await createSession({
        title,
        description,
        meeting_link: meetingLink,
        session_date: sessionDate,
      });

      setMessage("Session created successfully");
      router.push("/dashboard");
    } catch (error: any) {
      setMessage(error.message || "Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-xl border border-white/30 rounded-2xl p-8">
        <h1 className="text-3xl font-bold mb-6">Create Mentor Session</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Session title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 rounded-lg bg-transparent border border-white/20"
            required
          />

          <textarea
            placeholder="Session description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 rounded-lg bg-transparent border border-white/20"
            rows={4}
          />

          <input
            type="url"
            placeholder="Meeting link"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            className="w-full p-3 rounded-lg bg-transparent border border-white/20"
          />

          <input
            type="datetime-local"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="w-full p-3 rounded-lg bg-transparent border border-white/20"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-semibold py-3 rounded-lg"
          >
            {loading ? "Creating..." : "Create Session"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-gray-300">{message}</p>}
      </div>
    </div>
  );
}