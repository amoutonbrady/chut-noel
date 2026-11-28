import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Popover } from "@kobalte/core/popover";
import { Select } from "@kobalte/core/select";
import { ToggleGroup } from "@kobalte/core/toggle-group";
import { PRICE_PRESETS } from "../lib/price";
import type { PriceRange } from "../lib/price";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpDownIcon,
  ArrowUpNarrowWideIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDotIcon,
  ClockIcon,
  LayoutGridIcon,
  ListIcon,
  ListOrderedIcon,
  LockIcon,
  RowsIcon,
  WalletIcon,
} from "./Icons";

export type AvailabilityFilter = "all" | "available" | "reserved";
export type SortKey = "list" | "recent" | "price-asc" | "price-desc";
export type ViewMode = "grid" | "list";

const euros = (n: number) => `${n}\u00A0€`;

const SEGMENTED_CONTAINER =
  "relative items-center p-0.75 gap-0.5 bg-well border border-line-subtle rounded-sm";

const SEGMENTED_PILL =
  "segmented-indicator absolute inset-y-0.75 left-0 rounded-pill bg-segmented-pill shadow-segmented pointer-events-none z-0";

const SEGMENTED_ITEM_BASE =
  "group relative z-10 inline-flex items-center justify-center gap-1.5 min-h-8.5 border border-transparent rounded-pill bg-transparent text-ink-muted text-sm font-medium whitespace-nowrap cursor-pointer transition duration-150 ease-atelier hover:text-ink kb-pressed:text-ink motion-safe:active:scale-97 pointer-coarse:min-h-11 forced-colors:border-canvas-text forced-colors:kb-pressed:border-2 forced-colors:kb-pressed:border-highlight";

const TRIGGER_BASE =
  "group inline-flex items-center gap-2 min-h-10 py-1.5 pr-3 pl-3.5 border rounded-sm text-sm font-medium whitespace-nowrap cursor-pointer transition duration-150 ease-atelier motion-safe:active:scale-97 pointer-coarse:min-h-11 max-sm:flex-1 max-sm:min-w-0";

const TRIGGER_INACTIVE =
  "border-line-subtle bg-card shadow-trigger text-ink-secondary hover:text-ink hover:border-line hover:shadow-control-sheen";

const TRIGGER_ACTIVE =
  "bg-accent-soft border-accent-border text-accent-soft-foreground";

/** Measures the pressed ToggleGroup item so a physical pill glides underneath it. */
function useSlidingPill(track: () => unknown) {
  let groupEl: HTMLElement | undefined;
  const [pill, setPill] = createSignal<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = createSignal(false);

  const measure = () => {
    if (!groupEl) return;
    const active = groupEl.querySelector<HTMLElement>("[data-pressed]");
    if (!active) return;
    const next = { x: active.offsetLeft, w: active.offsetWidth };
    if (next.w <= 0) return;
    setPill((prev) => {
      if (!prev && !animate()) {
        // Enable glide after initial mount position is painted, so the very first click animates
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimate(true));
        });
      }
      return next;
    });
  };

  createEffect(track, () => {
    queueMicrotask(measure);
  });

  onSettled(() => {
    measure();
    if (!groupEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(groupEl);
    return () => ro.disconnect();
  });

  return {
    setRef: (el: HTMLElement) => {
      groupEl = el;
    },
    pill,
    animate,
  };
}

/* --------------------------------------------------------------------------
   Availability: Kobalte ToggleGroup (roving focus, arrow keys + sliding pill)
   -------------------------------------------------------------------------- */

const AVAILABILITY: {
  value: AvailabilityFilter;
  label: string;
  icon: () => JSX.Element;
}[] = [
  { value: "all", label: "Toutes", icon: () => <ListIcon size={14} /> },
  { value: "available", label: "Disponibles", icon: () => <CircleDotIcon size={14} /> },
  { value: "reserved", label: "Réservées", icon: () => <LockIcon size={14} /> },
];

