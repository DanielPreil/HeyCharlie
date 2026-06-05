import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

function App() {

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      await getCurrentWindow().startDragging();
    }
  };

  return (
    <div onMouseDown={handleMouseDown} style={{ width: "100vw", height: "100vh", userSelect: "none" }} >
      <main><h1>Hey Charlie</h1></main>
    </div>
  )
}

export default App;
