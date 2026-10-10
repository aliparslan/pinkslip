import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactElement, ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import styles from "./Tabs.module.css";

export interface TabItem<Value extends string> {
  value: Value;
  label: string;
  /** Outline when inactive, filled when active. */
  icon?: PhosphorIcon;
  count?: number;
  /** A link element (the app's router `Link`) when each tab is its own URL;
   * the kit stays router-free. */
  render?: ReactElement;
}

export interface TabsProps<Value extends string> {
  /** Accessible name for the tab list. */
  label: string;
  tabs: ReadonlyArray<TabItem<Value>>;
  value: Value;
  /** Omit for link tabs: the URL is the state. */
  onValueChange?: (value: Value) => void;
  /** `TabPanel`s, one per tab. Link tabs render the route's content instead. */
  children?: ReactNode;
}

/** The segmented view switcher (Saved / Applied). Panels stay unmounted
 * until shown. */
export function Tabs<Value extends string>({ label, tabs, value, onValueChange, children }: TabsProps<Value>) {
  return <BaseTabs.Root value={value} onValueChange={(next) => onValueChange?.(next as Value)}>
    <BaseTabs.List className={styles.list} aria-label={label}>
      {tabs.map((tab) => {
        const Glyph = tab.icon;
        return <BaseTabs.Tab key={tab.value} value={tab.value} className={styles.tab}
          render={tab.render} nativeButton={tab.render ? false : undefined}>
          {Glyph && <Glyph size={17} weight={tab.value === value ? "fill" : "regular"} aria-hidden focusable="false" />}
          <span>{tab.label}</span>
          {tab.count !== undefined && <small className={styles.count}>{tab.count}</small>}
        </BaseTabs.Tab>;
      })}
      <BaseTabs.Indicator className={styles.indicator} />
    </BaseTabs.List>
    {children}
  </BaseTabs.Root>;
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return <BaseTabs.Panel value={value} className={styles.panel}>{children}</BaseTabs.Panel>;
}
