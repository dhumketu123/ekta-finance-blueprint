import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import "./index.css";

// Keyboard adaptive engine — dynamically adjusts --keyboard-offset for mobile
if (window.visualViewport) {
  const handleViewportResize = () => {
    const offset = window.innerHeight - window.visualViewport!.height;
    document.documentElement.style.setProperty(
      "--keyboard-offset",
      `${offset > 0 ? offset : 0}px`
    );
  };
  window.visualViewport.addEventListener("resize", handleViewportResize);

  // Cleanup on HMR dispose (dev only)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
