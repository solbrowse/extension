import React from "react";
import ReactDOM from "react-dom/client";

export interface InjectOpts<Props = Record<string, any>> {
  /** Unique host ID so you don't double-inject */
  id: string;
  /** Your React component */
  Component: React.FC<Props & { onUnmount?: () => void }>;
  /** Props to pass in */
  props?: Props;
  /** Tailwind + any additional CSS, compiled to a string */
  styles: string;
  /** Any webfont or icon-font links you want */
  fontLinks?: string[];
  /** Callback when component is unmounted */
  onUnmount?: () => void;
}

export function injectComponent<Props>({
  id,
  Component,
  props,
  styles,
  fontLinks = [],
  onUnmount,
}: InjectOpts<Props>) {
  // 1) Dedupe
  if (document.getElementById(id)) return;

  // 2) Host + Shadow
  const host = document.createElement("div");
  host.id = id;
  const shadowRoot = host.attachShadow({ mode: "open" });

  // 3) Inject fonts/icons
  fontLinks.forEach((href) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    shadowRoot.appendChild(link);
  });

  // 4) Inject your Tailwind CSS
  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadowRoot.appendChild(styleEl);

  // 5) Mount point for React
  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);
  document.body.appendChild(host);

  // 6) Kick off React
  const root = ReactDOM.createRoot(mountPoint);
  
  // 7) Create unmount function
  const unmount = () => {
    root.unmount();
    host.remove();
    if (onUnmount) {
      onUnmount();
    }
  };

  // 8) Render component with unmount prop
  root.render(React.createElement(Component, { ...props, onUnmount: unmount } as Props & { onUnmount: () => void }));

  return { unmount, host, shadowRoot };
} 