export function AvailabilityToggle(props: {
  value: AvailabilityFilter;
  counts: Record<AvailabilityFilter, number>;
  onChange: (value: AvailabilityFilter) => void;
}) {
  const slider = useSlidingPill(() => [
    props.value,
    props.counts.all,
    props.counts.available,
    props.counts.reserved,
  ]);

  return (
    <ToggleGroup
      ref={slider.setRef}
      class={[SEGMENTED_CONTAINER, "flex w-full sm:inline-flex sm:w-auto"]}
      aria-label="Filtrer par disponibilité"
      value={props.value}
      // Clicking the pressed item would clear the group: always keep one selected
      onChange={(value) => {
        if (value) props.onChange(value as AvailabilityFilter);
      }}
    >
      <Show when={slider.pill()}>
        {(pos) => (
          <span
            class={[SEGMENTED_PILL, { "is-animated": slider.animate() }]}
            aria-hidden="true"
            style={{
              "--pill-x": `${pos().x}px`,
              "--pill-w": `${pos().w}px`,
            }}
          />
        )}
      </Show>
      <For each={AVAILABILITY}>
        {(option) => (
          <ToggleGroup.Item
            class={[
              SEGMENTED_ITEM_BASE,
              "flex-1 sm:flex-none px-1.5 sm:px-3 py-1.5",
              !slider.pill() ? "kb-pressed:bg-segmented-pill kb-pressed:shadow-segmented" : undefined,
            ]}
            value={option.value}
          >
            <span class="hidden xs:inline-flex opacity-72 group-kb-pressed:opacity-100 group-kb-pressed:text-accent">
              {option.icon()}
            </span>
            <span>{option.label}</span>
            <span class="text-sm font-semibold tabular-nums text-ink-muted opacity-85 group-kb-pressed:text-accent-soft-foreground group-kb-pressed:opacity-100">
              {props.counts[option.value]}
            </span>
          </ToggleGroup.Item>
        )}
      </For>
    </ToggleGroup>
  );
}

/* --------------------------------------------------------------------------
   View Mode: Connected grid/list toggle (desktop & tablet)
   -------------------------------------------------------------------------- */

export function ViewModeToggle(props: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  const slider = useSlidingPill(() => props.value);

  return (
    <ToggleGroup
      ref={slider.setRef}
      class={[SEGMENTED_CONTAINER, "hidden sm:inline-flex"]}
      aria-label="Mode d'affichage"
      value={props.value}
      onChange={(value) => {
        if (value) props.onChange(value as ViewMode);
      }}
    >
      <Show when={slider.pill()}>
        {(pos) => (
          <span
            class={[SEGMENTED_PILL, { "is-animated": slider.animate() }]}
            aria-hidden="true"
            style={{
              "--pill-x": `${pos().x}px`,
              "--pill-w": `${pos().w}px`,
            }}
          />
        )}
      </Show>
      <ToggleGroup.Item
        class={[
          SEGMENTED_ITEM_BASE,
          "px-2 py-1.5",
          !slider.pill() ? "kb-pressed:bg-segmented-pill kb-pressed:shadow-segmented" : undefined,
        ]}
        value="list"
        aria-label="Affichage en liste"
        title="Affichage en liste"
      >
        <RowsIcon size={15} />
      </ToggleGroup.Item>
      <ToggleGroup.Item
        class={[
          SEGMENTED_ITEM_BASE,
          "px-2 py-1.5",
          !slider.pill() ? "kb-pressed:bg-segmented-pill kb-pressed:shadow-segmented" : undefined,
        ]}
        value="grid"
        aria-label="Affichage en grille"
        title="Affichage en grille"
      >
        <LayoutGridIcon size={15} />
      </ToggleGroup.Item>
    </ToggleGroup>
  );
}

/* --------------------------------------------------------------------------
   Budget: Popover with a two-thumb Slider, a price histogram and presets
   -------------------------------------------------------------------------- */

const BINS = 18;

