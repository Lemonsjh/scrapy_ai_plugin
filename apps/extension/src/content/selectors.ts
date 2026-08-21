const unstable = /(^|[-_])(css|sc|jsx|emotion|[a-f0-9]{8,})([-_]|$)/i;

function escaped(value: string) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)?.toString(16)} `);
}

function stableClasses(element: Element) {
  return [...element.classList]
    .filter((name) => name.length < 60 && !unstable.test(name))
    .slice(0, 3);
}

function segment(element: Element, includePosition = false) {
  const tag = element.tagName.toLowerCase();
  const id = element.id;
  if (id && id.length < 80 && !unstable.test(id)) return `#${escaped(id)}`;

  for (const name of ["data-testid", "data-id", "data-key", "itemprop", "aria-label"]) {
    const value = element.getAttribute(name);
    if (value && value.length < 100) return `${tag}[${name}="${escaped(value)}"]`;
  }

  const classes = stableClasses(element);
  let result = `${tag}${classes.map((name) => `.${escaped(name)}`).join("")}`;
  if (includePosition && element.parentElement) {
    const siblings = [...element.parentElement.children].filter((node) => node.tagName === element.tagName);
    if (siblings.length > 1) result += `:nth-of-type(${siblings.indexOf(element) + 1})`;
  }
  return result;
}

function unique(selector: string, root: ParentNode) {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

export function selectorCandidates(element: Element, root: ParentNode = document): string[] {
  const results: string[] = [];
  const direct = segment(element);
  if (unique(direct, root)) results.push(direct);

  let current: Element | null = element;
  const path: string[] = [];
  for (let depth = 0; current && current !== root && depth < 6; depth += 1) {
    path.unshift(segment(current, depth > 1));
    const candidate = path.join(" > ");
    if (unique(candidate, root)) results.push(candidate);
    current = current.parentElement;
  }

  const positional = segment(element, true);
  if (!results.includes(positional)) results.push(positional);
  return [...new Set(results)].slice(0, 5);
}

export function queryFirst(root: ParentNode, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const found = root.querySelector(selector);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

export function queryAllFirst(root: ParentNode, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const found = [...root.querySelectorAll(selector)];
      if (found.length) return found;
    } catch {
      continue;
    }
  }
  return [];
}
