import { useState, useEffect } from "react";
import { Shield, Fingerprint, Key, Cpu, Cloud, Link, Zap, Eye, EyeOff, Calendar, Mail } from "lucide-react";
import { LOCAL_MODELS } from "@/lib/models";
import logo from "@/assets/logo.svg";

interface OnboardingProps {
  onComplete: (config: OnboardingConfig) => void;
}

export interface OnboardingConfig {
  userName: string;
  tone: string;
  localModel: string;
  cloudFallback: string;
  integrations: string[];
  authMethod: "biometrics" | "pin" | "passphrase";
}

const ONBOARDING_MODELS = LOCAL_MODELS.map(m => ({
  id: m.id,
  nm: m.name,
  ds: m.description,
  size: m.size_mb >= 1000 ? `${(m.size_mb / 1024).toFixed(1)} GB` : `${m.size_mb} MB`,
}));

const CLOUD_OPTS = [
  { id: "none", nm: "Local only", ds: "100% private, no fallback", icon: Shield },
  { id: "ollama", nm: "Ollama Cloud", ds: "Managed inference", icon: Cloud },
  { id: "openrouter", nm: "OpenRouter", ds: "Multi-model gateway", icon: Zap },
  { id: "custom", nm: "Custom endpoint", ds: "BYO API key", icon: Key },
];

const INTEGRATIONS = [
  { id: "ollama", nm: "Ollama", ds: "Local inference engine" },
  { id: "exo", nm: "Exo Labs", ds: "Distributed inference mesh" },
  { id: "tailscale", nm: "Tailscale", ds: "Private network mesh" },
  { id: "calendar", nm: "Calendar", ds: "Sync events & reminders" },
  { id: "gmail", nm: "Gmail", ds: "Email integration" },
];

const TONES = [
  { id: "direct", nm: "Direct", ds: "Concise, no fluff" },
  { id: "thoughtful", nm: "Thoughtful", ds: "Considered, detailed" },
  { id: "strategic", nm: "Strategic", ds: "Big picture first" },
  { id: "socratic", nm: "Socratic", ds: "Questions, probes" },
];

const AUTH_METHODS = [
  { id: "biometrics" as const, nm: "Biometrics", ds: "Face ID / Fingerprint", icon: Fingerprint },
  { id: "pin" as const, nm: "Numeric PIN", ds: "4-6 digit code", icon: Key },
  { id: "passphrase" as const, nm: "Passphrase", ds: "Word-based password", icon: Shield },
];

// Encrypted text scramble effect
function EncText({ text, speed = 24 }: { text: string; speed?: number }) {
  const GLYPHS = "█▓▒░ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$@!?";
  const [chars, setChars] = useState(() => text.split("").map(() => ({ c: "█", locked: false })));

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    text.split("").forEach((ch, i) => {
      let n = 0;
      const max = 4 + Math.floor(i * 1.3);
      const iv = setInterval(() => {
        n++;
        setChars((p) => {
          const a = [...p];
          a[i] = { c: ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)], locked: false };
          return a;
        });
        if (n >= max) {
          clearInterval(iv);
          const t = setTimeout(
            () => setChars((p) => { const a = [...p]; a[i] = { c: ch, locked: true }; return a; }),
            i * speed
          );
          timers.push(t);
        }
      }, 36);
      timers.push(iv);
    });
    return () => timers.forEach((x) => { clearInterval(x); clearTimeout(x); });
  }, [text, speed]);

  return (
    <span className="inline">
      {chars.map((ch, i) => (
        <span
          key={i}
          className={`inline-block transition-colors duration-75 ${
            ch.locked ? "text-foreground animate-[fadeIn_0.1s_ease_both]" : "text-muted-foreground font-mono tracking-tight"
          }`}
        >
          {ch.c}
        </span>
      ))}
    </span>
  );
}

