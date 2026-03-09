import { useState, useEffect } from "react";
import { Cloud, Key, Server, Eye, EyeOff, Globe } from "lucide-react";
import {
  CLOUD_PROVIDERS,
  getCloudKeys,
  setCloudKey,
  getActiveProvider,
  setActiveProvider,
  type CloudProviderType,
} from "@/lib/models";

function ProviderField({
  provider,
  value,
  active,
  onChange,
  onActivate,
}: {
  provider: typeof CLOUD_PROVIDERS[number];
  value: string;
  active: boolean;
  onChange: (v: string) => void;
  onActivate: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = provider.type === "host" ? Server : Key;

  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{provider.name}</div>
          <div className="text-[10px] text-muted-foreground">{provider.description}</div>
        </div>
        {value && !active && (
          <button
            onClick={onActivate}
            className="text-[10px] font-medium text-primary hover:text-primary/80 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            Use
          </button>
        )}
        {active && (
          <span className="text-[10px] font-medium text-primary flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            Active
          </span>
        )}
      </div>
      <div className="relative">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={provider.placeholder}
          className="w-full h-8 rounded-lg bg-muted border border-border pl-8 pr-8 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

export function CloudProvidersSection({
  torEnabled,
  onTorToggle,
}: {
  torEnabled: boolean;
  onTorToggle: () => void;
}) {
  const [keys, setKeys] = useState(getCloudKeys);
  const [activeProvider, setActive] = useState(getActiveProvider);

  const updateKey = (provider: CloudProviderType, value: string) => {
    setCloudKey(provider, value);
    setKeys(getCloudKeys());
  };

  const activate = (provider: CloudProviderType) => {
    setActiveProvider(provider);
    setActive(provider);
  };

  return (
    <div className="card-3d rounded-2xl p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5" />
        Cloud Providers
      </h2>
      <p className="text-[10px] text-muted-foreground mb-3">
        BYOK — connect cloud models for deep reasoning. Requests route through Tor when enabled.
      </p>

      <div className="space-y-2">
        {CLOUD_PROVIDERS.map((provider) => (
          <ProviderField
            key={provider.id}
            provider={provider}
            value={keys[provider.id] || ""}
            active={activeProvider === provider.id}
            onChange={(v) => updateKey(provider.id, v)}
            onActivate={() => activate(provider.id)}
          />
        ))}
      </div>

      {/* Tor Toggle */}
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={onTorToggle}
          className="w-full flex items-center justify-between py-1.5 text-sm text-foreground"
        >
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <div className="text-left">
              <div className="text-xs font-medium">Tor Routing</div>
              <div className="text-[9px] text-muted-foreground">Route cloud API calls through Tor network</div>
            </div>
          </span>
          <div className={`w-9 h-5 rounded-full transition-colors ${torEnabled ? "bg-primary/60" : "bg-muted"} relative`}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${torEnabled ? "bg-primary left-[18px]" : "bg-foreground left-0.5"}`} />
          </div>
        </button>
      </div>
    </div>
  );
}
