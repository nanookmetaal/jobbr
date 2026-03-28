"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ProfileType } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

const PROFILE_TYPES: { value: ProfileType; label: string; desc: string }[] = [
  { value: "job_seeker", label: "Job Seeker", desc: "Looking for a new role" },
  { value: "employer", label: "Employer", desc: "Hiring talent" },
  { value: "mentor", label: "Mentor", desc: "Sharing knowledge & experience" },
  { value: "mentee", label: "Mentee", desc: "Looking for guidance" },
];

type FormData = {
  name: string;
  profile_type: ProfileType;
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
  const router = useRouter();
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        {error ?? "Profile not found."}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12">
      <div className="w-full max-w-xl mx-auto">
        <div className="mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            - Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-8">Edit Profile</h1>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-5">
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
              {PROFILE_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => update("profile_type", pt.value)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    form.profile_type === pt.value
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  <div className="font-medium text-sm">{pt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{pt.desc}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Location">
            <input type="text" value={form.location} onChange={(e) => update("location", e.target.value)} className="input" />
          </Field>

          <Field label="LinkedIn URL" hint="Optional">
            <input type="url" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)}
              placeholder="https://linkedin.com/in/yourname" className="input" />
          </Field>

          <Field label="Website / Portfolio" hint="Optional">
            <input type="url" value={form.website_url} onChange={(e) => update("website_url", e.target.value)}
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
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 text-sm border border-blue-500/25"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="text-blue-400 hover:text-white transition-colors"
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
            <textarea
              value={form.looking_for}
              onChange={(e) => update("looking_for", e.target.value)}
              rows={3}
              className="input resize-none"
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-3 font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner /> Saving...</> : "Save Changes"}
          </button>
        </form>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          background: #111827;
          border: 1px solid #1f2937;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: #f9fafb;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: #3b82f6;
        }
        .input::placeholder {
          color: #4b5563;
        }
      `}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
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
