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
    <div onMouseDown={handleMouseDown} className="h-screen v-screen select-none" >
      <main>
        <h1>Hey Charlie</h1>
        <DaschundySprite />
      </main>
    </div>
  )
}

export default App;
