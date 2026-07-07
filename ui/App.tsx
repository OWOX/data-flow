import { CanvasApp } from "./components/canvas/Canvas";

export function App() {
  // The host scopes the plugin to one authenticated project and brokers OWOX
  // auth, so there is no in-app sign-in. Anonymous-first canvas renders directly.
  return <CanvasApp />;
}
