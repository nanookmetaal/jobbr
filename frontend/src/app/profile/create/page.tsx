"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ProfileCreate, ProfileType } from "@/lib/api";
import { isAuthenticated, getAuthEmail } from "@/lib/auth";

const PROFILE_TYPES: { value: ProfileType; label: string; desc: string }[] = [
  { value: "job_seeker", label: "Job Seeker", desc: "Looking for a new role" },
  { value: "employer", label: "Employer", desc: "Hiring talent" },
  { value: "mentor", label: "Mentor", desc: "Sharing knowledge & experience" },
  { value: "mentee", label: "Mentee", desc: "Looking for guidance" },
];

const STEPS = ["Basic Info", "Background", "Goals", "Review"];

type FormData = {
  name: string;
  email: string;
  profile_type: ProfileType;
  location: string;
  linkedin_url: string;
  website_url: string;
  title: string;
  work_history: string;
  education: string;
  skillsInput: string;
  skills: string[];
  experience_years: number;
  bio: string;
  looking_for: string;
};

const initialForm: FormData = {
  name: "",
  email: "",
  profile_type: "job_seeker",
  location: "",
  linkedin_url: "",
  website_url: "",
  title: "",
  work_history: "",
  education: "",
  skillsInput: "",
  skills: [],
  experience_years: 0,
  bio: "",
  looking_for: "",
};

