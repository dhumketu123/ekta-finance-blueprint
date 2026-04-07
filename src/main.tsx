import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import { systemMonitor } from "@/core/systemMonitor";
import { telemetryAdapter } from "@/core/telemetryAdapter";
import "./index.css";

// Keyboard adaptive engine — production safe with fallback
function setupKeyboardAdaptiveOffset() {
  const setOffset = () => {
    if (window.visualViewport) {
      const offset = window.innerHeight - window.visualViewport.height;
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${offset > 0 ? offset : 0}px`
      );
    } else {
      document.documentElement.style.setProperty("--keyboard-offset", "0px");
    }
  };

  setOffset();

  window.visualViewport?.addEventListener("resize", setOffset);
  window.addEventListener("resize", setOffset);
  window.addEventListener("orientationchange", setOffset);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.visualViewport?.removeEventListener("resize", setOffset);
      window.removeEventListener("resize", setOffset);
      window.removeEventListener("orientationchange", setOffset);
    });
  }
}

setupKeyboardAdaptiveOffset();
systemMonitor.setTelemetryAdapter(telemetryAdapter);
systemMonitor.init();

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
