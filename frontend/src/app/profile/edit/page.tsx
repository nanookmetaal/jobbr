"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ProfileType } from "@/lib/api";
import { isAuthenticated, getAuthEmail } from "@/lib/auth";
import { sanitizeLinkedInUrl, sanitizeWebsiteUrl } from "@/lib/urls";
import Navbar from "@/components/Navbar";

const PROFILE_TYPES: { value: ProfileType; label: string; desc: string }[] = [
  { value: "job_seeker", label: "Job Seeker", desc: "Looking for a new role" },
  { value: "employer", label: "Employer", desc: "Hiring talent" },
  { value: "mentee", label: "Mentee", desc: "Looking for guidance" },
  { value: "mentor", label: "Mentor", desc: "Sharing knowledge & experience" },
];

type FormData = {
  name: string;
  profile_type: ProfileType;
  secondary_role: "mentor" | "mentee" | null;
  location: string;
  linkedin_url: string;
  website_url: string;
  title: string;
  work_history: string;
  education: string;
  bio: string;
  skillsInput: string;
  skills: string[];
  experience_years: number;
  looking_for: string;
};

export default function EditProfilePage() {
  return (
    <Suspense>
      <EditProfileContent />
    </Suspense>
  );
}

function EditProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailChanged = searchParams.get("email_changed") === "1";
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeMsg, setEmailChangeMsg] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/");
      return;
    }
    const profileId = localStorage.getItem("profile_id");
    if (!profileId) {
      router.replace("/profile/create");
      return;
    }
    api.profiles.get(profileId).then((profile) => {
      setForm({
        name: profile.name,
        profile_type: profile.profile_type as ProfileType,
        secondary_role: profile.secondary_role ?? null,
        location: profile.location,
        linkedin_url: profile.linkedin_url ?? "",
        website_url: profile.website_url ?? "",
        title: profile.title,
        work_history: profile.work_history ?? "",
        education: profile.education ?? "",
        bio: profile.bio,
        skillsInput: "",
        skills: profile.skills,
        experience_years: profile.experience_years,
        looking_for: profile.looking_for,
      });
    }).catch(() => {
      setError("Failed to load profile.");
    }).finally(() => setLoadingProfile(false));
  }, [router]);

  const update = (key: keyof FormData, value: unknown) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const VALID_COMBOS: [ProfileType, ProfileType][] = [
    ["job_seeker", "mentee"],
    ["employer", "mentor"],
  ];

  const handleTypeClick = (clicked: ProfileType) => {
    if (!form) return;
    const current = form.profile_type;
    const secondary = form.secondary_role as ProfileType | null;

    if (clicked === secondary) {
      update("secondary_role", null);
      return;
    }
    if (clicked === current && secondary) {
      update("profile_type", secondary);
      update("secondary_role", null);
      return;
    }
    const isValidAddition = VALID_COMBOS.some(
      ([a, b]) => (a === current && b === clicked) || (b === current && a === clicked)
    );
    if (isValidAddition) {
      if (clicked === "job_seeker" || clicked === "employer") {
        update("profile_type", clicked);
        update("secondary_role", current);
      } else {
        update("secondary_role", clicked);
      }
      return;
    }
    update("profile_type", clicked);
    update("secondary_role", null);
  };

  const handleSkillsBlur = () => {
    if (!form?.skillsInput.trim()) return;
    const newSkills = form.skillsInput.split(",").map((s) => s.trim()).filter(Boolean);
    update("skills", Array.from(new Set([...form.skills, ...newSkills])));
    update("skillsInput", "");
  };

  const removeSkill = (skill: string) =>
    update("skills", form!.skills.filter((s) => s !== skill));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const profileId = localStorage.getItem("profile_id");
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      await api.profiles.update(profileId, {
        name: form.name,
        profile_type: form.profile_type,
        secondary_role: form.secondary_role,
        location: form.location,
        title: form.title,
        bio: form.bio,
        skills: form.skills,
        experience_years: form.experience_years,
        looking_for: form.looking_for,
        work_history: form.work_history || undefined,
        education: form.education || undefined,
        linkedin_url: form.linkedin_url || undefined,
        website_url: form.website_url || undefined,
      });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loadingProfile) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
          <Spinner />
        </div>
      </>
    );
  }

  if (!form) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center text-stone-500">
          {error ?? "Profile not found."}
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#faf8f5] px-4 py-12">
      <div className="w-full max-w-xl mx-auto">
        <div className="mb-8">
          <Link href="/dashboard" className="text-stone-400 hover:text-stone-600 transition-colors text-sm">
            - Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-stone-900 mb-8">Edit Profile</h1>

        {emailChanged && (
          <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 mb-6">
            Email address updated successfully.
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-8 space-y-5">
          <Field label="Full Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="input"
            />
          </Field>

          <Field label="I am a...">
            <div className="grid grid-cols-2 gap-3">
              {PROFILE_TYPES.map((pt) => {
                const isSelected = form.profile_type === pt.value || form.secondary_role === pt.value;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => handleTypeClick(pt.value)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? "border-amber-400 bg-amber-50 text-stone-900"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                    }`}
                  >
                    <div className="font-medium text-sm">{pt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{pt.desc}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Location">
            <input type="text" value={form.location} onChange={(e) => update("location", e.target.value)} className="input" />
          </Field>

          <Field label="LinkedIn URL" hint="Optional">
            <input type="text" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)}
              onBlur={() => update("linkedin_url", sanitizeLinkedInUrl(form.linkedin_url))}
              placeholder="https://linkedin.com/in/yourname" className="input" />
          </Field>

          <Field label="Website / Portfolio" hint="Optional">
            <input type="text" value={form.website_url} onChange={(e) => update("website_url", e.target.value)}
              onBlur={() => update("website_url", sanitizeWebsiteUrl(form.website_url))}
              placeholder="https://github.com/yourname" className="input" />
          </Field>

          <Field label="Headline">
            <input type="text" value={form.title} onChange={(e) => update("title", e.target.value)} className="input" />
          </Field>

          <Field label="Work History" hint="List your roles, companies, and tenures">
            <textarea value={form.work_history} onChange={(e) => update("work_history", e.target.value)}
              rows={5} className="input resize-none" />
          </Field>

          <Field label="Education" hint="Degree, institution, and year">
            <textarea value={form.education} onChange={(e) => update("education", e.target.value)}
              rows={3} className="input resize-none" />
          </Field>

          <Field label="About You">
            <textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} rows={4} className="input resize-none" />
          </Field>

          <Field label="Skills (comma-separated)">
            <div>
              <input
                type="text"
                value={form.skillsInput}
                onChange={(e) => update("skillsInput", e.target.value)}
                onBlur={handleSkillsBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    handleSkillsBlur();
                  }
                }}
                placeholder="Python, React, Leadership..."
                className="input"
              />
              {form.skills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {form.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 text-stone-700 text-sm border border-stone-200"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="text-stone-400 hover:text-stone-700 transition-colors"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <Field label="Years of Experience">
            <input
              type="number"
              min={0}
              value={form.experience_years}
              onChange={(e) => update("experience_years", parseInt(e.target.value) || 0)}
              className="input"
            />
          </Field>

          <Field label="What are you looking for?">
            {(form.profile_type === "employer" || form.profile_type === "mentor") && (
              <p className="text-xs text-amber-400 mb-2">This text is shown to job seekers and mentees when they view your profile as a potential match.</p>
            )}
            <textarea
              value={form.looking_for}
              onChange={(e) => update("looking_for", e.target.value)}
              rows={3}
              className="input resize-none"
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 px-4 py-3 font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner /> Saving...</> : "Save Changes"}
          </button>
        </form>

        {/* Change email */}
        <div className="mt-8 pt-8 border-t border-stone-200">
          <h2 className="text-base font-semibold text-stone-800 mb-1">Change email address</h2>
          <p className="text-sm text-stone-500 mb-4">
            Current: <span className="text-stone-700">{getAuthEmail()}</span>
          </p>
          <div className="flex gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailChangeMsg(null); setEmailChangeError(null); }}
              placeholder="New email address"
              className="input flex-1"
            />
            <button
              type="button"
              disabled={emailChangeLoading || !newEmail.trim()}
              onClick={async () => {
                setEmailChangeLoading(true);
                setEmailChangeMsg(null);
                setEmailChangeError(null);
                try {
                  await api.auth.changeEmail(newEmail.trim());
                  setEmailChangeMsg("If that address is available, a verification link has been sent to it.");
                  setNewEmail("");
                } catch (e) {
                  setEmailChangeError(e instanceof Error ? e.message : "Failed to send verification email.");
                } finally {
                  setEmailChangeLoading(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 disabled:opacity-50 text-sm font-medium text-stone-700 transition-colors whitespace-nowrap"
            >
              {emailChangeLoading ? "Sending..." : "Send verification"}
            </button>
          </div>
          {emailChangeMsg && <p className="text-sm text-green-600 mt-2">{emailChangeMsg}</p>}
          {emailChangeError && <p className="text-sm text-red-500 mt-2">{emailChangeError}</p>}
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          background: white;
          border: 1px solid #e7e5e0;
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          color: #1c1917;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: #fbbf24;
        }
        .input::placeholder {
          color: #a8a29e;
        }
      `}</style>
    </main>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-stone-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
