import { AppShell } from "@/components/layout/AppShell";
import { GlobalMemoryForm } from "@/components/settings/GlobalMemoryForm";
import { OpenAIKeyForm } from "@/components/settings/OpenAIKeyForm";
import { ZhipuKeyForm } from "@/components/settings/ZhipuKeyForm";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Settings</h1>
          <p>Manage model access and instructions shared across your bots.</p>
        </div>
      </div>
      <div className="settings-grid">
        <OpenAIKeyForm />
        <ZhipuKeyForm />
        <GlobalMemoryForm />
      </div>
    </AppShell>
  );
}
