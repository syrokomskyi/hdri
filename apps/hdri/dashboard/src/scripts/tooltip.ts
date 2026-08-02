/*
<MODULE_CONTRACT>
<purpose>Initializes interactive tooltips for specified elements</purpose>
<non-goals>
  <item>Does not handle tooltip content fetching from external sources</item>
  <item>Does not manage tooltip styling beyond basic positioning</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of tooltip functionality</item>
</CHANGE_SUMMARY>
*/

export function initTooltips(selector: string, popupClass = "tooltip-popup"): void {
  document.querySelectorAll(selector).forEach((hostEl) => {
    const host = hostEl as HTMLElement;
    const text: string | undefined = host.dataset.tooltip;
    if (!text) return;
    const tooltipText: string = text;

    const visibleText = host.textContent?.trim() || "";
    host.setAttribute("tabindex", "0");
    host.setAttribute("role", "button");
    host.setAttribute(
      "aria-label",
      visibleText
        ? `${visibleText} – Statistische Details anzeigen`
        : "Statistische Details anzeigen",
    );

    let popup: HTMLDivElement | null = null;
    let pinned = false;

    function show() {
      if (popup) return;
      const rect = host.getBoundingClientRect();
      const hostCenter = rect.left + rect.width / 2;

      popup = document.createElement("div");
      popup.className = popupClass;
      popup.textContent = tooltipText;
      document.body.appendChild(popup);

      const estimatedHeight = 180;
      const placeBelow = rect.top < estimatedHeight + 16;

      let left = hostCenter;
      let top: number;
      if (placeBelow) {
        top = rect.bottom + 8;
        popup.classList.add("tooltip-below");
      } else {
        top = rect.top - 8;
        popup.classList.remove("tooltip-below");
      }

      const minWidth = 230;
      left = Math.max(minWidth / 2 + 8, Math.min(left, window.innerWidth - minWidth / 2 - 8));
      top = Math.max(8, top);

      popup.style.left = left + "px";
      popup.style.top = top + "px";
      popup.style.transform = "translateX(-50%)";
      requestAnimationFrame(() => popup && popup.classList.add("visible"));
    }

    function hide() {
      if (!popup) return;
      const p = popup;
      popup = null;
      p.classList.remove("visible");
      p.addEventListener("transitionend", () => p.remove(), { once: true });
    }

    host.addEventListener("mouseenter", () => {
      if (!pinned) show();
    });
    host.addEventListener("mouseleave", () => {
      if (!pinned) hide();
    });

    host.addEventListener("click", (e) => {
      e.stopPropagation();
      pinned = !pinned;
      if (pinned) show();
      else hide();
    });

    // Astro's client-side addEventListener overload doesn't accept KeyboardEvent directly.
    host.addEventListener("keydown", ((e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" || ke.key === " ") {
        ke.preventDefault();
        pinned = !pinned;
        if (pinned) show();
        else hide();
      } else if (ke.key === "Escape") {
        pinned = false;
        hide();
      }
    }) as EventListener);

    document.addEventListener("click", () => {
      if (pinned) {
        pinned = false;
        hide();
      }
    });
  });
}
