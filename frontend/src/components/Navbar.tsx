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
    <nav className="sticky top-0 z-50 border-b border-stone-200 bg-[#faf8f5]/95 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="text-stone-800 font-medium text-sm tracking-[0.2em] uppercase">
          jobbr
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
            <span className="ml-2 text-sm text-stone-400 hidden sm:block">{email}</span>
          )}
          <button
            onClick={handleSignOut}
            className="ml-1 px-3 py-1.5 text-sm text-stone-400 hover:text-red-500 transition-colors"
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
          ? "bg-stone-100 text-stone-900"
          : "text-stone-500 hover:text-stone-900 hover:bg-stone-100"
      }`}
    >
      {children}
    </Link>
  );
}