export { EncText };

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-0.5 rounded-full transition-all duration-500 ${
            i < current ? "w-4 bg-muted-foreground" : i === current ? "w-7 bg-foreground" : "w-4 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function IntegrationIcon({ id }: { id: string }) {
  switch (id) {
    case "calendar": return <Calendar className="h-3.5 w-3.5 text-muted-foreground" />;
    case "gmail": return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
    default: return <Link className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// Step 1: Welcome
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center animate-[scaleIn_0.4s_ease_both]">
      <div className="mb-8">
        <img src={logo} alt="ViBo AI" className="h-16 w-16" />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-3">
        <EncText text="ViBo AI · Virtual Notebook" speed={26} />
      </p>
      <h1 className="text-3xl font-light text-foreground mb-3 tracking-tight">
        Think, Write,
        <br />
        <em className="italic text-muted-foreground font-light">Plan Privately.</em>
      </h1>
      <p className="text-sm text-muted-foreground max-w-[340px] mb-7 leading-relaxed">
        A private AI notebook on your device. No accounts. No cloud. No tracking. Ever.
      </p>
      <div className="flex items-center gap-5 mb-8">
        {["Local", "Encrypted", "Private"].map((t) => (
          <div key={t} className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
            <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            {t}
          </div>
        ))}
      </div>
      <button
        onClick={onNext}
        className="w-full max-w-[340px] py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Begin setup
      </button>
    </div>
  );
}

// Step 2: Model Selection
function ModelStep({ selected, onSelect, onNext }: { selected: string; onSelect: (id: string) => void; onNext: () => void }) {
  return (
    <div className="w-full max-w-[440px] animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={0} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 1 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Choose your<br /><em className="italic text-muted-foreground">local model.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5 leading-relaxed">
        Select a model for local inference. You can change this later in settings.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {ONBOARDING_MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              selected === m.id ? "border-foreground bg-card" : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
            }`}
          >
            <div className={`w-4.5 h-4.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
              selected === m.id ? "border-foreground bg-foreground" : "border-border"
            }`}>
              {selected === m.id && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{m.nm}</div>
              <div className="text-[11px] font-mono text-muted-foreground tracking-wide">{m.ds}</div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{m.size}</span>
          </button>
        ))}
      </div>
      <button onClick={onNext} className="w-full py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
        Continue setup
      </button>
    </div>
  );
}

// Step 3: Cloud Fallback
function CloudStep({ selected, onSelect, onNext }: { selected: string; onSelect: (id: string) => void; onNext: () => void }) {
  return (
    <div className="w-full max-w-[440px] animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={1} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 2 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Cloud<br /><em className="italic text-muted-foreground">fallback.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        When local compute isn't enough, where should we escalate?
      </p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {CLOUD_OPTS.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-center transition-all ${
              selected === c.id ? "border-foreground bg-card" : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <c.icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.2} />
            <div className="text-xs font-medium text-foreground">{c.nm}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{c.ds}</div>
          </button>
        ))}
      </div>
      <button onClick={onNext} className="w-full py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
        Continue
      </button>
    </div>
  );
}

// Step 4: Integrations
function IntegrationsStep({ enabled, onToggle, onNext }: { enabled: string[]; onToggle: (id: string) => void; onNext: () => void }) {
  return (
    <div className="w-full max-w-[440px] animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={2} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 3 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Connect<br /><em className="italic text-muted-foreground">your world.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        Give agents access to your tools. You decide exactly what they can see.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {INTEGRATIONS.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <IntegrationIcon id={it.id} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{it.nm}</div>
              <div className="text-[11px] text-muted-foreground">{it.ds}</div>
            </div>
            <button
              onClick={() => onToggle(it.id)}
              className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                enabled.includes(it.id) ? "bg-foreground" : "bg-muted"
              }`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                enabled.includes(it.id) ? "left-[18px]" : "left-0.5"
              }`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={onNext} className="w-full py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
        Continue
      </button>
      <button onClick={onNext} className="w-full py-3 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground mt-2 transition-colors">
        Skip integrations
      </button>
    </div>
  );
}

// Step 5: Security (Auth method)
function SecurityStep({ selected, onSelect, onNext }: { selected: "biometrics" | "pin" | "passphrase"; onSelect: (m: "biometrics" | "pin" | "passphrase") => void; onNext: () => void }) {
  return (
    <div className="w-full max-w-[440px] animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={3} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 4 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Secure your<br /><em className="italic text-muted-foreground">vault.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        Choose how you unlock ViBo. Biometrics are tried first; password is the fallback.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {AUTH_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
              selected === m.id ? "border-foreground bg-card" : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              selected === m.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}>
              <m.icon className="h-4.5 w-4.5" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{m.nm}</div>
              <div className="text-[11px] text-muted-foreground">{m.ds}</div>
            </div>
            <div className={`w-4.5 h-4.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
              selected === m.id ? "border-foreground bg-foreground" : "border-border"
            }`}>
              {selected === m.id && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
            </div>
          </button>
        ))}
      </div>
      <button onClick={onNext} className="w-full py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
        Continue
      </button>
    </div>
  );
}

// Step 6: Your Name & Tone
function PersonalityStep({ onComplete }: { onComplete: (name: string, tone: string) => void }) {
  const [name, setName] = useState("");
  const [tone, setTone] = useState("direct");

  return (
    <div className="w-full max-w-[440px] animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={4} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 5 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        About<br /><em className="italic text-muted-foreground">you.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        What should we call you? Pick a communication style for your AI assistant.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name…"
        className="w-full py-3 px-4 rounded-xl bg-muted border border-border text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 mb-5"
      />
      <div className="grid grid-cols-2 gap-2 mb-5">
        {TONES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTone(t.id)}
            className={`px-3 py-3 rounded-xl border text-left transition-all ${
              tone === t.id
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className={`text-xs font-medium mb-0.5 ${tone === t.id ? "text-background" : "text-foreground"}`}>{t.nm}</div>
            <div className={`text-[10px] ${tone === t.id ? "text-background/50" : "text-muted-foreground"}`}>{t.ds}</div>
          </button>
        ))}
      </div>
      <button
        onClick={() => onComplete(name || "User", tone)}
        className="w-full py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Finish setup
      </button>
    </div>
  );
}

