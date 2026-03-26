import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import "./index.css";

// Keyboard adaptive engine — dynamically adjusts --keyboard-offset for mobile
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const offset = window.innerHeight - window.visualViewport!.height;
    document.documentElement.style.setProperty(
      "--keyboard-offset",
      `${offset > 0 ? offset : 0}px`
    );
  });
}

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
