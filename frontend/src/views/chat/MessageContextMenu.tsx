import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import "../../assets/styles/chat-message-menu.css";

export interface MessageContextAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface MessageContextMenuProps {
  children: ReactNode;
  actions: MessageContextAction[];
  ariaLabel?: string;
  triggerLabel?: string;
  wrapperClassName?: string;
  allowContextMenuOnButtons?: boolean;
  onTriggerRef?: (node: HTMLButtonElement | null) => void;
}

interface MenuPosition { left: number; top: number }

const INTERACTIVE_OR_TEXT = "a, button, input, textarea, select, option, code, pre, details, summary, [contenteditable='true']";

export function MessageContextMenu({ children, actions, ariaLabel = "Ações da mensagem", triggerLabel, wrapperClassName, allowContextMenuOnButtons = false, onTriggerRef }: MessageContextMenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef(true);

  const close = useCallback((restoreFocus = true) => {
    returnFocusRef.current = restoreFocus;
    setOpen(false);
    setPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openAt = useCallback((x: number, y: number) => {
    if (!actions.some((action) => !action.disabled)) return;
    returnFocusRef.current = true;
    setPosition({ left: x, top: y });
    setOpen(true);
  }, [actions]);

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const interactiveSelector = allowContextMenuOnButtons ? INTERACTIVE_OR_TEXT.replace("button, ", "") : INTERACTIVE_OR_TEXT;
    if (target.closest(interactiveSelector) || window.getSelection()?.toString().trim()) return;
    event.preventDefault();
    openAt(event.clientX, event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.shiftKey && event.key === "F10" || event.key === "ContextMenu") {
      event.preventDefault();
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) openAt(rect.left + Math.min(24, rect.width / 2), rect.bottom);
    }
  };

  useLayoutEffect(() => {
    if (!open || !position || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(position.left, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(position.top, window.innerHeight - rect.height - margin));
    if (left !== position.left || top !== position.top) setPosition({ left, top });
    menuRef.current.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    const onViewportChange = () => close(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open, close]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") {
      event.preventDefault();
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      )).filter((element) => !menuRef.current?.contains(element)
        && element.tabIndex >= 0
        && element.getClientRects().length > 0
        && getComputedStyle(element).visibility !== "hidden");
      const triggerIndex = triggerRef.current ? candidates.indexOf(triggerRef.current) : -1;
      const targetIndex = triggerIndex + (event.shiftKey ? -1 : 1);
      const target = candidates[targetIndex];
      close(false);
      if (target) requestAnimationFrame(() => target.focus());
      else if (triggerIndex >= 0) requestAnimationFrame(() => triggerRef.current?.blur());
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const menu = open && position ? createPortal(
    <div ref={menuRef} className="chat-message-context-menu" role="menu" aria-label={ariaLabel}
      style={{ left: position.left, top: position.top }} onKeyDown={onMenuKeyDown}>
      {actions.map((action) => <button key={action.id} type="button" role="menuitem" disabled={action.disabled}
        className={action.destructive ? "is-destructive" : undefined}
        onClick={() => { try { action.onSelect(); } finally { close(); } }}>
        {action.label}
      </button>)}
    </div>, document.body,
  ) : null;

  return <div ref={wrapperRef} className={["chat-message-context-wrapper", wrapperClassName].filter(Boolean).join(" ")} onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
    {children}
    <button ref={(node) => { triggerRef.current = node; onTriggerRef?.(node); }} type="button" className="chat-message-context-trigger" aria-label={triggerLabel ?? `Mais ações: ${ariaLabel}`}
      aria-haspopup="menu" aria-expanded={open} onClick={(event) => {
        if (open) { close(); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        openAt(rect.right, rect.bottom + 4);
      }}>
      <Ellipsis aria-hidden="true" size={17} />
    </button>
    {menu}
  </div>;
}

export default MessageContextMenu;