const ONBOARDING_KEY = "zettel-onboarding-done";
const AI_CONFIG_KEY = "zettel-ai-config";

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function getAiConfig(): OnboardingConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { userName: "User", tone: "direct", localModel: "lfm2.5-1.2b-instruct", cloudFallback: "none", integrations: [], authMethod: "biometrics" };
  } catch {
    return { userName: "User", tone: "direct", localModel: "lfm2.5-1.2b-instruct", cloudFallback: "none", integrations: [], authMethod: "biometrics" };
  }
}

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<"welcome" | "model" | "cloud" | "integrations" | "security" | "personality">("welcome");
  const [model, setModel] = useState("lfm2.5-1.2b-instruct");
  const [cloud, setCloud] = useState("none");
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [authMethod, setAuthMethod] = useState<"biometrics" | "pin" | "passphrase">("biometrics");

  const toggleIntegration = (id: string) => {
    setIntegrations((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const finish = (name: string, tone: string) => {
    const config: OnboardingConfig = { userName: name, tone, localModel: model, cloudFallback: cloud, integrations, authMethod };
    localStorage.setItem(ONBOARDING_KEY, "true");
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    onComplete(config);
  };

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-background px-5 relative overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,hsl(var(--foreground)/0.03),transparent)]" />

      {step === "welcome" && <WelcomeStep onNext={() => setStep("model")} />}
      {step === "model" && <ModelStep selected={model} onSelect={setModel} onNext={() => setStep("cloud")} />}
      {step === "cloud" && <CloudStep selected={cloud} onSelect={setCloud} onNext={() => setStep("integrations")} />}
      {step === "integrations" && <IntegrationsStep enabled={integrations} onToggle={toggleIntegration} onNext={() => setStep("security")} />}
      {step === "security" && <SecurityStep selected={authMethod} onSelect={setAuthMethod} onNext={() => setStep("personality")} />}
      {step === "personality" && <PersonalityStep onComplete={finish} />}
    </div>
  );
}
