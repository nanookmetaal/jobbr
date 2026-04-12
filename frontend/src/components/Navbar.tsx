"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, isAdminSession, getAuthEmail } from "@/lib/auth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setIsAdmin(isAdminSession());
    setEmail(getAuthEmail());
  }, []);

  const handleSignOut = () => {
    clearSession();
    router.replace("/");
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="text-white font-bold text-lg tracking-tight">
          Jobbr
        </Link>

        <div className="flex items-center gap-1">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            Dashboard
          </NavLink>
          {!isAdmin && (
            <NavLink href="/matches" active={pathname === "/matches"}>
              Matches
            </NavLink>
          )}
          {isAdmin && (
            <NavLink href="/admin" active={pathname === "/admin"}>
              Admin
            </NavLink>
          )}
          {email && (
            <span className="ml-2 text-sm text-gray-500 hidden sm:block">{email}</span>
          )}
          <button
            onClick={handleSignOut}
            className="ml-1 px-3 py-1.5 text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
        active
          ? "bg-gray-800 text-white"
          : "text-gray-400 hover:text-white hover:bg-gray-800/50"
      }`}
    >
      {children}
    </Link>
  );
}
