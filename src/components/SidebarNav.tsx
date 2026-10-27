import { MirioflowWordmark } from "./MirioflowWordmark";
import { AppIcon } from "./AppIcon";

export type NavScreen =
  "home" | "vocabulary" | "dictation" | "history" | "settings";

const NAV_ITEMS: Array<{
  id: NavScreen;
  label: string;
  icon: "home" | "history" | "book" | "microphone" | "settings";
}> = [
  { id: "home", label: "Home", icon: "home" },
  { id: "history", label: "History", icon: "history" },
  { id: "vocabulary", label: "Vocabulary", icon: "book" },
  { id: "dictation", label: "Transcription settings", icon: "microphone" },
  { id: "settings", label: "App settings", icon: "settings" },
];

export function SidebarNav({
  activeScreen,
  onNavigate,
}: {
  activeScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="logo">
        <MirioflowWordmark />
      </div>
      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeScreen === item.id ? "nav-item-active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <AppIcon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
