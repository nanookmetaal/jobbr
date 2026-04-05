"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid link - no token found.");
      return;
    }

    const previousEmail = typeof window !== "undefined" ? localStorage.getItem("auth_email") : null;

    api.auth.verify(token)
      .then(({ token: sessionToken, email, profile_id, is_admin }) => {
        const isEmailChange = previousEmail && previousEmail !== email;
        setSession(sessionToken, email, profile_id, !!is_admin);
        if (is_admin) {
          router.replace("/admin");
        } else if (isEmailChange) {
          router.replace("/profile/edit?email_changed=1");
        } else if (profile_id) {
          router.replace(`/dashboard?profile_id=${profile_id}`);
        } else {
          router.replace("/profile/create");
        }
      })
      .catch(() => setError("This link is invalid or has expired. Please request a new one."));
  }, [searchParams, router]);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-red-400 mb-4">{error}</p>
          <a href="/" className="text-blue-400 hover:underline text-sm">Back to home</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Signing you in...</p>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
