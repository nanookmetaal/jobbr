"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ApproveContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const email = params.get("email");
    const secret = params.get("secret");
    if (!email || !secret) {
      setStatus("error");
      setMessage("Missing email or secret.");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${apiUrl}/auth/approve?email=${encodeURIComponent(email)}&secret=${encodeURIComponent(secret)}`)
      .then((res) => res.text())
      .then((html) => {
        // Extract text from the HTML response
        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        setMessage(text);
        setStatus("done");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Failed to contact the server.");
      });
  }, [params]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 px-8 py-10 text-center max-w-md">
        {status === "loading" && (
          <>
            <div className="text-2xl mb-3">⏳</div>
            <p className="text-white">Processing approval...</p>
          </>
        )}
        {status === "done" && (
          <>
            <div className="text-2xl mb-3">✅</div>
            <p className="text-white font-semibold">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-2xl mb-3">❌</div>
            <p className="text-red-400">{message}</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ApprovePage() {
  return (
    <Suspense>
      <ApproveContent />
    </Suspense>
  );
}
