"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor, { OnMount } from "@monaco-editor/react";
import { supabase } from "../../../lib/supabase";
import { socket } from "../../../lib/socket";

type Profile = {
  id: string;
  full_name: string | null;
  role: "mentor" | "student";
};

type SessionData = {
  id: string;
  join_code: string;
  mentor_id: string;
  student_id: string | null;
  status: "pending" | "active" | "ended";
};

type ChatMessage = {
  id?: string;
  message: string;
  content?: string;
  sender: string;
  createdAt: string;
  sender_id?: string;
};

type CursorPayload = {
  userId: string;
  name: string;
  color: string;
  lineNumber: number;
  column: number;
};

type LanguageOption = {
  label: string;
  value: string;
};

type ProfileLookup = {
  id: string;
  full_name: string | null;
};

const LANGUAGES: LanguageOption[] = [
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "Python", value: "python" },
  { label: "Java", value: "java" },
  { label: "C++", value: "cpp" },
];

const CURSOR_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [code, setCode] = useState("// Start coding here...");
  const [language, setLanguage] = useState("javascript");

  const [consoleOutput, setConsoleOutput] = useState("Console ready...");
  const [isRunning, setIsRunning] = useState(false);

  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSavingMessage, setIsSavingMessage] = useState(false);

  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const hasStartedCallRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const remoteCursorDecorationsRef = useRef<Record<string, string[]>>({});
  const remoteCursorStylesRef = useRef<Set<string>>(new Set());
  const myCursorColorRef = useRef<string>(
    CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
  );
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    async function loadSessionPage() {
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
        setErrorMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id, join_code, mentor_id, student_id, status")
        .eq("id", sessionId)
        .single();

      if (sessionError || !sessionData) {
        setErrorMessage("Session not found.");
        setLoading(false);
        return;
      }

      const isMentor = sessionData.mentor_id === user.id;
      const isStudent = sessionData.student_id === user.id;

      if (!isMentor && !isStudent) {
        setErrorMessage("You do not have access to this session.");
        setLoading(false);
        return;
      }

      const participantIds = [
        sessionData.mentor_id,
        sessionData.student_id,
      ].filter(Boolean) as string[];

      const { data: participantProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", participantIds);

      const userMap: Record<string, string> = {};
      (participantProfiles as ProfileLookup[] | null)?.forEach((u) => {
        userMap[u.id] = u.full_name || "User";
      });

      const { data: chatHistory, error: chatError } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (!chatError && chatHistory) {
        const history: ChatMessage[] = chatHistory.map((msg) => ({
          id: msg.id,
          message: msg.content,
          content: msg.content,
          sender:
            msg.sender_id === user.id
              ? profileData.full_name || profileData.role
              : userMap[msg.sender_id] || "User",
          createdAt: msg.created_at,
          sender_id: msg.sender_id,
        }));
        setMessages(history);
      }

      setProfile(profileData);
      setSession(sessionData);

      const { data: savedCode, error: savedCodeError } = await supabase
        .from("code_snapshots")
        .select("code, language, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!savedCodeError && savedCode) {
        setCode(savedCode.code || "// Start coding here...");
        setLanguage(savedCode.language || "javascript");
      }

      setLoading(false);
    }

    loadSessionPage();
  }, [router, sessionId]);

  useEffect(() => {
    async function startLocalMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localStreamRef.current = stream;

        stream.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });

        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play().catch(console.error);
        }
      } catch (error) {
        console.error("Error accessing camera/mic:", error);
      }
    }

    startLocalMedia();

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(console.error);
    }
  }, [loading]);

  function createPeerConnection() {
    const existing = peerConnectionRef.current;
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.ontrack = async (event) => {
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        await remoteVideoRef.current.play().catch(console.error);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          sessionId,
          candidate: event.candidate,
        });
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }

  async function startCallAsMentor() {
    const currentProfile = profileRef.current;
    if (!currentProfile || currentProfile.role !== "mentor") return;
    if (!localStreamRef.current) return;
    if (hasStartedCallRef.current) return;

    hasStartedCallRef.current = true;

    try {
      const pc = createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("offer", {
        sessionId,
        offer,
      });
    } catch (error) {
      console.error("Failed to start call:", error);
      hasStartedCallRef.current = false;
    }
  }

  function ensureCursorStyle(userId: string, color: string, name: string) {
    if (typeof document === "undefined") return;

    const className = `remote-cursor-${userId}`;
    const labelClassName = `remote-cursor-label-${userId}`;

    if (remoteCursorStylesRef.current.has(userId)) return;

    const style = document.createElement("style");
    style.innerHTML = `
      .${className} {
        border-left: 2px solid ${color};
      }
      .${labelClassName}::after {
        content: "${name.replace(/"/g, '\\"')}";
        position: absolute;
        top: -1.2rem;
        left: 0;
        background: ${color};
        color: white;
        font-size: 10px;
        line-height: 1;
        padding: 3px 6px;
        border-radius: 999px;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
    remoteCursorStylesRef.current.add(userId);
  }

  function renderRemoteCursor(cursor: CursorPayload) {
    if (!editorRef.current || !monacoRef.current) return;
    if (!profileRef.current || cursor.userId === profileRef.current.id) return;

    ensureCursorStyle(cursor.userId, cursor.color, cursor.name);

    const oldDecorations =
      remoteCursorDecorationsRef.current[cursor.userId] || [];

    const newDecorations = editorRef.current.deltaDecorations(oldDecorations, [
      {
        range: new monacoRef.current.Range(
          cursor.lineNumber,
          cursor.column,
          cursor.lineNumber,
          cursor.column
        ),
        options: {
          className: `remote-cursor-${cursor.userId}`,
          afterContentClassName: `remote-cursor-label-${cursor.userId}`,
          stickiness:
            monacoRef.current.editor.TrackedRangeStickiness
              .NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    remoteCursorDecorationsRef.current[cursor.userId] = newDecorations;
  }

  useEffect(() => {
    if (!sessionId) return;

    socket.connect();
    socket.emit("join-session", sessionId);

    const handleReceiveCode = (incomingCode: string) => {
      setCode(incomingCode);
    };

    const handleReceiveLanguage = (incomingLanguage: string) => {
      setLanguage(incomingLanguage);
    };

    const handleReceiveMessage = (incomingMessage: ChatMessage) => {
      setMessages((prev) => [...prev, incomingMessage]);
    };

    const handleOffer = async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      try {
        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          sessionId,
          answer,
        });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    const handleAnswer = async ({
      answer,
    }: {
      answer: RTCSessionDescriptionInit;
    }) => {
      try {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    };

    const handleIceCandidate = async ({
      candidate,
    }: {
      candidate: RTCIceCandidateInit;
    }) => {
      try {
        const pc = peerConnectionRef.current;
        if (!pc || !candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    const handleUserReadyForCall = async () => {
      const currentProfile = profileRef.current;
      if (currentProfile?.role === "mentor") {
        await startCallAsMentor();
      }
    };

    const handleReceiveCursor = (payload: CursorPayload) => {
      renderRemoteCursor(payload);
    };

    socket.on("receive-code", handleReceiveCode);
    socket.on("receive-language", handleReceiveLanguage);
    socket.on("receive-message", handleReceiveMessage);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("user-ready-for-call", handleUserReadyForCall);
    socket.on("receive-cursor", handleReceiveCursor);

    return () => {
      socket.off("receive-code", handleReceiveCode);
      socket.off("receive-language", handleReceiveLanguage);
      socket.off("receive-message", handleReceiveMessage);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("user-ready-for-call", handleUserReadyForCall);
      socket.off("receive-cursor", handleReceiveCursor);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!loading && profile && localStreamRef.current) {
      socket.emit("ready-for-call", { sessionId });
    }
  }, [loading, profile, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleEditorChange(value: string | undefined) {
    const newCode = value || "";
    setCode(newCode);
    socket.emit("code-change", { sessionId, code: newCode });
  }

  async function saveCodeSnapshot(newCode: string, newLanguage: string) {
    const { error } = await supabase
      .from("code_snapshots")
      .upsert(
        {
          session_id: sessionId,
          code: newCode,
          language: newLanguage,
        },
        { onConflict: "session_id" }
      );

    if (error) {
      console.log("Save snapshot failed:", error.message || error);
    }
  }

  useEffect(() => {
    if (!sessionId || loading) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveCodeSnapshot(code, language);
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [code, language, sessionId, loading]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = chatMessage.trim();
    if (!trimmed || !profile || isSavingMessage) return;

    setChatMessage("");
    setIsSavingMessage(true);

    socket.emit("send-message", {
      sessionId,
      message: trimmed,
      sender: profile.full_name || profile.role,
    });

    const { error } = await supabase.from("messages").insert({
      session_id: sessionId,
      sender_id: profile.id,
      content: trimmed,
    });

    if (error) {
      console.error("Failed to save message:", error);
    }

    setIsSavingMessage(false);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setIsCameraOn(track.enabled);
    });
  }

  function toggleMic() {
    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setIsMicOn(track.enabled);
    });
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((event) => {
      const currentProfile = profileRef.current;
      if (!currentProfile) return;

      socket.emit("cursor-move", {
        sessionId,
        userId: currentProfile.id,
        name: currentProfile.full_name || currentProfile.role,
        color: myCursorColorRef.current,
        lineNumber: event.position.lineNumber,
        column: event.position.column,
      });
    });
  };

  async function handleRunCode() {
    if (!code.trim()) return;

    setIsRunning(true);
    setConsoleOutput("Running...");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error("NEXT_PUBLIC_API_URL is not configured");
      }

      const res = await fetch(`${apiUrl}/api/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          code,
          stdin: "",
        }),
      });

      const data = await res.json();

      if (data.error) {
        setConsoleOutput(`Error:\n${data.error}`);
      } else {
        let finalOutput = data.output || "No output";

        if (data.time || data.memory) {
          finalOutput += `\n\nTime: ${data.time ?? "-"}s`;
          finalOutput += `\nMemory: ${data.memory ?? "-"} KB`;
        }

        setConsoleOutput(finalOutput);
      }
    } catch (error) {
      console.error("Run code failed:", error);
      setConsoleOutput("Failed to run code.");
    } finally {
      setIsRunning(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#071120] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6 shadow-2xl">
          <p className="text-sm text-white/70">Loading live session...</p>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-[#071120] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl text-center max-w-md w-full">
          <p className="text-lg font-semibold">{errorMessage}</p>
          <button
            onClick={async () => {
              await saveCodeSnapshot(code, language);
              router.push("/dashboard");
            }}
            className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#071120] text-white p-4">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-3">
        <div className="flex items-start justify-end rounded-3xl border border-white/10 bg-[#10192b] px-5 py-3 shadow-xl">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/90">
              Live Workspace
            </p>
            <h1 className="mt-1 text-xl font-semibold">Session Studio</h1>
            <p className="mt-1 text-xs text-white/55">
              Code: <span className="text-white/80">{session?.join_code}</span>
            </p>
            <p className="text-xs text-white/55">
              {profile?.full_name || "User"} ({profile?.role})
            </p>
          </div>

          <button
            onClick={async () => {
              await saveCodeSnapshot(code, language);
              router.push("/dashboard");
            }}
            className="ml-4 rounded-2xl border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Leave Session
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[3.2fr_1.15fr] gap-4">
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_210px] gap-4">
            <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-[#10192b] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-300 border border-cyan-400/20">
                  Language
                </div>

                <select
                  value={language}
                  onChange={(e) => {
                    const newLanguage = e.target.value;
                    setLanguage(newLanguage);
                    socket.emit("language-change", {
                      sessionId,
                      language: newLanguage,
                    });
                  }}
                  className="rounded-2xl border border-white/10 bg-[#071120] px-4 py-2.5 text-sm outline-none min-w-[170px]"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRunCode}
                disabled={isRunning}
                className="rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-95 disabled:opacity-60"
              >
                {isRunning ? "Running..." : "Run Code"}
              </button>
            </div>

            <div className="min-h-0 rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
              <Editor
                height="100%"
                language={language}
                value={code}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                theme="vs-dark"
                options={{
                  fontSize: 15,
                  minimap: { enabled: false },
                  padding: { top: 6, bottom: 6 },
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  lineNumbersMinChars: 2,
                }}
              />
            </div>

            <div className="min-h-0 rounded-3xl border border-emerald-400/10 bg-black px-4 py-4 flex flex-col shadow-2xl">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-emerald-400">
                    Output
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    Execution console
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setConsoleOutput("Console cleared...")}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Clear
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-[#03191a] border border-emerald-400/10 p-3">
                <pre className="whitespace-pre-wrap text-sm text-emerald-300 leading-6">
                  {consoleOutput}
                </pre>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[210px_minmax(0,1fr)] gap-4">
            <div className="min-h-0 rounded-3xl border border-white/10 bg-[#10192b] p-4 shadow-xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">Video Call</p>
                  <p className="text-xs text-white/45 mt-0.5">
                    Live collaboration
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={toggleCamera}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
                  >
                    {isCameraOn ? "Camera Off" : "Camera On"}
                  </button>
                  <button
                    onClick={toggleMic}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
                  >
                    {isMicOn ? "Mute" : "Unmute"}
                  </button>
                </div>
              </div>

              <div className="grid h-[calc(100%-52px)] grid-cols-2 gap-3">
                <div className="relative overflow-hidden rounded-2xl bg-[#071120] border border-white/5">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[10px] font-medium">
                    You
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-[#071120] border border-white/5">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[10px] font-medium">
                    Participant
                  </span>
                </div>
              </div>
            </div>

            <div className="min-h-0 rounded-3xl border border-white/10 bg-[#10192b] p-4 shadow-xl flex flex-col">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold">Chat</p>
                  <p className="text-xs text-white/45 mt-0.5">
                    Live session messages
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                  {messages.length} messages
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto space-y-2 rounded-2xl bg-[#071120] border border-white/5 p-2.5">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-white/35">
                    No messages yet...
                  </div>
                ) : (
                  <>
                    {messages.map((msg, index) => {
                      const isMine =
                        msg.sender_id === profile?.id ||
                        msg.sender === (profile?.full_name || profile?.role);

                      return (
                        <div
                          key={`${msg.createdAt}-${index}`}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                              isMine
                                ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950"
                                : "bg-white/10 text-white border border-white/10"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className={`h-5 w-5 rounded-full text-[9px] font-semibold flex items-center justify-center ${
                                  isMine
                                    ? "bg-slate-950 text-white"
                                    : "bg-white text-slate-950"
                                }`}
                              >
                                {msg.sender?.charAt(0).toUpperCase()}
                              </div>
                              <p className="text-[10px] opacity-80 font-medium">
                                {msg.sender}
                              </p>
                            </div>

                            <p className="leading-5">{msg.message || msg.content}</p>

                            <p className="mt-1 text-[9px] opacity-60">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="mt-3 flex gap-3">
                <input
                  type="text"
                  placeholder="Type message..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  className="flex-1 rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-sm outline-none placeholder:text-white/30"
                />
                <button
                  type="submit"
                  disabled={isSavingMessage}
                  className="rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95 disabled:opacity-60"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}