import { getCurrentWindow } from "@tauri-apps/api/window";
import { DaschundySprite } from "./DaschundySprite";
import "./App.css";

function App() {
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      await getCurrentWindow().startDragging();
    }
  };

  return (
    <div onMouseDown={handleMouseDown} className="h-screen w-screen select-none">
      <DaschundySprite />
    </div>
  );
}

export default App;