export function BudgetFilter(props: {
  value: PriceRange | null;
  ceiling: number;
  prices: number[];
  matchCount: number;
  unpricedCount: number;
  onChange: (value: PriceRange | null) => void;
}) {
  const current = (): [number, number] =>
    props.value
      ? [props.value[0], Math.min(props.value[1], props.ceiling)]
      : [0, props.ceiling];

  const step = () => (props.ceiling > 500 ? 10 : 5);
  const pct = (n: number) => (n / props.ceiling) * 100;

  // Full span means "no filter", so unpriced wishes come back
  const update = (next: readonly number[]) => {
    const [lo, hi] = next;
    props.onChange(lo <= 0 && hi >= props.ceiling ? null : [lo, hi]);
  };

  const rangeLabel = (lo: number, hi: number) => {
    if (lo <= 0 && hi >= props.ceiling) return "Tous les prix";
    if (lo <= 0) return `Jusqu'à ${euros(hi)}`;
    if (hi >= props.ceiling) return `${euros(lo)} et plus`;
    return `${lo} à ${euros(hi)}`;
  };

  const triggerLabel = () =>
    props.value ? rangeLabel(current()[0], current()[1]) : "Budget";

  const bars = createMemo(() => {
    const buckets: number[][] = Array.from({ length: BINS }, () => []);
    for (const price of props.prices) {
      buckets[Math.min(BINS - 1, Math.floor((price / props.ceiling) * BINS))].push(
        price,
      );
    }
    const tallest = Math.max(1, ...buckets.map((b) => b.length));
    return buckets.map((bucket, i) => ({
      height: bucket.length / tallest,
      prices: bucket,
      from: (i * props.ceiling) / BINS,
      to: ((i + 1) * props.ceiling) / BINS,
    }));
  });

  const presets = () =>
    PRICE_PRESETS.filter((p) => p.range[0] < props.ceiling).map((p) => ({
      label: p.label,
      range: [p.range[0], Math.min(p.range[1], props.ceiling)] as const,
    }));

  const isCurrent = (range: readonly [number, number]) =>
    Boolean(props.value) && current()[0] === range[0] && current()[1] === range[1];

  return (
    <Popover placement="bottom-end" gutter={8}>
      <Popover.Trigger
        class={[TRIGGER_BASE, props.value ? TRIGGER_ACTIVE : TRIGGER_INACTIVE]}
      >
        <WalletIcon
          size={15}
          class={["shrink-0", props.value ? "text-accent-soft-foreground" : "text-ink-muted"]}
        />
        <span class="min-w-0 truncate">{triggerLabel()}</span>
        <ChevronDownIcon
          size={14}
          class={[
            "shrink-0 ms-auto transition-transform duration-150 ease-atelier group-kb-expanded:rotate-180",
            props.value ? "text-accent-soft-foreground" : "text-ink-muted",
          ]}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="kb-surface z-50 w-popover p-4.5 bg-card text-ink border border-line-subtle rounded-md shadow-overlay outline-none origin-popover">
          <div class="flex items-center justify-between mb-3">
            <Popover.Title class="m-0 font-display text-heading font-semibold tracking-tight">
              Budget
            </Popover.Title>
            <Show when={props.value}>
              <button
                type="button"
                class="px-2 py-1 -mx-2 -my-1 border-0 rounded-md bg-transparent text-accent-soft-foreground text-sm font-semibold cursor-pointer transition-colors duration-150 ease-atelier hover:bg-accent-soft"
                onClick={() => props.onChange(null)}
              >
                Réinitialiser
              </button>
            </Show>
          </div>

          {/* Two stacked native range inputs: keyboard, touch and screen readers for free.
              (Kobalte 2 alpha Slider ignores prop updates on Solid 2.0.4.) */}
          <div
            style={{ "--lo": `${pct(current()[0])}%`, "--hi": `${pct(current()[1])}%` }}
          >
            <p
              class="mt-0 mb-2.5 font-display text-heading font-semibold tracking-tight tabular-nums"
              aria-live="polite"
            >
              {rangeLabel(current()[0], current()[1])}
            </p>

            {/* Where the prices sit: bars inside the range light up */}
            <div class="flex items-end gap-0.75 h-11 px-2.25" aria-hidden="true">
              <For each={bars()}>
                {(bar) => (
                  <span
                    class={[
                      "price-bar flex-1 rounded-t-xs bg-line transition-colors duration-150 ease-atelier",
                      {
                        "is-in":
                          bar.prices.length > 0
                            ? bar.prices.some(
                                (p) => p >= current()[0] && p <= current()[1],
                              )
                            : bar.to > current()[0] && bar.from < current()[1],
                      },
                    ]}
                    style={{ "--bar-h": `${Math.max(8, bar.height * 100)}%` }}
                  />
                )}
              </For>
            </div>

            <div class="relative h-6">
              <div class="absolute top-1/2 inset-x-2.25 h-1 -mt-0.5 rounded-full bg-line-subtle">
                <div class="price-fill absolute inset-y-0 rounded-full bg-accent" />
              </div>
              <input
                type="range"
                // Overlapping thumbs on the right: the min one must stay grabbable
                class={[
                  "price-input absolute inset-0 w-full h-6 m-0 bg-transparent pointer-events-none outline-none",
                  current()[0] > props.ceiling / 2 ? "z-30" : "z-10",
                ]}
                min={0}
                max={props.ceiling}
                step={step()}
                value={current()[0]}
                aria-label="Prix minimum"
                aria-valuetext={euros(current()[0])}
                onInput={(e) => {
                  const lo = Math.min(Number(e.currentTarget.value), current()[1] - step());
                  e.currentTarget.value = String(lo);
                  update([lo, current()[1]]);
                }}
              />
              <input
                type="range"
                class="price-input absolute inset-0 z-20 w-full h-6 m-0 bg-transparent pointer-events-none outline-none"
                min={0}
                max={props.ceiling}
                step={step()}
                value={current()[1]}
                aria-label="Prix maximum"
                aria-valuetext={
                  current()[1] >= props.ceiling
                    ? `${euros(current()[1])} et plus`
                    : euros(current()[1])
                }
                onInput={(e) => {
                  const hi = Math.max(Number(e.currentTarget.value), current()[0] + step());
                  e.currentTarget.value = String(hi);
                  update([current()[0], hi]);
                }}
              />
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-1.5 mt-4.5"
            role="group"
            aria-label="Tranches rapides"
          >
            <For each={presets()}>
              {(preset) => (
                <button
                  type="button"
                  class={[
                    "px-2.5 py-1.5 pointer-coarse:py-2 border rounded-xs text-sm tabular-nums cursor-pointer transition-colors duration-150 ease-atelier",
                    isCurrent(preset.range)
                      ? "bg-accent-soft border-accent-border-strong text-accent-soft-foreground font-semibold forced-colors:border-2 forced-colors:border-highlight"
                      : "bg-well border-line-subtle text-ink-secondary font-medium hover:text-ink hover:border-line",
                  ]}
                  aria-pressed={isCurrent(preset.range) ? "true" : "false"}
                  onClick={() => update(preset.range)}
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>

          <p
            class="mt-3.5 mb-0 pt-3 border-t border-line-subtle text-sm text-ink-muted"
            aria-live="polite"
          >
            {props.matchCount} {props.matchCount > 1 ? "envies" : "envie"} dans
            ce budget
            <Show when={props.value && props.unpricedCount > 0}>
              <br />
              <span class="text-ink-muted">
                Les envies sans prix sont masquées.
              </span>
            </Show>
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

/* --------------------------------------------------------------------------
   Sort: Kobalte Select (listbox with typeahead and arrow keys)
   -------------------------------------------------------------------------- */

interface SortOption {
  key: SortKey;
  label: string;
  icon: () => JSX.Element;
}

const SORT_OPTIONS: SortOption[] = [
  { key: "list", label: "Ordre de la liste", icon: () => <ListOrderedIcon size={15} /> },
  { key: "recent", label: "Ajouts récents", icon: () => <ClockIcon size={15} /> },
  { key: "price-asc", label: "Prix croissant", icon: () => <ArrowUpNarrowWideIcon size={15} /> },
  { key: "price-desc", label: "Prix décroissant", icon: () => <ArrowDownWideNarrowIcon size={15} /> },
];

export function SortSelect(props: { value: SortKey; onChange: (key: SortKey) => void }) {
  const selected = () =>
    SORT_OPTIONS.find((o) => o.key === props.value) ?? SORT_OPTIONS[0];

  const isActive = () => props.value !== "list";

  return (
    <Select<SortOption>
      options={SORT_OPTIONS}
      optionValue="key"
      optionTextValue="label"
      value={selected()}
      onChange={(option) => {
        if (option) props.onChange(option.key);
      }}
      disallowEmptySelection
      placement="bottom-end"
      gutter={8}
      itemComponent={(itemProps) => (
        <Select.Item
          item={itemProps.item}
          class="group flex items-center gap-2.5 px-2.5 py-2 rounded-xs text-sm text-ink-secondary cursor-pointer outline-none select-none transition-colors duration-150 ease-atelier kb-highlighted:bg-hover kb-highlighted:text-ink"
        >
          <span class="inline-flex text-ink-muted group-kb-selected:text-accent">
            {itemProps.item.rawValue.icon()}
          </span>
          <Select.ItemLabel class="flex-1 group-kb-selected:text-ink group-kb-selected:font-semibold">
            {itemProps.item.rawValue.label}
          </Select.ItemLabel>
          <Select.ItemIndicator class="inline-flex text-accent">
            <CheckIcon size={14} />
          </Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Trigger
        class={[TRIGGER_BASE, isActive() ? TRIGGER_ACTIVE : TRIGGER_INACTIVE]}
        aria-label="Trier"
      >
        <ArrowUpDownIcon
          size={15}
          class={["shrink-0", isActive() ? "text-accent-soft-foreground" : "text-ink-muted"]}
        />
        <Select.Value<SortOption> class="min-w-0 truncate">
          {(state) => state.selectedOption().label}
        </Select.Value>
        <Select.Icon
          class={[
            "inline-flex shrink-0 ms-auto transition-transform duration-150 ease-atelier group-kb-expanded:rotate-180",
            isActive() ? "text-accent-soft-foreground" : "text-ink-muted",
          ]}
        >
          <ChevronDownIcon size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="kb-surface z-50 min-w-56 p-1.5 bg-card text-ink border border-line-subtle rounded-md shadow-overlay outline-none origin-select">
          <Select.Listbox class="m-0 p-0 list-none outline-none" />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
