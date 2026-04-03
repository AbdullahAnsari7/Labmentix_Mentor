import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border p-8 text-center shadow-sm">
        <h1 className="text-4xl font-bold">Mentorship Platform</h1>
        <p className="mt-3 text-gray-600">
          1-on-1 mentor and student live coding sessions
        </p>

        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-black px-5 py-3 text-white"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="rounded-lg border px-5 py-3"
          >
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}