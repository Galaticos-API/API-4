interface ExpressLayer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: ExpressLayer[] };
  regexp?: RegExp & { fast_slash?: boolean };
  keys?: Array<{ name: string | number }>;
}

interface ExpressLike {
  _router?: { stack: ExpressLayer[] };
  router?: { stack: ExpressLayer[] };
}

function mountPath(layer: ExpressLayer): string {
  if (!layer.regexp || layer.regexp.fast_slash) return "";
  let index = 0;
  const source = layer.regexp.source
    .replace("\\/?(?=\\/|$)", "")
    .replace(/^\^/, "")
    .replace(/\(\?:\\\/\(\[\^[^\]]*\]\+\?\)\)/g, () => `/{${String(layer.keys?.[index++]?.name ?? "param")}}`);
  return source.replace(/\\\//g, "/").replace(/\$$/, "");
}

function walk(stack: ExpressLayer[], prefix: string, found: Set<string>): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const routePath of paths) {
        const path = `${prefix}${routePath === "/" ? "" : routePath}`.replace(/:([A-Za-z0-9_]+)/g, "{$1}") || "/";
        for (const method of Object.keys(layer.route.methods)) found.add(`${method.toUpperCase()} ${path}`);
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      walk(layer.handle.stack, `${prefix}${mountPath(layer)}`, found);
    }
  }
}

export function listRoutes(app: unknown): string[] {
  const target = app as ExpressLike;
  const stack = target._router?.stack ?? target.router?.stack ?? [];
  const found = new Set<string>();
  walk(stack, "", found);
  return [...found].sort();
}

export function normalizeRoute(route: string): string {
  return route.replace(/\{[^}]+\}/g, "{}").replace(/\/+$/, "");
}
