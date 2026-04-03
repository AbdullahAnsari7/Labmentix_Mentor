import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || "https://ce.judge0.com";
const JUDGE0_AUTH_TOKEN = process.env.JUDGE0_AUTH_TOKEN || "";

const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Backend is running" });
});

type RunCodeRequest = {
  language: string;
  code: string;
  stdin?: string;
};

type Judge0SubmissionResponse = {
  token: string;
};

type Judge0Result = {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  status?: {
    id: number;
    description: string;
  };
  time?: string;
  memory?: number;
};

function normalizeLanguage(language: string): string {
  const value = language.trim().toLowerCase();

  const aliases: Record<string, string> = {
    js: "javascript",
    javascript: "javascript",
    node: "javascript",
    nodejs: "javascript",

    ts: "typescript",
    typescript: "typescript",

    py: "python",
    python: "python",

    java: "java",

    "c++": "cpp",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
  };

  return aliases[value] || value;
}

function getJudge0LanguageId(language: string): number | null {
  const normalized = normalizeLanguage(language);

  const map: Record<string, number> = {
    javascript: 63,
    typescript: 74,
    python: 71,
    java: 62,
    cpp: 54,
  };

  return map[normalized] ?? null;
}

function preprocessCode(language: string, code: string): string {
  const normalized = normalizeLanguage(language);
  let finalCode = code;

  if (normalized === "java") {
    if (/public\s+class\s+\w+/.test(finalCode)) {
      finalCode = finalCode.replace(
        /public\s+class\s+\w+/,
        "public class Main"
      );
    } else if (/class\s+\w+/.test(finalCode)) {
      finalCode = finalCode.replace(/class\s+\w+/, "class Main");
    }
  }

  return finalCode;
}

function buildJudge0Headers() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (JUDGE0_AUTH_TOKEN) {
    headers["X-Auth-Token"] = JUDGE0_AUTH_TOKEN;
  }

  return headers;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/api/run", async (req, res) => {
  try {
    const { language, code, stdin }: RunCodeRequest = req.body;

    if (!language || typeof language !== "string") {
      return res.status(400).json({
        error: "language is required",
      });
    }

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        error: "code is required",
      });
    }

    const normalizedLanguage = normalizeLanguage(language);
    const languageId = getJudge0LanguageId(normalizedLanguage);

    if (!languageId) {
      return res.status(400).json({
        error: `Unsupported language: ${language}`,
      });
    }

    const finalCode = preprocessCode(normalizedLanguage, code);

    const submissionRes = await fetch(
      `${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=false`,
      {
        method: "POST",
        headers: buildJudge0Headers(),
        body: JSON.stringify({
          source_code: finalCode,
          language_id: languageId,
          stdin: stdin || "",
        }),
      }
    );

    if (!submissionRes.ok) {
      const errorText = await submissionRes.text();
      return res.status(500).json({
        error: `Judge0 submission failed: ${errorText}`,
      });
    }

    const submissionData =
      (await submissionRes.json()) as Judge0SubmissionResponse;

    if (!submissionData.token) {
      return res.status(500).json({
        error: "Judge0 did not return a token",
      });
    }

    let result: Judge0Result | null = null;

    for (let i = 0; i < 15; i++) {
      await sleep(1000);

      const resultRes = await fetch(
        `${JUDGE0_BASE_URL}/submissions/${submissionData.token}?base64_encoded=false`,
        {
          headers: buildJudge0Headers(),
        }
      );

      if (!resultRes.ok) {
        const errorText = await resultRes.text();
        return res.status(500).json({
          error: `Judge0 polling failed: ${errorText}`,
        });
      }

      const resultData = (await resultRes.json()) as Judge0Result;
      result = resultData;

      const statusId = resultData.status?.id;

      if (statusId !== 1 && statusId !== 2) {
        break;
      }
    }

    if (!result) {
      return res.status(500).json({
        error: "No result received from Judge0",
      });
    }

    const output =
      result.stdout ||
      result.stderr ||
      result.compile_output ||
      result.message ||
      result.status?.description ||
      "No output";

    return res.json({
      success: true,
      output,
      status: result.status?.description || "Unknown",
      time: result.time || null,
      memory: result.memory || null,
      language: normalizedLanguage,
    });
  } catch (error) {
    console.error("Run code error:", error);
    return res.status(500).json({
      error: "Failed to run code",
    });
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-session", (sessionId: string) => {
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined session ${sessionId}`);
  });

  socket.on(
    "cursor-move",
    ({
      sessionId,
      ...payload
    }: {
      sessionId: string;
      userId: string;
      name: string;
      color: string;
      lineNumber: number;
      column: number;
    }) => {
      socket.to(sessionId).emit("receive-cursor", payload);
    }
  );

  socket.on(
    "code-change",
    ({ sessionId, code }: { sessionId: string; code: string }) => {
      socket.to(sessionId).emit("receive-code", code);
    }
  );

  socket.on(
    "language-change",
    ({
      sessionId,
      language,
    }: {
      sessionId: string;
      language: string;
    }) => {
      socket.to(sessionId).emit("receive-language", language);
    }
  );

  socket.on(
    "send-message",
    ({
      sessionId,
      message,
      sender,
    }: {
      sessionId: string;
      message: string;
      sender: string;
    }) => {
      io.to(sessionId).emit("receive-message", {
        message,
        sender,
        createdAt: new Date().toISOString(),
      });
    }
  );

  socket.on(
    "ready-for-call",
    ({ sessionId }: { sessionId: string }) => {
      socket.to(sessionId).emit("user-ready-for-call");
    }
  );

  socket.on(
    "offer",
    ({
      sessionId,
      offer,
    }: {
      sessionId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      socket.to(sessionId).emit("offer", { offer });
    }
  );

  socket.on(
    "answer",
    ({
      sessionId,
      answer,
    }: {
      sessionId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      socket.to(sessionId).emit("answer", { answer });
    }
  );

  socket.on(
    "ice-candidate",
    ({
      sessionId,
      candidate,
    }: {
      sessionId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      socket.to(sessionId).emit("ice-candidate", { candidate });
    }
  );

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});