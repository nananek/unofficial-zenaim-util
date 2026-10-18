/** Minimal hyperscript helpers — enough for the configurator, no framework. */

export type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  [key: string]: unknown;
}

function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      switch (key) {
        case 'class':
          element.className = String(value);
          break;
        case 'text':
          element.textContent = String(value);
          break;
        case 'html':
          element.innerHTML = String(value);
          break;
        case 'dataset':
          Object.assign(element.dataset, value as Record<string, string>);
          break;
        case 'style':
          Object.assign(element.style, value as Partial<CSSStyleDeclaration>);
          break;
        default:
          if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
          } else if (value === true) {
            element.setAttribute(key, '');
          } else {
            element.setAttribute(key, String(value));
          }
      }
    }
  }
  appendChildren(element, children);
  return element;
}

/** Replace all children of `node`. */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Create a detached document fragment from a list of children. */
export function fragment(...children: Child[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  appendChildren(frag, children);
  return frag;
}

export function formatBytes(bytes: ArrayLike<number>, start: number, count: number): string {
  return Array.from({ length: count }, (_, i) =>
    (bytes[start + i] ?? 0).toString(16).padStart(2, '0'),
  ).join(' ');
}

export function toHex(value: number, width = 2): string {
  return value.toString(16).padStart(width, '0');
}
