export const fmtInt = (x: number) => Math.round(x).toLocaleString('zh-TW');
export const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
export const fmtDays = (x: number) => `${x.toFixed(1)} 天`;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`找不到元素 #${id}`);
  return node as T;
}