export default function CreateProfilePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/");
      return;
    }
    const email = getAuthEmail();
    if (email) update("email", email);
  }, [router]);

  const update = (key: keyof FormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSkillsBlur = () => {
    if (!form.skillsInput.trim()) return;
    const newSkills = form.skillsInput.split(",").map((s) => s.trim()).filter(Boolean);
    update("skills", Array.from(new Set([...form.skills, ...newSkills])));
    update("skillsInput", "");
  };

  const removeSkill = (skill: string) =>
    update("skills", form.skills.filter((s) => s !== skill));

  const canProceed = () => {
    if (step === 0) return form.name && form.email && form.profile_type && form.location;
    if (step === 1) return form.title && form.experience_years >= 0;
    if (step === 2) return form.bio && form.looking_for;
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: ProfileCreate = {
        name: form.name,
        email: form.email,
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
      };
      const profile = await api.profiles.create(payload);
      localStorage.setItem("profile_id", profile.id);
      router.push(`/dashboard?profile_id=${profile.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">Create Your Profile</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">
          Tell us about yourself to find your best matches.
        </p>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < step ? "bg-blue-600 text-white" :
                  i === step ? "bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-950" :
                  "bg-gray-800 text-gray-500"
                }`}>
                  {i < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-xs ${i === step ? "text-blue-400" : "text-gray-600"}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 mx-2 mb-5 transition-colors ${i < step ? "bg-blue-600" : "bg-gray-800"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {/* Step 0: Basic Info */}
          {step === 0 && (
            <div className="space-y-5">
              <Field label="Full Name">
                <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
                  placeholder="Jane Smith" className="input" />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} readOnly className="input opacity-60 cursor-not-allowed" />
              </Field>
              <Field label="I am a...">
                <div className="grid grid-cols-2 gap-3">
                  {PROFILE_TYPES.map((pt) => (
                    <button key={pt.value} type="button" onClick={() => update("profile_type", pt.value)}
                      className={`text-left p-3 rounded-xl border transition-colors ${
                        form.profile_type === pt.value
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                      }`}>
                      <div className="font-medium text-sm">{pt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{pt.desc}</div>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Location">
                <input type="text" value={form.location} onChange={(e) => update("location", e.target.value)}
                  placeholder="San Francisco, CA" className="input" />
              </Field>
              <Field label="LinkedIn URL" hint="Optional - paste your LinkedIn profile link">
                <input type="url" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)}
                  placeholder="https://linkedin.com/in/yourname" className="input" />
              </Field>
              <Field label="Website / Portfolio" hint="Optional - GitHub, personal site, or portfolio">
                <input type="url" value={form.website_url} onChange={(e) => update("website_url", e.target.value)}
                  placeholder="https://github.com/yourname" className="input" />
              </Field>
            </div>
          )}

          {/* Step 1: Background */}
          {step === 1 && (
            <div className="space-y-5">
              <Field label="Headline">
                <input type="text" value={form.title} onChange={(e) => update("title", e.target.value)}
                  placeholder="Senior Software Engineer at Acme Corp" className="input" />
              </Field>
              <Field label="Work History" hint="List your roles, companies, and tenures - freeform is fine">
                <textarea value={form.work_history} onChange={(e) => update("work_history", e.target.value)}
                  placeholder={"Senior Engineer, Stripe (2021 - present)\nSoftware Engineer, Atlassian (2018 - 2021)\nJunior Developer, startup (2016 - 2018)"}
                  rows={5} className="input resize-none" />
              </Field>
              <Field label="Education" hint="Degree, institution, and year - freeform is fine">
                <textarea value={form.education} onChange={(e) => update("education", e.target.value)}
                  placeholder={"BSc Computer Science, University of Auckland, 2016\nAWS Solutions Architect certification, 2020"}
                  rows={3} className="input resize-none" />
              </Field>
              <Field label="Skills" hint="Press Enter or comma to add">
                <div>
                  <input type="text" value={form.skillsInput} onChange={(e) => update("skillsInput", e.target.value)}
                    onBlur={handleSkillsBlur}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); handleSkillsBlur(); } }}
                    placeholder="Python, React, Leadership..." className="input" />
                  {form.skills.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {form.skills.map((skill) => (
                        <span key={skill} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 text-sm border border-blue-500/25">
                          {skill}
                          <button type="button" onClick={() => removeSkill(skill)} className="text-blue-400 hover:text-white transition-colors">x</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Years of Experience">
                <input type="number" min={0} value={form.experience_years}
                  onChange={(e) => update("experience_years", parseInt(e.target.value) || 0)} className="input" />
              </Field>
            </div>
          )}

          {/* Step 2: Goals */}
          {step === 2 && (
            <div className="space-y-5">
              <Field label="About You" hint="A short summary of who you are and what you bring">
                <textarea value={form.bio} onChange={(e) => update("bio", e.target.value)}
                  placeholder="Tell people about yourself, your background, and what drives you..."
                  rows={4} className="input resize-none" />
              </Field>
              <Field label="What are you looking for?" hint="Be specific - this drives your matches">
                <textarea value={form.looking_for} onChange={(e) => update("looking_for", e.target.value)}
                  placeholder="Describe your ideal role, hire, or mentorship arrangement..."
                  rows={4} className="input resize-none" />
              </Field>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-2">Review Your Profile</h3>
              <ReviewRow label="Name" value={form.name} />
              <ReviewRow label="Email" value={form.email} />
              <ReviewRow label="Type" value={PROFILE_TYPES.find((p) => p.value === form.profile_type)?.label ?? ""} />
              <ReviewRow label="Location" value={form.location} />
              {form.linkedin_url && <ReviewRow label="LinkedIn" value={form.linkedin_url} />}
              {form.website_url && <ReviewRow label="Website" value={form.website_url} />}
              <ReviewRow label="Headline" value={form.title} />
              {form.work_history && <ReviewRow label="Work History" value={form.work_history} />}
              {form.education && <ReviewRow label="Education" value={form.education} />}
              <ReviewRow label="Skills" value={form.skills.join(", ") || "None"} />
              <ReviewRow label="Experience" value={`${form.experience_years} years`} />
              <ReviewRow label="About" value={form.bio} />
              <ReviewRow label="Looking For" value={form.looking_for} />
              {error && (
                <div className="rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3">{error}</div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)}
                className="flex-1 rounded-xl border border-gray-700 hover:border-gray-500 bg-gray-800/50 px-4 py-3 font-semibold text-gray-300 transition-colors">
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}
                className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 font-semibold text-white transition-colors">
                Continue
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={loading}
                className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-3 font-semibold text-white transition-colors flex items-center justify-center gap-2">
                {loading ? <><Spinner />Creating Profile...</> : "Create Profile"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .input { width: 100%; background: #111827; border: 1px solid #1f2937; border-radius: 0.75rem; padding: 0.75rem 1rem; color: #f9fafb; font-size: 0.875rem; outline: none; transition: border-color 0.15s; }
        .input:focus { border-color: #3b82f6; }
        .input::placeholder { color: #4b5563; }
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-200 flex-1 whitespace-pre-wrap">{value}</span>
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
