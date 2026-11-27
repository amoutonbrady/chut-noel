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
      class={["segmented", { "has-indicator": Boolean(slider.pill()) }]}
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
            class={["segmented-indicator", { "is-animated": slider.animate() }]}
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
          <ToggleGroup.Item class="segmented-btn" value={option.value}>
            <span class="segmented-icon">{option.icon()}</span>
            <span class="segmented-label">{option.label}</span>
            <span class="segmented-count">{props.counts[option.value]}</span>
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
      class={[
        "segmented segmented--compact view-toggle",
        { "has-indicator": Boolean(slider.pill()) },
      ]}
      aria-label="Mode d'affichage"
      value={props.value}
      onChange={(value) => {
        if (value) props.onChange(value as ViewMode);
      }}
    >
      <Show when={slider.pill()}>
        {(pos) => (
          <span
            class={["segmented-indicator", { "is-animated": slider.animate() }]}
            aria-hidden="true"
            style={{
              "--pill-x": `${pos().x}px`,
              "--pill-w": `${pos().w}px`,
            }}
          />
        )}
      </Show>
      <ToggleGroup.Item
        class="segmented-btn segmented-btn--icon"
        value="list"
        aria-label="Affichage en liste"
        title="Affichage en liste"
      >
        <RowsIcon size={15} />
      </ToggleGroup.Item>
      <ToggleGroup.Item
        class="segmented-btn segmented-btn--icon"
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
        class={["filter-trigger", { "is-active": Boolean(props.value) }]}
      >
        <WalletIcon size={15} />
        <span class="filter-trigger-label">{triggerLabel()}</span>
        <ChevronDownIcon size={14} class="filter-chevron" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="filter-popover">
          <div class="filter-popover-head">
            <Popover.Title class="filter-popover-title">Budget</Popover.Title>
            <Show when={props.value}>
              <button
                type="button"
                class="link-btn"
                onClick={() => props.onChange(null)}
              >
                Réinitialiser
              </button>
            </Show>
          </div>

          {/* Two stacked native range inputs: keyboard, touch and screen readers for free.
              (Kobalte 2 alpha Slider ignores prop updates on Solid 2.0.4.) */}
          <div
            class="price-slider"
            style={{ "--lo": `${pct(current()[0])}%`, "--hi": `${pct(current()[1])}%` }}
          >
            <p class="price-value" aria-live="polite">
              {rangeLabel(current()[0], current()[1])}
            </p>

            {/* Where the prices sit: bars inside the range light up */}
            <div class="price-histogram" aria-hidden="true">
              <For each={bars()}>
                {(bar) => (
                  <span
                    class={[
                      "price-bar",
                      {
                        "is-in":
                          bar.prices.length > 0
                            ? bar.prices.some(
                                (p) => p >= current()[0] && p <= current()[1],
                              )
                            : bar.to > current()[0] && bar.from < current()[1],
                      },
                    ]}
                    style={{ height: `${Math.max(8, bar.height * 100)}%` }}
                  />
                )}
              </For>
            </div>

            <div class="price-range">
              <div class="price-track">
                <div class="price-fill" />
              </div>
              <input
                type="range"
                class="price-input"
                min={0}
                max={props.ceiling}
                step={step()}
                value={current()[0]}
                aria-label="Prix minimum"
                aria-valuetext={euros(current()[0])}
                // Overlapping thumbs on the right: the min one must stay grabbable
                style={{ "z-index": current()[0] > props.ceiling / 2 ? 3 : 1 }}
                onInput={(e) => {
                  const lo = Math.min(Number(e.currentTarget.value), current()[1] - step());
                  e.currentTarget.value = String(lo);
                  update([lo, current()[1]]);
                }}
              />
              <input
                type="range"
                class="price-input"
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
                style={{ "z-index": 2 }}
                onInput={(e) => {
                  const hi = Math.max(Number(e.currentTarget.value), current()[0] + step());
                  e.currentTarget.value = String(hi);
                  update([current()[0], hi]);
                }}
              />
            </div>
          </div>

          <div class="price-presets" role="group" aria-label="Tranches rapides">
            <For each={presets()}>
              {(preset) => (
                <button
                  type="button"
                  class={["preset-btn", { "is-active": isCurrent(preset.range) }]}
                  aria-pressed={isCurrent(preset.range) ? "true" : "false"}
                  onClick={() => update(preset.range)}
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>

          <p class="filter-popover-foot" aria-live="polite">
            {props.matchCount} {props.matchCount > 1 ? "envies" : "envie"} dans
            ce budget
            <Show when={props.value && props.unpricedCount > 0}>
              <br />
              <span class="filter-popover-note">
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
        <Select.Item item={itemProps.item} class="menu-item">
          <span class="menu-item-icon">{itemProps.item.rawValue.icon()}</span>
          <Select.ItemLabel class="menu-item-label">
            {itemProps.item.rawValue.label}
          </Select.ItemLabel>
          <Select.ItemIndicator class="menu-item-check">
            <CheckIcon size={14} />
          </Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Trigger
        class={["filter-trigger", { "is-active": props.value !== "list" }]}
        aria-label="Trier"
      >
        <ArrowUpDownIcon size={15} />
        <Select.Value<SortOption> class="filter-trigger-label">
          {(state) => state.selectedOption().label}
        </Select.Value>
        <Select.Icon class="filter-chevron">
          <ChevronDownIcon size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="menu-content">
          <Select.Listbox class="menu-listbox" />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
