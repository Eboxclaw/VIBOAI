import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Shield, Store, GraduationCap, Bot, Plus, Trash2 } from "lucide-react";

type AgentTab = "agents" | "skills" | "roles" | "marketplace" | "training";

interface Agent {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

const configTabs: { id: AgentTab; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "skills", label: "Skills" },
  { id: "roles", label: "Roles" },
  { id: "marketplace", label: "Market" },
  { id: "training", label: "Training" },
];

const DEFAULT_AGENTS: Agent[] = [
  { id: "1", name: "Manager", role: "Coordinator", active: true },
  { id: "2", name: "Code Assistant", role: "Coder", active: true },
  { id: "3", name: "Content Writer", role: "Writer", active: false },
];

function AgentsContent({ agents, setAgents }: { agents: Agent[]; setAgents: React.Dispatch<React.SetStateAction<Agent[]>> }) {
  const activeAgents = agents.filter((a) => a.active);
  const inactiveAgents = agents.filter((a) => !a.active);

  const addAgent = () => {
    setAgents((prev) => [...prev, { id: crypto.randomUUID(), name: `Agent ${prev.length + 1}`, role: "Unassigned", active: true }]);
  };

  const deleteAgent = (id: string) => setAgents((prev) => prev.filter((a) => a.id !== id));
  const toggleAgent = (id: string) => setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));

  return (
    <div className="flex flex-col gap-4 p-4 pb-20">
      {/* Active */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Active ({activeAgents.length})
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {activeAgents.map((agent) => (
            <div key={agent.id} className="card-3d rounded-xl px-2.5 py-2 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="h-6 w-6 rounded-md bg-foreground/10 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-foreground" />
                </div>
                <button onClick={() => deleteAgent(agent.id)} className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="text-[10px] font-semibold text-foreground truncate">{agent.name}</div>
              <div className="text-[9px] text-muted-foreground">{agent.role}</div>
              <button onClick={() => toggleAgent(agent.id)} className="text-[9px] text-muted-foreground hover:text-foreground bg-accent rounded px-1.5 py-0.5 transition-colors self-start mt-0.5">
                Deactivate
              </button>
            </div>
          ))}
          <button onClick={addAgent} className="rounded-xl border border-dashed border-border px-2.5 py-2 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
            <Plus className="h-4 w-4" />
            <span className="text-[9px] font-medium">New Agent</span>
          </button>
        </div>
      </div>

      {/* Inactive */}
      {inactiveAgents.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            Inactive ({inactiveAgents.length})
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {inactiveAgents.map((agent) => (
              <div key={agent.id} className="card-3d rounded-xl px-2.5 py-2 flex flex-col gap-1 opacity-50">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-6 rounded-md bg-foreground/5 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <button onClick={() => deleteAgent(agent.id)} className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
                <div className="text-[10px] font-semibold text-foreground truncate">{agent.name}</div>
                <div className="text-[9px] text-muted-foreground">{agent.role}</div>
                <button onClick={() => toggleAgent(agent.id)} className="text-[9px] text-muted-foreground hover:text-foreground bg-accent rounded px-1.5 py-0.5 transition-colors self-start mt-0.5">
                  Activate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillsContent() {
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Define what your agents can do — web search, code execution, file management, and more.</p>
      <div className="space-y-2">
        {["Web Search", "Code Execution", "File Analysis", "Data Extraction"].map((skill) => (
          <div key={skill} className="card-3d rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">{skill}</div>
              <div className="text-[10px] text-muted-foreground">Active</div>
            </div>
            <div className="h-2 w-2 rounded-full bg-primary" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RolesContent() {
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Assign roles to control agent behavior and access levels.</p>
      <div className="space-y-2">
        {["Coordinator", "Writer", "Coder", "Analyst"].map((role) => (
          <div key={role} className="card-3d rounded-xl px-4 py-3">
            <div className="text-sm font-medium text-foreground">{role}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Custom role template</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketplaceContent() {
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Discover and install community-built agent extensions.</p>
      <div className="grid grid-cols-2 gap-2">
        {["Summarizer", "Translator", "Calendar Sync", "Email Drafter", "Image Gen", "Chart Builder"].map((item) => (
          <div key={item} className="card-3d rounded-xl px-3 py-3 text-center">
            <Bot className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-xs font-medium text-foreground">{item}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Install</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingContent() {
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Feed your agents with custom knowledge and examples to improve accuracy.</p>
      <div className="space-y-2">
        {["Upload Documents", "Add Examples", "Review Performance", "Tune Parameters"].map((action) => (
          <div key={action} className="card-3d rounded-xl px-4 py-3 flex items-center gap-3">
            <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="text-sm font-medium text-foreground">{action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentsView() {
  const [activeTab, setActiveTab] = useState<AgentTab>("agents");
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS);

  return (
    <div className="flex flex-col h-full">
      {/* Top sub-menu tabs */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card/60 backdrop-blur-xl overflow-x-auto shrink-0">
        {configTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === "agents" && <AgentsContent agents={agents} setAgents={setAgents} />}
        {activeTab === "skills" && <SkillsContent />}
        {activeTab === "roles" && <RolesContent />}
        {activeTab === "marketplace" && <MarketplaceContent />}
        {activeTab === "training" && <TrainingContent />}
      </ScrollArea>
    </div>
  );
}
